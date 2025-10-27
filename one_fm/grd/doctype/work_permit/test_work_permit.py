# -*- coding: utf-8 -*-
# Copyright (c) 2020, ONE FM and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest
from frappe.utils import nowdate
from frappe.test_runner import make_test_records

class TestWorkPermit(unittest.TestCase):
    def setUp(self):
        make_test_records("Employee")
        self.active_employee = frappe.get_doc({
            "doctype": "Employee",
            "employee_name": "Test Active Employee",
            "company": "_Test Company",
            "date_of_joining": nowdate(),
            "status": "Active"
        }).insert()

        self.inactive_employee = frappe.get_doc({
            "doctype": "Employee",
            "employee_name": "Test Inactive Employee",
            "company": "_Test Company",
            "date_of_joining": nowdate(),
            "status": "Inactive"
        }).insert()

        self.relieving_employee = frappe.get_doc({
            "doctype": "Employee",
            "employee_name": "Test Relieving Employee",
            "company": "_Test Company",
            "date_of_joining": nowdate(),
            "status": "Active",
            "relieving_date": nowdate()
        }).insert()

    def tearDown(self):
        frappe.db.rollback()

    def test_active_employee_work_permit(self):
        work_permit = frappe.get_doc({
            "doctype": "Work Permit",
            "employee": self.active_employee.name,
            "date_of_application": nowdate()
        })
        self.assertTrue(work_permit.insert())

    def test_inactive_employee_work_permit(self):
        work_permit = frappe.get_doc({
            "doctype": "Work Permit",
            "employee": self.inactive_employee.name,
            "date_of_application": nowdate()
        })
        with self.assertRaises(frappe.ValidationError):
            work_permit.insert()

    def test_relieving_employee_work_permit(self):
        work_permit = frappe.get_doc({
            "doctype": "Work Permit",
            "employee": self.relieving_employee.name,
            "date_of_application": nowdate()
        })
        with self.assertRaises(frappe.ValidationError):
            work_permit.insert()
