import frappe
from frappe import _

def get_data(chart_name, filters=None):
    if filters and filters.get("nationality"):
        nationality = filters.get("nationality")
        data = frappe.db.sql(
            """
            SELECT
                designation,
                COUNT(name) AS count
            FROM
                `tabEmployee`
            WHERE
                status = 'Active'
                AND designation IS NOT NULL
                AND nationality = %(nationality)s
            GROUP BY
                designation
            ORDER BY
                count DESC
            """,
            {"nationality": nationality},
            as_dict=True,
        )
        return {
            "labels": [d.designation for d in data],
            "datasets": [{"name": _("Employees by Designation for {0}").format(nationality), "values": [d.count for d in data]}],
        }
    else:
        data = frappe.db.sql(
            """
            SELECT
                nationality,
                COUNT(name) AS count
            FROM
                `tabEmployee`
            WHERE
                status = 'Active'
                AND nationality IS NOT NULL
            GROUP BY
                nationality
            ORDER BY
                count DESC
            """,
            as_dict=True,
        )
        return {
            "labels": [d.nationality for d in data],
            "datasets": [{"name": _("Employees by Nationality"), "values": [d.count for d in data]}],
        }
