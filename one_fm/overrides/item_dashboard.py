from __future__ import unicode_literals
import frappe
from frappe import _
from erpnext.stock.doctype.item.item_dashboard import get_data as get_item_data

def get_data(name, **kwargs):
    item_code = name
    data = get_item_data(item_code, **kwargs)

    def get_rfm_count(item_code):
        return frappe.db.sql("""
            SELECT COUNT(parent.name)
            FROM `tabRequest for Material` AS parent
            JOIN `tabRequest for Material Item` AS child ON parent.name = child.parent
            WHERE child.item_code = %s AND parent.docstatus < 2
        """, item_code)[0][0]

    def get_rfp_count(item_code):
        return frappe.db.sql("""
            SELECT COUNT(parent.name)
            FROM `tabRequest for Purchase` AS parent
            JOIN `tabRequest for Purchase Item` AS child ON parent.name = child.parent
            WHERE child.item_code = %s AND parent.docstatus < 2
        """, item_code)[0][0]

    rfm_dict = {
        "name": "Request for Material",
        "label": _("Request for Material"),
        "get_count": lambda: get_rfm_count(item_code),
        "doctype": "Request for Material",
    }
    data['transactions'][0]['items'].insert(1, rfm_dict)

    rfp_dict = {
        "name": "Request for Purchase",
        "label": _("Request for Purchase"),
        "get_count": lambda: get_rfp_count(item_code),
        "doctype": "Request for Purchase",
    }
    data['transactions'][0]['items'].insert(2, rfp_dict)

    return data