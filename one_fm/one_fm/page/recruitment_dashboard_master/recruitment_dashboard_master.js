let pageObj = null;
let dashboardData = [];

frappe.pages["recruitment_dashboard_master"].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Recruitment Dashboard Master",
		single_column: true
	});
	pageObj = page;

	page.set_primary_action("Refresh", () => {
		fetchAndRender(page, wrapper);
	}, "refresh");

	// Add search bar
	const searchField = page.add_field({
		fieldtype: "Data",
		fieldname: "search_filter",
		label: "Search",
		placeholder: "Search by ERF or Designation...",
		change: function() {
			applyFilters();
		}
	});

	// Bind input event for real-time typing search
	setTimeout(() => {
		if (searchField && searchField.$input) {
			searchField.$input.on("input", function() {
				applyFilters();
			});
		}
	}, 200);

	// Add ERF Select dropdown
	page.add_field({
		fieldtype: "Select",
		fieldname: "erf_filter",
		label: "ERF Filter",
		options: ["All"],
		change: function() {
			applyFilters();
		}
	});

	// Trigger initial fetch and render
	fetchAndRender(page, wrapper);
};

function fetchAndRender(page, wrapper) {
	const $body = $(wrapper).find(".layout-main-section, .page-content, .frappe-page-content").first();
	if (!$body.length) return;

	let $dashboard_area = $body.find(".recruitment-dashboard-area");
	if (!$dashboard_area.length) {
		$dashboard_area = $('<div class="recruitment-dashboard-area"></div>').appendTo($body);
	}

	$dashboard_area.html('<div class="text-muted p-5 text-center">Loading recruitment dashboard metrics...</div>');

	frappe.call({
		method: "one_fm.one_fm.page.recruitment_dashboard_master.recruitment_dashboard_master.get_dashboard_data",
		callback: function(r) {
			$dashboard_area.empty();
			if (r.message && !r.message.error) {
				dashboardData = r.message;

				// Populate the ERF filter dropdown
				let erfs = ["All"];
				r.message.forEach(item => {
					if (item.erf_number && !erfs.includes(item.erf_number)) {
						erfs.push(item.erf_number);
					}
				});
				page.fields_dict.erf_filter.df.options = erfs.join("\n");
				page.fields_dict.erf_filter.refresh();

				// Render static container structure
				renderStructure($dashboard_area, r.message);

				// Apply current filter state to cards and table
				applyFilters();
			} else {
				const errMsg = r.message ? r.message.error : "Failed to load data from server";
				$('<div class="alert alert-danger"></div>').text("Error: " + errMsg).appendTo($dashboard_area);
			}
		}
	});
}

function esc(str) {
	if (str === undefined || str === null) return "";
	const div = document.createElement("div");
	div.appendChild(document.createTextNode(String(str)));
	return div.innerHTML;
}

