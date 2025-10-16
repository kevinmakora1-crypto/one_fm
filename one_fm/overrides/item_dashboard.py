from __future__ import unicode_literals
import frappe
from frappe import _
from erpnext.stock.doctype.item.item_dashboard import get_data as get_item_data

def get_data(item_code, **kwargs):
    data = get_item_data(item_code, **kwargs)

    # Helper function to get count
    def get_count(doctype, item_code):
        return frappe.db.count(doctype, {'items.item_code': item_code, 'docstatus': ('<', 2)})

    # Add Request for Material
    rfm_dict = {
        "name": "Request for Material",
        "label": _("Request for Material"),
        "get_count": lambda: get_count("Request for Material", item_code),
        "doctype": "Request for Material",
    }
    data['transactions'][0]['items'].insert(1, rfm_dict)

    # Add Request for Purchase
    rfp_dict = {
        "name": "Request for Purchase",
        "label": _("Request for Purchase"),
        "get_count": lambda: get_count("Request for Purchase", item_code),
        "doctype": "Request for Purchase",
    }
    data['transactions'][0]['items'].insert(2, rfp_dict)

    return data