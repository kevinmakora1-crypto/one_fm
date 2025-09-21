import frappe

def execute():
    """
    Approve all pending Attendance Check records for 10, 11, and 12 September 2025.
    """
    dates = ["2025-09-10", "2025-09-11", "2025-09-12"]
    attendance_checks = frappe.get_all(
        "Attendance Check",
        filters={
            "date": ["in", dates],
            "docstatus": 0,
            "workflow_state": ["in", ["Pending Approval"]]
        },
        fields=["name"]
    )

    if not attendance_checks:
        print("No pending Attendance Check records found for the specified dates.")
        return

    approved_count = 0
    for ac in attendance_checks:
        try:
            doc = frappe.get_doc("Attendance Check", ac.name)
            if hasattr(doc, "workflow_state"):
                doc.workflow_state = "Approved"
            doc.flags.ignore_mandatory = True
            doc.save(ignore_permissions=True)
            doc.submit()
            approved_count += 1
        except Exception:
            frappe.log_error(title=f"Failed to approve Attendance Check {ac.name}", message=frappe.get_traceback())

    print(f"Approved {approved_count} Attendance Check records for 10, 11, and 12 September 2025.")