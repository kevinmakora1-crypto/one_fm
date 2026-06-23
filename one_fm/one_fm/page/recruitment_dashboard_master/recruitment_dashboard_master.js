let pageObj = null;
let dashboardData = [];
let charts = {};
let currentFilters = {
	country: null,
	sourceCategory: null,
	offerStatus: null,
	pipelineStage: null
};

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
			charts = {}; // Reset chart references when redrawing
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

				// Initialize charts DOM elements
				initCharts();

				// Apply current filter state to cards, charts, and table
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
		<div class="active-filters-bar" style="display: none; margin-bottom: 20px;">
			<span class="active-filters-label">Active Filters:</span>
			<div class="active-filters-list" style="display: inline-flex; gap: 8px; flex-wrap: wrap; margin-left: 8px;"></div>
			<button class="btn btn-xs btn-default btn-clear-filters" style="margin-left: 10px;">Clear All</button>
		</div>

		<div class="dashboard-summary-grid">
			<div class="summary-card accent-indigo">
				<div class="summary-card-title">Total Active ERFs</div>
				<div class="summary-card-value kpi-active-erfs">0</div>
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

		<div class="dashboard-charts-grid">
			<div class="chart-card">
				<div class="chart-card-title">Job Applicant Pipeline</div>
				<div id="chart-pipeline" class="chart-container"></div>
			</div>
			<div class="chart-card">
				<div class="chart-card-title">Hiring Category (Local vs Overseas)</div>
				<div id="chart-category" class="chart-container"></div>
			</div>
			<div class="chart-card">
				<div class="chart-card-title">Job Applicants by Country</div>
				<div id="chart-country" class="chart-container"></div>
			</div>
			<div class="chart-card">
				<div class="chart-card-title">Job Offer Status</div>
				<div id="chart-offers" class="chart-container"></div>
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

	// Clear filters button handler
	$container.find(".btn-clear-filters").on("click", function() {
		for (let key in currentFilters) {
			currentFilters[key] = null;
		}
		if (pageObj && pageObj.fields_dict.erf_filter) {
			pageObj.fields_dict.erf_filter.set_value("All");
		}
		applyFilters();
	});
}

function initCharts() {
	if (charts.pipeline) return;

	const $pipeline = $("#chart-pipeline");
	if (!$pipeline.length) return;

	charts.pipeline = new frappe.Chart("#chart-pipeline", {
		title: "Job Applicant Pipeline",
		type: "bar",
		height: 220,
		data: {
			labels: ["ERF Count", "Awaiting Response", "Awaiting Visa", "With Visa", "Local Hire", "Joined No PR"],
			datasets: [{ values: [0, 0, 0, 0, 0, 0] }]
		},
		colors: ["#6366f1"],
		barOptions: { spaceRatio: 0.2 },
		isNavigable: 1
	});

	charts.category = new frappe.Chart("#chart-category", {
		title: "Hiring Category",
		type: "donut",
		height: 220,
		data: {
			labels: ["Local", "Overseas"],
			datasets: [{ values: [0, 0] }]
		},
		colors: ["#10b981", "#6366f1"],
		isNavigable: 1
	});

	charts.country = new frappe.Chart("#chart-country", {
		title: "Applicants by Country",
		type: "donut",
		height: 220,
		data: {
			labels: ["No Data"],
			datasets: [{ values: [0] }]
		},
		colors: ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"],
		isNavigable: 1
	});

	charts.offers = new frappe.Chart("#chart-offers", {
		title: "Job Offer Status",
		type: "pie",
		height: 220,
		data: {
			labels: ["Awaiting Response", "Accepted"],
			datasets: [{ values: [0, 0] }]
		},
		colors: ["#f59e0b", "#10b981"],
		isNavigable: 1
	});

	// Connect chart select events
	charts.pipeline.parent.addEventListener('data-select', (e) => {
		if (e.detail && e.detail.label) {
			toggleFilter("pipelineStage", e.detail.label);
		}
	});

	charts.category.parent.addEventListener('data-select', (e) => {
		if (e.detail && e.detail.label) {
			toggleFilter("sourceCategory", e.detail.label);
		}
	});

	charts.country.parent.addEventListener('data-select', (e) => {
		if (e.detail && e.detail.label) {
			toggleFilter("country", e.detail.label);
		}
	});

	charts.offers.parent.addEventListener('data-select', (e) => {
		if (e.detail && e.detail.label) {
			toggleFilter("offerStatus", e.detail.label);
		}
	});
}

