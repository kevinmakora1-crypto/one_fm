import frappe

def execute():
    frappe.db.sql("""
        UPDATE `tabEmployee`
        SET `residency_expiry_date` = NULL
        WHERE `pam_type` = 'Kuwaiti'
    """)
