# -*- coding: utf-8 -*-
# Copyright (c) 2026, ONE FM and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch
from one_fm.one_fm.page.recruitment_dashboard_master.recruitment_dashboard_master import get_dashboard_data

class TestRecruitmentDashboard(FrappeTestCase):
	@patch("frappe.get_roles")
	@patch("frappe.get_all")
	def test_get_dashboard_data_unauthorized(self, mock_get_all, mock_get_roles):
		mock_get_roles.return_value = ["Guest"]
		self.assertRaises(frappe.PermissionError, get_dashboard_data)

	@patch("frappe.get_roles")
	@patch("frappe.get_all")
	def test_get_dashboard_data_aggregation(self, mock_get_all, mock_get_roles):
		mock_get_roles.return_value = ["System Manager"]

		mock_erf = [frappe._dict({"name": "ERF-2026-00043", "designation": "Security Guard"})]
		
		# PMRs in Process (Total 52: Male 51, Female 1)
		mock_pmr = [
			frappe._dict({"name": "PMR-001", "erf": "ERF-2026-00043", "designation": "Security Guard", "gender": "Male", "count": 51}),
			frappe._dict({"name": "PMR-002", "erf": "ERF-2026-00043", "designation": "Security Guard", "gender": "Female", "count": 1})
		]

		# PMR Linked Candidates
		mock_linked = []

		# CCP: status Joined (but not linked to completed PMR -> Joined Without PR)
		mock_ccp = [
			frappe._dict({"name": "CCP-001", "erf": "ERF-2026-00043", "status": "Joined", "job_applicant": "JA-001", "job_offer": "JO-001"}),
			# Also an In Process candidate (Accepted offer, awaiting visa)
			frappe._dict({"name": "CCP-002", "erf": "ERF-2026-00043", "status": "In Process", "job_applicant": "JA-002", "job_offer": "JO-002"}),
			# Another In Process candidate (with visa)
			frappe._dict({"name": "CCP-003", "erf": "ERF-2026-00043", "status": "In Process", "job_applicant": "JA-003", "job_offer": "JO-003"})
		]

		# Job Offers: Awaiting Response (Overseas = 1)
		mock_offers = [
			frappe._dict({"name": "JO-001", "one_fm_erf": "ERF-2026-00043", "designation": "Security Guard", "status": "Accepted", "job_applicant": "JA-001"}),
			frappe._dict({"name": "JO-002", "one_fm_erf": "ERF-2026-00043", "designation": "Security Guard", "status": "Accepted", "job_applicant": "JA-002"}),
			frappe._dict({"name": "JO-003", "one_fm_erf": "ERF-2026-00043", "designation": "Security Guard", "status": "Accepted", "job_applicant": "JA-003"}),
			# An Awaiting Response offer (Overseas)
			frappe._dict({"name": "JO-004", "one_fm_erf": "ERF-2026-00043", "designation": "Security Guard", "status": "Awaiting Response", "job_applicant": "JA-004"})
		]

		# PAM Visa Approved for CCP-003
		mock_pam_visa = [frappe._dict({"candidate_country_process": "CCP-003"})]
		# Visa Stamping Stamped
		mock_visa_stamping = []

		# Job Applicants details
		mock_applicants = [
			frappe._dict({"name": "JA-001", "one_fm_gender": "Male", "one_fm_applicant_is_overseas_or_local": "Overseas"}),
			frappe._dict({"name": "JA-002", "one_fm_gender": "Male", "one_fm_applicant_is_overseas_or_local": "Overseas"}),
			frappe._dict({"name": "JA-003", "one_fm_gender": "Male", "one_fm_applicant_is_overseas_or_local": "Overseas"}),
			frappe._dict({"name": "JA-004", "one_fm_gender": "Male", "one_fm_applicant_is_overseas_or_local": "Overseas"})
		]

		mock_rec_plans = []

		def side_effect(doctype, *args, **kwargs):
			filters = kwargs.get("filters", {})
			if doctype == "ERF":
				return mock_erf
			elif doctype == "Project Manpower Request":
				if isinstance(filters, dict) and filters.get("workflow_state") == "Completed":
					return []
				return mock_pmr
			elif doctype == "PMR Linked Candidate":
				return mock_linked
			elif doctype == "Candidate Country Process":
				return mock_ccp
			elif doctype == "Job Offer":
				return mock_offers
			elif doctype == "PAM Visa":
				return mock_pam_visa
			elif doctype == "Visa Stamping":
				return mock_visa_stamping
			elif doctype == "Job Applicant":
				return mock_applicants
			elif doctype == "Recruitment Plan":
				return mock_rec_plans
			return []

		mock_get_all.side_effect = side_effect

		res = get_dashboard_data()
		self.assertEqual(len(res), 1)
		erf_row = res[0]
		self.assertEqual(erf_row["erf_number"], "ERF-2026-00043")
		self.assertEqual(erf_row["designation"], "Security Guard")

		# Check Total Row
		total = erf_row["total"]
		self.assertEqual(total["pr_count"], 52)
		self.assertEqual(total["joined_without_pr"], 1)
		self.assertEqual(total["erf_count"], 51)
		self.assertEqual(total["awaiting_response_overseas"], 1)
		self.assertEqual(total["awaiting_response_local"], 0)
		self.assertEqual(total["accepted_with_visa"], 1)
		self.assertEqual(total["accepted_awaiting_visa"], 1)
		self.assertEqual(total["local_hire"], 0)
		
		# Remaining requirement: erf_count (51) - awaiting (1) - accepted_with_visa (1) - accepted_awaiting_visa (1) = 48
		self.assertEqual(total["remaining"], 48)
		self.assertEqual(total["planned"], 0)
		self.assertEqual(total["planning_check"], "Plan Interviews")

		# Check Male Row
		male = erf_row["male"]
		self.assertEqual(male["pr_count"], 51)
		self.assertEqual(male["joined_without_pr"], 1)
		self.assertEqual(male["erf_count"], 50)
		self.assertEqual(male["awaiting_response_overseas"], 1)
		self.assertEqual(male["accepted_with_visa"], 1)
		self.assertEqual(male["accepted_awaiting_visa"], 1)
		self.assertEqual(male["remaining"], 47)
		self.assertEqual(male["planning_check"], "Plan Interviews")

		# Check Female Row
		female = erf_row["female"]
		self.assertEqual(female["pr_count"], 1)
		self.assertEqual(female["joined_without_pr"], 0)
		self.assertEqual(female["erf_count"], 1)
		self.assertEqual(female["awaiting_response_overseas"], 0)
		self.assertEqual(female["remaining"], 1)
		self.assertEqual(female["planning_check"], "Plan Interviews")