function toggleFilter(filterName, filterValue) {
	if (currentFilters[filterName] === filterValue) {
		currentFilters[filterName] = null;
	} else {
		currentFilters[filterName] = filterValue;
	}
	applyFilters();
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

	// 3. Country cross-filter
	if (currentFilters.country) {
		filteredData = filteredData.filter(item => {
			return item.total.nationalities && item.total.nationalities[currentFilters.country] > 0;
		});
	}

	// 4. Source category cross-filter (Local vs Overseas)
	if (currentFilters.sourceCategory) {
		if (currentFilters.sourceCategory === "Local") {
			filteredData = filteredData.filter(item => {
				return (item.total.awaiting_response_local || 0) > 0 || (item.total.local_hire || 0) > 0;
			});
		} else if (currentFilters.sourceCategory === "Overseas") {
			filteredData = filteredData.filter(item => {
				return (item.total.awaiting_response_overseas || 0) > 0 || 
				       (item.total.accepted_with_visa || 0) > 0 || 
				       (item.total.accepted_awaiting_visa || 0) > 0;
			});
		}
	}

	// 5. Job Offer Status cross-filter
	if (currentFilters.offerStatus) {
		if (currentFilters.offerStatus === "Awaiting Response") {
			filteredData = filteredData.filter(item => {
				return (item.total.awaiting_response_local || 0) > 0 || (item.total.awaiting_response_overseas || 0) > 0;
			});
		} else if (currentFilters.offerStatus === "Accepted") {
			filteredData = filteredData.filter(item => {
				return (item.total.local_hire || 0) > 0 || 
				       (item.total.accepted_with_visa || 0) > 0 || 
				       (item.total.accepted_awaiting_visa || 0) > 0;
			});
		}
	}

	// 6. Pipeline stage cross-filter
	if (currentFilters.pipelineStage) {
		const stage = currentFilters.pipelineStage;
		if (stage === "ERF Count") {
			filteredData = filteredData.filter(item => (item.total.erf_count || 0) > 0);
		} else if (stage === "Awaiting Response") {
			filteredData = filteredData.filter(item => {
				return (item.total.awaiting_response_local || 0) > 0 || (item.total.awaiting_response_overseas || 0) > 0;
			});
		} else if (stage === "Awaiting Visa") {
			filteredData = filteredData.filter(item => (item.total.accepted_awaiting_visa || 0) > 0);
		} else if (stage === "With Visa") {
			filteredData = filteredData.filter(item => (item.total.accepted_with_visa || 0) > 0);
		} else if (stage === "Local Hire") {
			filteredData = filteredData.filter(item => (item.total.local_hire || 0) > 0);
		} else if (stage === "Joined No PR") {
			filteredData = filteredData.filter(item => (item.total.joined_without_pr || 0) > 0);
		}
	}

	// Update components
	renderFilterChips();
	updateKpiCards(filteredData);
	updateCharts(filteredData);
	updateTableVisibility(filteredData);
}

function renderFilterChips() {
	const $bar = $(".active-filters-bar");
	const $list = $(".active-filters-list");
	$list.empty();

	let hasActiveFilters = false;
	const keys = {
		country: "Country",
		sourceCategory: "Category",
		offerStatus: "Offer Status",
		pipelineStage: "Pipeline Stage"
	};

	for (let key in keys) {
		if (currentFilters[key]) {
			hasActiveFilters = true;
			const label = keys[key];
			const val = currentFilters[key];
			const chip = $(`
				<span class="filter-chip" data-key="${key}" style="display: inline-flex; align-items: center; background: rgba(99, 102, 241, 0.1); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.2); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; margin-right: 6px;">
					${label}: <strong style="margin-left: 4px; margin-right: 6px;">${val}</strong>
					<span class="filter-chip-remove" style="font-weight: bold; font-size: 14px; margin-left: 2px;">&times;</span>
				</span>
			`);
			chip.on("click", function() {
				currentFilters[key] = null;
				applyFilters();
			});
			$list.append(chip);
		}
	}

	if (hasActiveFilters) {
		$bar.show();
	} else {
		$bar.hide();
	}
}

