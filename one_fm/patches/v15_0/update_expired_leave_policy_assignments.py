from __future__ import unicode_literals
import frappe
from frappe.utils import getdate, add_days, add_years, today

def execute():
    """
    Update expired leave policy assignments for active employees.
    """
    frappe.log_error("Leave Policy Patch Started", "Leave Policy")
    today_date = getdate(today())

    active_employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")

    if not active_employees:
        return

    latest_assignments = frappe.db.sql("""
        SELECT
            lpa.name,
            lpa.employee,
            lpa.effective_to,
            lpa.leave_policy,
            lpa.carry_forward
        FROM
            `tabLeave Policy Assignment` AS lpa
        WHERE
            lpa.employee IN %(employees)s
            AND lpa.docstatus = 1
        ORDER BY
            lpa.employee, lpa.effective_to DESC
    """, {"employees": active_employees}, as_dict=1)

    latest_assignment_map = {}
    for assignment in latest_assignments:
        if assignment.employee not in latest_assignment_map:
            latest_assignment_map[assignment.employee] = assignment

    for employee, doc in latest_assignment_map.items():
        try:
            effective_to = getdate(doc.effective_to)

            if effective_to < today_date:
                while effective_to < today_date:
                    effective_from = add_days(effective_to, 1)
                    new_effective_to = add_days(add_years(effective_from, 1), -1)

                    # Check for future carry-forward leave allocations
                    leave_types = frappe.get_all("Leave Policy Detail", filters={"parent": doc.leave_policy}, pluck="leave_type")
                    if leave_types:
                        future_allocation_exists = frappe.db.exists("Leave Allocation", {
                            "employee": doc.employee,
                            "leave_type": ("in", leave_types),
                            "from_date": (">", new_effective_to),
                            "docstatus": 1,
                            "carry_forward": 1
                        })
                        if future_allocation_exists:
                            break

                    if not frappe.db.exists("Leave Policy Assignment", {
                        "employee": doc.employee,
                        "effective_from": effective_from,
                        "effective_to": new_effective_to,
                        "docstatus": 1
                    }):
                        leave_policy_assignment = frappe.new_doc('Leave Policy Assignment')
                        leave_policy_assignment.employee = doc.employee
                        leave_policy_assignment.effective_from = effective_from
                        leave_policy_assignment.effective_to = new_effective_to
                        leave_policy_assignment.leave_policy = doc.leave_policy
                        leave_policy_assignment.carry_forward = doc.carry_forward
                        leave_policy_assignment.leaves_allocated = False
                        leave_policy_assignment.save(ignore_permissions=True)
                        leave_policy_assignment.submit()
                        frappe.log_error(f"Created new Leave Policy Assignment for {doc.employee} from {effective_from} to {new_effective_to}", "Leave Policy")

                    effective_to = new_effective_to

        except Exception as e:
            frappe.log_error(f"Failed to create leave policy assignment for employee {doc.employee}: {e}", "Leave Policy Error")
            continue
