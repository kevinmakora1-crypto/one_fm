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
	`;
	$container.html(structureHtml);
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