function renderStructure($container, data) {
	if (!data || data.length === 0) {
		$container.html('<div class="text-muted p-5 text-center">No active ERF requirements found.</div>');
		return;
	}

	const structureHtml = `
		<div class="dashboard-summary-grid">
			<div class="summary-card accent-indigo">
				<div class="summary-card-title">PR Count</div>
				<div class="summary-card-value kpi-pr-count">0</div>
			</div>
			<div class="summary-card accent-amber">
				<div class="summary-card-title">Net Requirement (ERF Count)</div>
				<div class="summary-card-value kpi-net-requirement">0</div>
			</div>
			<div class="summary-card accent-emerald">
				<div class="summary-card-title">Total Planned Numbers</div>
				<div class="summary-card-value kpi-total-planned">0</div>
			</div>
			<div class="summary-card accent-indigo">
				<div class="summary-card-title">Remaining Requirement</div>
				<div class="summary-card-value kpi-remaining-gap">0</div>
			</div>
		</div>

		<div class="dashboard-table-wrapper">
			<table class="dashboard-table">
				<thead>
					<tr>
						<th>ERF Number</th>
						<th>Designation</th>
						<th>Gender</th>
						<th>PR Count</th>
						<th>Joined Without PR</th>
						<th>ERF Count</th>
						<th>Awaiting response (Overseas)</th>
						<th>Awaiting response (Local)</th>
						<th>Accepted with Visa</th>
						<th>Accepted awaiting Visa</th>
						<th>Local Hire Accepted</th>
						<th class="highlight-col">Remaining</th>
						<th>Planned Numbers</th>
						<th>Planning Check</th>
					</tr>
				</thead>
				<tbody class="dashboard-rows">
				</tbody>
			</table>
		</div>
	`;
	$container.html(structureHtml);

	const $rows = $container.find(".dashboard-rows");
	data.forEach(item => {
		const erf = esc(item.erf_number);
		const design = esc(item.designation);

		// Render Total Row (Master Row)
		const totalRowHtml = `
			<tr class="erf-row" data-erf="${erf}" data-designation="${design.toLowerCase()}">
				<td><span class="expand-icon"></span>${erf}</td>
				<td>${design}</td>
				<td><span class="gender-badge">Total</span></td>
				<td>${item.total.pr_count}</td>
				<td>${item.total.joined_without_pr}</td>
				<td>${item.total.erf_count}</td>
				<td>${item.total.awaiting_response_overseas}</td>
				<td>${item.total.awaiting_response_local}</td>
				<td>${item.total.accepted_with_visa}</td>
				<td>${item.total.accepted_awaiting_visa}</td>
				<td>${item.total.local_hire}</td>
				<td class="highlight-col">${item.total.remaining}</td>
				<td>${item.total.planned}</td>
				<td><span class="status-badge ${item.total.status_class}">${esc(item.total.planning_check)}</span></td>
			</tr>
		`;
		$rows.append(totalRowHtml);

		// Render Male Row (Child Row)
		const maleRowHtml = `
			<tr class="gender-row male-row" data-erf="${erf}" data-parent-erf="${erf}">
				<td></td>
				<td></td>
				<td><span class="gender-badge gender-male">♂️ Male</span></td>
				<td>${item.male.pr_count}</td>
				<td>${item.male.joined_without_pr}</td>
				<td>${item.male.erf_count}</td>
				<td>${item.male.awaiting_response_overseas}</td>
				<td>${item.male.awaiting_response_local}</td>
				<td>${item.male.accepted_with_visa}</td>
				<td>${item.male.accepted_awaiting_visa}</td>
				<td>${item.male.local_hire}</td>
				<td class="highlight-col">${item.male.remaining}</td>
				<td>${item.male.planned}</td>
				<td><span class="status-badge ${item.male.status_class}">${esc(item.male.planning_check)}</span></td>
			</tr>
		`;
		$rows.append(maleRowHtml);

		// Render Female Row (Child Row)
		const femaleRowHtml = `
			<tr class="gender-row female-row" data-erf="${erf}" data-parent-erf="${erf}">
				<td></td>
				<td></td>
				<td><span class="gender-badge gender-female">♀️ Female</span></td>
				<td>${item.female.pr_count}</td>
				<td>${item.female.joined_without_pr}</td>
				<td>${item.female.erf_count}</td>
				<td>${item.female.awaiting_response_overseas}</td>
				<td>${item.female.awaiting_response_local}</td>
				<td>${item.female.accepted_with_visa}</td>
				<td>${item.female.accepted_awaiting_visa}</td>
				<td>${item.female.local_hire}</td>
				<td class="highlight-col">${item.female.remaining}</td>
				<td>${item.female.planned}</td>
				<td><span class="status-badge ${item.female.status_class}">${esc(item.female.planning_check)}</span></td>
			</tr>
		`;
		$rows.append(femaleRowHtml);
	});

	// Collapse/expand handler
	$container.on("click", ".erf-row", function() {
		const $row = $(this);
		const erf = $row.attr("data-erf");
		const isExpanded = $row.hasClass("expanded");

		if (isExpanded) {
			$row.removeClass("expanded");
			$container.find(`.gender-row[data-parent-erf="${erf}"]`).removeClass("visible");
		} else {
			$row.addClass("expanded");
			$container.find(`.gender-row[data-parent-erf="${erf}"]`).addClass("visible");
		}
	});
}

function applyFilters() {
	const erfVal = pageObj && pageObj.fields_dict.erf_filter ? pageObj.fields_dict.erf_filter.get_value() : "All";
	const searchVal = pageObj && pageObj.fields_dict.search_filter ? (pageObj.fields_dict.search_filter.get_value() || "").trim().toLowerCase() : "";

	let filteredData = dashboardData;

	// 1. ERF Filter dropdown
	if (erfVal && erfVal !== "All") {
		filteredData = filteredData.filter(item => item.erf_number === erfVal);
	}

	// 2. Search box filter
	if (searchVal) {
		filteredData = filteredData.filter(item => {
			return item.erf_number.toLowerCase().indexOf(searchVal) > -1 || 
			       item.designation.toLowerCase().indexOf(searchVal) > -1;
		});
	}

	// Update components
	updateKpiCards(filteredData);
	updateTableVisibility(filteredData);
}

function updateKpiCards(filteredData) {
	let totalPrCount = 0;
	let activeRequirements = 0;
	let totalPlanned = 0;
	let remainingGap = 0;

	filteredData.forEach(item => {
		totalPrCount += (item.total.pr_count || 0);
		activeRequirements += (item.total.erf_count || 0);
		totalPlanned += (item.total.planned || 0);
		remainingGap += (item.total.remaining || 0);
	});

	$(".kpi-pr-count").text(totalPrCount);
	$(".kpi-net-requirement").text(activeRequirements);
	$(".kpi-total-planned").text(totalPlanned);
	$(".kpi-remaining-gap").text(remainingGap);

	const $remainingCard = $(".kpi-remaining-gap").closest(".summary-card");
	$remainingCard.removeClass("accent-indigo accent-rose");
	if (remainingGap < 0) {
		$remainingCard.addClass("accent-rose");
	} else {
		$remainingCard.addClass("accent-indigo");
	}
}

function updateTableVisibility(filteredData) {
	const visibleErfs = new Set(filteredData.map(item => item.erf_number));
	$(".dashboard-rows .erf-row").each(function() {
		const $row = $(this);
		const erf = $row.attr("data-erf");
		if (visibleErfs.has(erf)) {
			$row.show();
			if ($row.hasClass("expanded")) {
				$(`.gender-row[data-parent-erf="${erf}"]`).addClass("visible");
			} else {
				$(`.gender-row[data-parent-erf="${erf}"]`).removeClass("visible");
			}
		} else {
			$row.hide();
			$(`.gender-row[data-parent-erf="${erf}"]`).removeClass("visible");
		}
	});
}


