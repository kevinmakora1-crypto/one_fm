# -*- coding: utf-8 -*-
# Copyright (c) 2026, ONE FM and contributors
# For license information, please see license.txt

import frappe
from frappe import _

@frappe.whitelist()
def get_dashboard_data():
	"""Fetch and aggregate recruitment metrics grouped by ERF and Gender."""
	# Validate permissions
	allowed_roles = [
		"System Manager", 
		"HR Manager", 
		"HR User", 
		"Recruiter", 
		"Senior Recruiter", 
		"Recruitment Team Leader",
		"Recruitment Team Lead",
		"Interviewer",
		"Administrator"
	]
	if not any(role in frappe.get_roles() for role in allowed_roles):
		frappe.throw(_("Not permitted to access Recruitment Dashboard."), frappe.PermissionError)

	# Fetch active ERFs (docstatus=1, status in Open/Accepted)
	erfs = frappe.get_all(
		"ERF",
		filters={"docstatus": 1, "status": ["in", ["Accepted", "Open"]]},
		fields=["name", "designation"]
	)
	
	erf_designations = {erf.name: erf.designation for erf in erfs}
	designation_to_erf = {}
	for erf in erfs:
		if erf.designation:
			designation_to_erf[erf.designation] = erf.name
			
	erf_names = list(erf_designations.keys())
	
	if not erf_names:
		return []

	# 1. Fetch PMR Count: PMR counts for In Process PMRs.
	# The user requested: "Total number of PMR PER DESIGNATION AS AN ERF VALUE.. ONLY THOSE PRS IN PROCESS"
	pmrs = frappe.get_all(
		"Project Manpower Request",
		filters={"workflow_state": "In Process"},
		fields=["name", "designation", "gender", "number_to_hire"]
	)

	# 2. Get PMRs and Candidates Linked to Completed PMRs
	# This is to compute "Joined Without PR": candidates who joined in CCP, but have not closed any PMR.
	completed_pmrs = frappe.get_all(
		"Project Manpower Request",
		filters={"workflow_state": "Completed"},
		fields=["name"]
	)
	completed_pmr_names = [cp.name for cp in completed_pmrs]
	completed_applicants_set = set()
	if completed_pmr_names:
		linked_to_completed = frappe.get_all(
			"PMR Linked Candidate",
			filters={"parenttype": "Project Manpower Request", "parent": ["in", completed_pmr_names]},
			fields=["job_applicant"]
		)
		completed_applicants_set = {lc.job_applicant for lc in linked_to_completed if lc.job_applicant}

	# 3. Fetch CCPs: In Process and Joined CCPs
	ccps = frappe.get_all(
		"Candidate Country Process",
		filters={"status": ["in", ["In Process", "Joined"]]},
		fields=["name", "erf", "status", "job_applicant", "job_offer"]
	)

	# 4. Fetch Job Offers: Awaiting Response and Accepted Job Offers linked to our active ERFs
	job_offers = frappe.get_all(
		"Job Offer",
		filters={"one_fm_erf": ["in", erf_names], "status": ["in", ["Awaiting Response", "Accepted"]], "docstatus": 1},
		fields=["name", "one_fm_erf", "designation", "status", "job_applicant"]
	)

	# 5. Fetch PAM Visas & Visa Stampings to verify completed visas
	pam_visas = frappe.get_all(
		"PAM Visa",
		filters={"pam_visa_status": "Approved"},
		fields=["candidate_country_process"]
	)
	approved_pam_visas = {pv.candidate_country_process for pv in pam_visas if pv.candidate_country_process}

	visa_stampings = frappe.get_all(
		"Visa Stamping",
		filters={"status": "Stamped"},
		fields=["candidate_country_process"]
	)
	stamped_visas = {vs.candidate_country_process for vs in visa_stampings if vs.candidate_country_process}

	completed_visa_ccps = approved_pam_visas.union(stamped_visas)

	# 6. Fetch Job Applicants (to get gender, local/overseas category, nationality, and source)
	referenced_applicants = set()
	for ccp in ccps:
		if ccp.job_applicant:
			referenced_applicants.add(ccp.job_applicant)
	for offer in job_offers:
		if offer.job_applicant:
			referenced_applicants.add(offer.job_applicant)

	applicant_details = {}
	if referenced_applicants:
		applicants = frappe.get_all(
			"Job Applicant",
			filters={"name": ["in", list(referenced_applicants)]},
			fields=["name", "one_fm_gender", "one_fm_applicant_is_overseas_or_local", "one_fm_nationality", "source"]
		)
		for app in applicants:
			applicant_details[app.name] = {
				"gender": app.one_fm_gender or "Any",
				"is_local": app.one_fm_applicant_is_overseas_or_local == "Local",
				"nationality": app.one_fm_nationality or "Unknown",
				"source": app.source or "Direct"
			}

	def get_applicant_info(applicant_name):
		return applicant_details.get(
			applicant_name, 
			{"gender": "Any", "is_local": False, "nationality": "Unknown", "source": "Direct"}
		)

	# 7. Fetch Recruitment Plans (Planned Numbers)
	rec_plans = frappe.get_all(
		"Recruitment Plan",
		filters={"erf": ["in", erf_names]},
		fields=["erf", "gender", "planned_numbers_to_recruit"]
	)

	# Initialize aggregation structure
	data_map = {}
	for erf_name in erf_names:
		data_map[erf_name] = {
			"erf_number": erf_name,
			"designation": erf_designations[erf_name],
			"total": {
				"erf_number": erf_name, "designation": erf_designations[erf_name], "gender": "Total", "country": "",
				"pr_count": 0, "joined_without_pr": 0, "erf_count": 0, "awaiting_response_overseas": 0, "awaiting_response_local": 0,
				"accepted_with_visa": 0, "accepted_awaiting_visa": 0, "local_hire": 0, "remaining": 0, "planned": 0, "planning_check": "", "status_class": ""
			},
			"male": {
				"erf_number": erf_name, "designation": erf_designations[erf_name], "gender": "Male", "country": "",
				"pr_count": 0, "joined_without_pr": 0, "erf_count": 0, "awaiting_response_overseas": 0, "awaiting_response_local": 0,
				"accepted_with_visa": 0, "accepted_awaiting_visa": 0, "local_hire": 0, "remaining": 0, "planned": 0, "planning_check": "", "status_class": ""
			},
			"female": {
				"erf_number": erf_name, "designation": erf_designations[erf_name], "gender": "Female", "country": "",
				"pr_count": 0, "joined_without_pr": 0, "erf_count": 0, "awaiting_response_overseas": 0, "awaiting_response_local": 0,
				"accepted_with_visa": 0, "accepted_awaiting_visa": 0, "local_hire": 0, "remaining": 0, "planned": 0, "planning_check": "", "status_class": ""
			},
			"countries": {}
		}

	def make_metrics_dict(erf_name, designation, gender, country=None):
		return {
			"erf_number": erf_name,
			"designation": designation,
			"gender": gender,
			"country": country or "",
			"pr_count": 0,
			"joined_without_pr": 0,
			"erf_count": 0,
			"awaiting_response_overseas": 0,
			"awaiting_response_local": 0,
			"accepted_with_visa": 0,
			"accepted_awaiting_visa": 0,
			"local_hire": 0,
			"remaining": 0,
			"planned": 0,
			"planning_check": "",
			"status_class": ""
		}

	def add_metric(erf_name, country, gender, metric_key, val):
		if not val or not erf_name or erf_name not in data_map:
			return
		
		erf_entry = data_map[erf_name]
		designation = erf_entry["designation"]
		
		# Clean and standardize keys
		c_name = (country or "Any").strip()
		if not c_name:
			c_name = "Any"
			
		g_key = (gender or "Any").strip()
		if g_key not in ["Male", "Female"]:
			g_key = "Any"

		# Ensure country dict is initialized
		if c_name not in erf_entry["countries"]:
			erf_entry["countries"][c_name] = {
				"country": c_name,
				"total": make_metrics_dict(erf_name, designation, "Total", c_name),
				"male": make_metrics_dict(erf_name, designation, "Male", c_name),
				"female": make_metrics_dict(erf_name, designation, "Female", c_name)
			}
		
		# Add to country level
		erf_entry["countries"][c_name]["total"][metric_key] += val
		if g_key in ["Male", "Female"]:
			erf_entry["countries"][c_name][g_key.lower()][metric_key] += val

		# Add to overall ERF level
		erf_entry["total"][metric_key] += val
		if g_key in ["Male", "Female"]:
			erf_entry[g_key.lower()][metric_key] += val

	# 1. Aggregate PMRs by designation
	for pmr in pmrs:
		if pmr.designation and pmr.designation in designation_to_erf:
			erf = designation_to_erf[pmr.designation]
			gender = pmr.gender or "Any"
			nationality = pmr.nationality or "Any"
			count = pmr.number_to_hire or 0
			add_metric(erf, nationality, gender, "pr_count", count)

	# 2. Aggregate Joined Without PR
	for ccp in ccps:
		if ccp.status == "Joined":
			# Identify ERF (either ccp.erf or look up via designation in job_offer)
			erf = ccp.erf
			if not erf or erf not in data_map:
				# Try looking up via job offer designation
				if ccp.job_offer:
					jo_designation = frappe.db.get_value("Job Offer", ccp.job_offer, "designation")
					if jo_designation and jo_designation in designation_to_erf:
						erf = designation_to_erf[jo_designation]
			if not erf or erf not in data_map:
				continue

			app_info = get_applicant_info(ccp.job_applicant)
			is_linked_to_completed_pmr = ccp.job_applicant in completed_applicants_set
			
			if not is_linked_to_completed_pmr:
				gender = app_info["gender"]
				nationality = app_info["nationality"]
				add_metric(erf, nationality, gender, "joined_without_pr", 1)

	# 3. Aggregate Job Offers Awaiting Response and Local Hires Accepted
	for offer in job_offers:
		erf = offer.one_fm_erf
		if not erf or erf not in data_map:
			continue
		
		# Verify same designation
		erf_designation = erf_designations[erf]
		if offer.designation != erf_designation:
			continue

		app_info = get_applicant_info(offer.job_applicant)
		gender = app_info["gender"]
		is_local = app_info["is_local"]
		nationality = app_info["nationality"]

		if offer.status == "Awaiting Response":
			metric = "awaiting_response_local" if is_local else "awaiting_response_overseas"
			add_metric(erf, nationality, gender, metric, 1)
		elif offer.status == "Accepted" and is_local:
			add_metric(erf, nationality, gender, "local_hire", 1)

	# 4. Aggregate CCP Visa metrics
	for ccp in ccps:
		if ccp.status == "In Process":
			erf = ccp.erf
			if not erf or erf not in data_map:
				# Try looking up via job offer designation
				if ccp.job_offer:
					jo_designation = frappe.db.get_value("Job Offer", ccp.job_offer, "designation")
					if jo_designation and jo_designation in designation_to_erf:
						erf = designation_to_erf[jo_designation]
			if not erf or erf not in data_map:
				continue

			app_info = get_applicant_info(ccp.job_applicant)
			gender = app_info["gender"]
			is_local = app_info["is_local"]
			nationality = app_info["nationality"]

			if not is_local:
				has_visa = ccp.name in completed_visa_ccps
				metric = "accepted_with_visa" if has_visa else "accepted_awaiting_visa"
				add_metric(erf, nationality, gender, metric, 1)

	# 5. Aggregate Planned Numbers (Recruitment Plan)
	for plan in rec_plans:
		erf = plan.erf
		if not erf or erf not in data_map:
			continue
		gender = plan.gender or "Any"
		planned = plan.planned_numbers_to_recruit or 0
		
		# Add to overall ERF level
		g_key = (gender or "Any").strip()
		if g_key not in ["Male", "Female"]:
			g_key = "Any"
			
		data_map[erf]["total"]["planned"] += planned
		if g_key in ["Male", "Female"]:
			data_map[erf][g_key.lower()]["planned"] += planned

	# 6. Compute Remaining, Planning Check, and Status Class (Second Pass)
	for erf_entry in data_map.values():
		# Calculate overall
		for row in [erf_entry["total"], erf_entry["male"], erf_entry["female"]]:
			row["erf_count"] = row["pr_count"] - row["joined_without_pr"]
			row["remaining"] = (
				row["erf_count"] 
				- row["awaiting_response_overseas"] 
				- row["awaiting_response_local"] 
				- row["accepted_with_visa"] 
				- row["accepted_awaiting_visa"] 
				- row["local_hire"]
			)
			
			diff = row["remaining"] - row["planned"]
			if diff < 0:
				row["planning_check"] = "OK (Overhired)"
				row["status_class"] = "status-grey"
			elif diff == 0:
				if row["planned"] > 0:
					row["planning_check"] = f"OK (Planned {row['planned']})"
				else:
					row["planning_check"] = "OK"
				row["status_class"] = "status-green"
			else: # diff > 0
				row["planning_check"] = "Plan Interviews"
				row["status_class"] = "status-red"

		# Calculate country rows
		for c_entry in erf_entry["countries"].values():
			for row in [c_entry["total"], c_entry["male"], c_entry["female"]]:
				row["erf_count"] = row["pr_count"] - row["joined_without_pr"]
				row["remaining"] = (
					row["erf_count"] 
					- row["awaiting_response_overseas"] 
					- row["awaiting_response_local"] 
					- row["accepted_with_visa"] 
					- row["accepted_awaiting_visa"] 
					- row["local_hire"]
				)
				
				diff = row["remaining"] - row["planned"]
				if diff < 0:
					row["planning_check"] = "OK (Overhired)"
					row["status_class"] = "status-grey"
				elif diff == 0:
					if row["planned"] > 0:
						row["planning_check"] = f"OK (Planned {row['planned']})"
					else:
						row["planning_check"] = "OK"
					row["status_class"] = "status-green"
				else: # diff > 0
					row["planning_check"] = "Plan Interviews"
					row["status_class"] = "status-red"

	# Format output
	output = []
	for erf in erf_names:
		erf_entry = data_map[erf]
		
		country_list = []
		for c_name, c_data in erf_entry["countries"].items():
			country_list.append({
				"country": c_name,
				"total": c_data["total"],
				"male": c_data["male"],
				"female": c_data["female"]
			})
			
		erf_data = {
			"erf_number": erf,
			"designation": erf_entry["designation"],
			"total": erf_entry["total"],
			"male": erf_entry["male"],
			"female": erf_entry["female"],
			"countries": country_list
		}
		output.append(erf_data)

	return output

