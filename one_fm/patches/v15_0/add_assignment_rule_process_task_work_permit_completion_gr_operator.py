import frappe
from frappe.utils import today
from one_fm.setup.assignment_rule import create_assignment_rule, get_assignment_rule_json_file
from one_fm.custom.workflow.workflow import get_workflow_json_file, create_workflow

def execute():
    process_task_name = create_process_task()
    assignment_rule_data = get_assignment_rule_json_file("work_permit_completion_gr_operator.json")
    if process_task_name:
        assignment_rule_data["custom_routine_task"] = process_task_name
    create_assignment_rule(assignment_rule_data)
    create_workflow(get_workflow_json_file("work_permit.json"))


def create_process_task():
    process_name = "Residency"
    if not frappe.db.exists("Process", process_name):
        frappe.get_doc({
            "process_name": process_name,
            "description": process_name,
            "doctype": "Process",
            "process_owner_name": "Administrator",
            "process_owner": "Administrator"
        }).insert(ignore_permissions=True)

    task_type = "Repetitive"
    if not frappe.db.exists("Task Type", task_type):
        frappe.get_doc({
            "name": task_type,
            "is_routine_task": 0,
            "doctype": "Task Type"
        }).insert(ignore_permissions=True)

    process_task = frappe.get_doc({
        "naming_series": "P-TASK-.YYYY.-",
        "process_name": process_name,
        "is_erp_task": 1,
        "is_automated": 0,
        "is_active": 1,
        "erp_document": "Work Permit",
        "task": "Set new Work Permit Expiry Date and mark as completed.",
        "task_type": "Repetitive",
        "frequency": "",
        "repeat_on_day": 0,
        "repeat_on_last_day": 0,
        "hours_per_frequency": 0.0,
        "coordination_needed": "No",
        "employee": "HR-EMP-00114",
        "employee_name": "Ambrin Akbar Ali",
        "employee_user": "a.ali@armor-services.com",
        "department": "Human Resources - ONEFM",
        "start_date": today(),
        "report_frequency": "",
        "doctype": "Process Task",
        "coordination_method": [],
        "repeat_on_days": []
    }).insert(ignore_permissions=True)
    return process_task.name