function updateKpiCards(filteredData) {
	let totalErfs = filteredData.length;
	let activeRequirements = 0;
	let totalPlanned = 0;
	let remainingGap = 0;

	filteredData.forEach(item => {
		activeRequirements += (item.total.erf_count || 0);
		totalPlanned += (item.total.planned || 0);
		remainingGap += (item.total.remaining || 0);
	});

	$(".kpi-active-erfs").text(totalErfs);
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

function updateCharts(filteredData) {
	if (!charts.pipeline) return;

	// 1. Pipeline Chart
	let erfCount = 0;
	let awaiting = 0;
	let awaitingVisa = 0;
	let withVisa = 0;
	let localHire = 0;
	let joinedNoPr = 0;

	filteredData.forEach(item => {
		erfCount += item.total.erf_count || 0;
		awaiting += (item.total.awaiting_response_local || 0) + (item.total.awaiting_response_overseas || 0);
		awaitingVisa += item.total.accepted_awaiting_visa || 0;
		withVisa += item.total.accepted_with_visa || 0;
		localHire += item.total.local_hire || 0;
		joinedNoPr += item.total.joined_without_pr || 0;
	});

	charts.pipeline.update({
		labels: ["ERF Count", "Awaiting Response", "Awaiting Visa", "With Visa", "Local Hire", "Joined No PR"],
		datasets: [{
			values: [erfCount, awaiting, awaitingVisa, withVisa, localHire, joinedNoPr]
		}]
	});

	// 2. Hiring Category Chart
	let local = 0;
	let overseas = 0;

	filteredData.forEach(item => {
		local += (item.total.awaiting_response_local || 0) + (item.total.local_hire || 0);
		overseas += (item.total.awaiting_response_overseas || 0) + (item.total.accepted_with_visa || 0) + (item.total.accepted_awaiting_visa || 0);
	});

	charts.category.update({
		labels: ["Local", "Overseas"],
		datasets: [{
			values: [local, overseas]
		}]
	});

	// 3. Country Chart
	let countries = {};
	filteredData.forEach(item => {
		for (let c in item.total.nationalities) {
			countries[c] = (countries[c] || 0) + item.total.nationalities[c];
		}
	});

	let sortedCountries = Object.keys(countries).map(name => ({
		name: name,
		value: countries[name]
	})).sort((a, b) => b.value - a.value);

	let labels = [];
	let values = [];
	let topN = sortedCountries.slice(0, 8);
	topN.forEach(c => {
		labels.push(c.name);
		values.push(c.value);
	});

	let remainingVal = 0;
	for (let i = 8; i < sortedCountries.length; i++) {
		remainingVal += sortedCountries[i].value;
	}
	if (remainingVal > 0) {
		labels.push("Other");
		values.push(remainingVal);
	}

	charts.country.update({
		labels: labels.length ? labels : ["No Data"],
		datasets: [{
			values: values.length ? values : [0]
		}]
	});

	// 4. Job Offer Status Chart
	let awaitingOffers = 0;
	let acceptedOffers = 0;

	filteredData.forEach(item => {
		awaitingOffers += (item.total.awaiting_response_local || 0) + (item.total.awaiting_response_overseas || 0);
		acceptedOffers += (item.total.local_hire || 0) + (item.total.accepted_with_visa || 0) + (item.total.accepted_awaiting_visa || 0);
	});

	charts.offers.update({
		labels: ["Awaiting Response", "Accepted"],
		datasets: [{
			values: [awaitingOffers, acceptedOffers]
		}]
	});
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

