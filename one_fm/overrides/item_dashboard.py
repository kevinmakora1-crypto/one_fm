def get_data(**kwargs):
    data = kwargs.get('data')

    if data and 'transactions' in data and len(data['transactions']) > 3:
        buy_group_details = data['transactions'][3]
        buy_items = buy_group_details.get('items', [])
        buy_items = buy_items[:1] + ["Request for Material", "Request for Purchase"] + buy_items[1:]
        buy_group = {
            **buy_group_details,
            "items": buy_items
        }
        data['transactions'][3] = buy_group

    return data