import frappe
from frappe.utils import nowdate

def execute():
    current_year = nowdate().split("-")[0]
    attendance_checks = frappe.get_all(
        "Attendance Check",
        filters={"date": f"{current_year}-11-17", "workflow_state": "Pending Approval"},
        fields=["name"],
    )

    for ac in attendance_checks:
        doc = frappe.get_doc("Attendance Check", ac.name)
        doc.workflow_state = "Approved"
        doc.attendance_status = "Present"
        doc.save(ignore_permissions=True)
