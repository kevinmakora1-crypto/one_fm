# -*- coding: utf-8 -*-
# Copyright (c) 2026, ONE FM and contributors
# For license information, please see license.txt

import frappe
from frappe import _

@frappe.whitelist()
def get_dashboard_data():
	"""Fetch and aggregate recruitment metrics grouped by ERF and Gender."""
	# Validate permissions
	allowed_roles = ["System Manager", "HR Manager", "HR User", "Recruiter", "Senior Recruiter"]
	if not any(role in frappe.get_roles() for role in allowed_roles):
		frappe.throw(_("Not permitted to access Recruitment Dashboard."), frappe.PermissionError)

	# Fetch all active ERFs
	erfs = frappe.get_all("ERF", filters={"docstatus": 1, "status": "Accepted"}, fields=["name", "designation"])
	
	erf_designations = {erf.name: erf.designation for erf in erfs}
	erf_names = list(erf_designations.keys())
	
	if not erf_names:
		return []

	# 1. Fetch PMR Count: PMR counts for In Process PMRs linked to our ERFs
	pmrs = frappe.get_all(
		"Project Manpower Request",
		filters={"erf": ["in", erf_names], "workflow_state": "In Process"},
		fields=["name", "erf", "gender", "count"]
	)

	# 2. Fetch PMR Linked Candidates to find linked candidates
	linked_candidates = frappe.get_all(
		"PMR Linked Candidate",
		filters={"parenttype": "Project Manpower Request"},
		fields=["parent", "job_applicant"]
	)
	linked_applicants_set = {lc.job_applicant for lc in linked_candidates if lc.job_applicant}

	# 3. Fetch CCPs: In Process and Joined CCPs linked to our ERFs
	ccps = frappe.get_all(
		"Candidate Country Process",
		filters={"erf": ["in", erf_names], "status": ["in", ["In Process", "Joined"]]},
		fields=["name", "erf", "status", "job_applicant", "job_offer"]
	)

	# 4. Fetch Job Offers: Awaiting Response and Accepted Job Offers linked to our ERFs
	job_offers = frappe.get_all(
		"Job Offer",
		filters={"one_fm_erf": ["in", erf_names], "status": ["in", ["Awaiting Response", "Accepted"]], "docstatus": 1},
		fields=["name", "one_fm_erf", "status", "job_applicant"]
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

	# 6. Fetch Job Applicants (to get gender and local/overseas category)
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
			fields=["name", "gender", "one_fm_applicant_is_overseas_or_local"]
		)
		for app in applicants:
			applicant_details[app.name] = {
				"gender": app.gender or "Any",
				"is_local": app.one_fm_applicant_is_overseas_or_local == "Local"
			}

	def get_applicant_info(applicant_name):
		return applicant_details.get(applicant_name, {"gender": "Any", "is_local": False})

	# 7. Fetch Recruitment Plans (Planned Numbers)
	rec_plans = frappe.get_all(
		"Recruitment Plan",
		filters={"erf": ["in", erf_names]},
		fields=["erf", "gender", "planned_numbers_to_recruit"]
	)

	# Initialize aggregation dict
	data = {}
	for erf_name in erf_names:
		data[erf_name] = {}
		for gender in ["Total", "Male", "Female"]:
			data[erf_name][gender] = {
				"erf_number": erf_name,
				"designation": erf_designations[erf_name],
				"gender": gender,
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

	# Aggregate PMRs
	for pmr in pmrs:
		erf = pmr.erf
		gender = pmr.gender or "Any"
		count = pmr.count or 0
		
		data[erf]["Total"]["pr_count"] += count
		if gender in ["Male", "Female"]:
			data[erf][gender]["pr_count"] += count

	# Aggregate Joined Without PR
	for ccp in ccps:
		if ccp.status == "Joined":
			erf = ccp.erf
			if not erf or erf not in data:
				continue
			app_info = get_applicant_info(ccp.job_applicant)
			is_linked = ccp.job_applicant in linked_applicants_set
			
			if not is_linked:
				gender = app_info["gender"]
				data[erf]["Total"]["joined_without_pr"] += 1
				if gender in ["Male", "Female"]:
					data[erf][gender]["joined_without_pr"] += 1

	# Compute ERF Count
	for erf in data:
		for gender in data[erf]:
			row = data[erf][gender]
			row["erf_count"] = row["pr_count"] - row["joined_without_pr"]

	# Aggregate Job Offers Awaiting Response and Local Hires Accepted
	for offer in job_offers:
		erf = offer.one_fm_erf
		if not erf or erf not in data:
			continue
		app_info = get_applicant_info(offer.job_applicant)
		gender = app_info["gender"]
		is_local = app_info["is_local"]

		if offer.status == "Awaiting Response":
			if is_local:
				data[erf]["Total"]["awaiting_response_local"] += 1
				if gender in ["Male", "Female"]:
					data[erf][gender]["awaiting_response_local"] += 1
			else:
				data[erf]["Total"]["awaiting_response_overseas"] += 1
				if gender in ["Male", "Female"]:
					data[erf][gender]["awaiting_response_overseas"] += 1
		elif offer.status == "Accepted" and is_local:
			data[erf]["Total"]["local_hire"] += 1
			if gender in ["Male", "Female"]:
				data[erf][gender]["local_hire"] += 1

	# Aggregate CCP Visa metrics
	for ccp in ccps:
		if ccp.status == "In Process":
			erf = ccp.erf
			if not erf or erf not in data:
				continue
			app_info = get_applicant_info(ccp.job_applicant)
			gender = app_info["gender"]
			is_local = app_info["is_local"]

			if not is_local:
				has_visa = ccp.name in completed_visa_ccps
				if has_visa:
					data[erf]["Total"]["accepted_with_visa"] += 1
					if gender in ["Male", "Female"]:
						data[erf][gender]["accepted_with_visa"] += 1
				else:
					data[erf]["Total"]["accepted_awaiting_visa"] += 1
					if gender in ["Male", "Female"]:
						data[erf][gender]["accepted_awaiting_visa"] += 1

	# Compute Remaining Requirement
	for erf in data:
		for gender in data[erf]:
			row = data[erf][gender]
			row["remaining"] = (
				row["erf_count"] 
				- row["awaiting_response_overseas"] 
				- row["awaiting_response_local"] 
				- row["accepted_with_visa"] 
				- row["accepted_awaiting_visa"] 
				- row["local_hire"]
			)

	# Aggregate Planned Numbers (Recruitment Plan)
	for plan in rec_plans:
		erf = plan.erf
		if not erf or erf not in data:
			continue
		gender = plan.gender or "Any"
		planned = plan.planned_numbers_to_recruit or 0

		data[erf]["Total"]["planned"] += planned
		if gender in ["Male", "Female"]:
			data[erf][gender]["planned"] += planned

	# Compute Planning Check and Status Class
	for erf in data:
		for gender in data[erf]:
			row = data[erf][gender]
			r = row["remaining"]
			p = row["planned"]

			if r < 0:
				row["planning_check"] = "OK (Overhired)"
				row["status_class"] = "status-grey"
			elif r == 0:
				if p == 0:
					row["planning_check"] = "OK (Planned 0)"
					row["status_class"] = "status-green"
				else:
					row["planning_check"] = f"OK [Planned 0 + Buffer is {p}]"
					row["status_class"] = "status-green"
			else: # r > 0
				if p >= r:
					buffer = p - r
					if buffer == 0:
						row["planning_check"] = f"OK (Planned {r})"
					else:
						row["planning_check"] = f"OK [Planned {r} + Buffer is {buffer}]"
					row["status_class"] = "status-green"
				else: # p < r
					row["planning_check"] = "Plan Interviews"
					row["status_class"] = "status-red"

	# Format output
	output = []
	for erf in erf_names:
		erf_data = {
			"erf_number": erf,
			"designation": erf_designations[erf],
			"total": data[erf]["Total"],
			"male": data[erf]["Male"],
			"female": data[erf]["Female"]
		}
		output.append(erf_data)

	return output
