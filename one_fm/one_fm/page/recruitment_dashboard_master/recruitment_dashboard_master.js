let pageObj = null;
let dashboardData = [];
let chartFunnel = null;
let chartNationality = null;
let chartGap = null;

let activeFilters = {
	stage: null,
	nationality: null,
	designation: null
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

	// Bind tree collapsible controls
	$(wrapper).on("click", ".row-erf", function() {
		const erf = $(this).attr("data-erf");
		const isExpanded = $(this).hasClass("expanded");
		
		if (isExpanded) {
			$(this).removeClass("expanded");
			$(this).find(".toggle-icon").text("▶");
			$(`.tree-row[data-erf="${erf}"]`).not(".row-erf").addClass("hidden").removeClass("expanded");
			$(`.tree-row[data-erf="${erf}"]`).find(".toggle-icon").text("▶");
		} else {
			$(this).addClass("expanded");
			$(this).find(".toggle-icon").text("▼");
			$(`.row-gender[data-erf="${erf}"]`).removeClass("hidden");
			$(`.row-country-header[data-erf="${erf}"]`).removeClass("hidden");
		}
	});

	$(wrapper).on("click", ".row-country-header", function() {
		const erf = $(this).attr("data-erf");
		const isExpanded = $(this).hasClass("expanded");
		
		if (isExpanded) {
			$(this).removeClass("expanded");
			$(this).find(".toggle-icon").text("▶");
			$(`.row-country-total[data-erf="${erf}"]`).addClass("hidden").removeClass("expanded");
			$(`.row-country-total[data-erf="${erf}"]`).find(".toggle-icon").text("▶");
			$(`.row-country-detail[data-erf="${erf}"]`).addClass("hidden");
		} else {
			$(this).addClass("expanded");
			$(this).find(".toggle-icon").text("▼");
			$(`.row-country-total[data-erf="${erf}"]`).removeClass("hidden");
		}
	});

	$(wrapper).on("click", ".row-country-total", function() {
		const erf = $(this).attr("data-erf");
		const country = $(this).attr("data-country");
		const isExpanded = $(this).hasClass("expanded");
		
		if (isExpanded) {
			$(this).removeClass("expanded");
			$(this).find(".toggle-icon").text("▶");
			$(`.row-country-detail[data-erf="${erf}"][data-country="${country}"]`).addClass("hidden");
		} else {
			$(this).addClass("expanded");
			$(this).find(".toggle-icon").text("▼");
			$(`.row-country-detail[data-erf="${erf}"][data-country="${country}"]`).removeClass("hidden");
		}
	});

	$(wrapper).on("click", ".clear-all-filters-btn", function() {
		clearAllFilters();
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

				// Populate the ERF filter dropdown with only "In Process" ERFs and append designation
				let erfs = ["All"];
				r.message.forEach(item => {
					if (item.erf_number && item.total && (item.total.pr_count > 0)) {
						const optionText = `${item.erf_number} - ${item.designation || ""}`;
						if (!erfs.includes(optionText)) {
							erfs.push(optionText);
						}
					}
				});
				page.fields_dict.erf_filter.df.options = erfs.join("\n");
				page.fields_dict.erf_filter.refresh();

				// Reset charts
				chartFunnel = null;
				chartNationality = null;
				chartGap = null;

				// Render static container structure
				renderStructure($dashboard_area, r.message);

				// Apply current filter state
				applyFilters();
			} else {
				const errMsg = r.message ? r.message.error : "Failed to load data from server";
				$('<div class="alert alert-danger"></div>').text("Error: " + errMsg).appendTo($dashboard_area);
			}
		}
	});
}

function renderStructure($container, data) {
	if (!data || data.length === 0) {
		$container.html('<div class="text-muted p-5 text-center">No active ERF requirements found.</div>');
		return;
	}

	const structureHtml = `
		<div class="active-filters-bar hidden p-3 mb-4 bg-light rounded d-flex align-items-center justify-content-between">
			<div>
				<span class="active-filters-label font-weight-bold text-muted mr-3">Active Filters:</span>
				<span class="active-filters-chips"></span>
			</div>
			<button class="btn btn-xs btn-default clear-all-filters-btn">Clear All</button>
		</div>

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

		<div class="dashboard-charts-grid mt-5">
			<div class="chart-card" id="chart-funnel-card">
				<div class="chart-card-title">Conversion Funnel</div>
				<div id="chart-funnel"></div>
			</div>
			<div class="chart-card" id="chart-nationality-card">
				<div class="chart-card-title">Nationality Demographics</div>
				<div id="chart-nationality"></div>
			</div>
			<div class="chart-card" id="chart-gap-card">
				<div class="chart-card-title">Hiring Gaps (PR vs Remaining)</div>
				<div id="chart-gap"></div>
			</div>
		</div>

		<div class="table-card mt-5">
			<div class="table-card-title p-3 font-weight-bold" style="font-size: 16px; border-bottom: 1px solid #f1f3f5;">Detailed Requirements Grid</div>
			<div class="table-responsive">
				<table class="table tree-table mb-0">
					<thead>
						<tr>
							<th style="min-width: 250px;">ERF / Designation</th>
							<th>Gender</th>
							<th>PR Count</th>
							<th>Joined Without PR</th>
							<th>ERF Count</th>
							<th>Awaiting (Overseas)</th>
							<th>Awaiting (Local)</th>
							<th>Accepted with Visa</th>
							<th>Awaiting Visa</th>
							<th>Local Hire</th>
							<th>Remaining</th>
							<th>Planned</th>
							<th>Planning Check</th>
						</tr>
					</thead>
					<tbody class="tree-table-body">
					</tbody>
				</table>
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
		const selectedErf = erfVal.split(" - ")[0];
		filteredData = filteredData.filter(item => item.erf_number === selectedErf);
	}

	// 2. Search box filter
	if (searchVal) {
		filteredData = filteredData.filter(item => {
			return item.erf_number.toLowerCase().indexOf(searchVal) > -1 || 
			       item.designation.toLowerCase().indexOf(searchVal) > -1;
		});
	}

	// 3. Cross-filters from charts
	if (activeFilters.designation) {
		filteredData = filteredData.filter(item => item.designation === activeFilters.designation);
	}

	// Clone and apply demographic/stage filtering to counts
	let processedData = filteredData.map(item => {
		let clonedItem = JSON.parse(JSON.stringify(item));
		
		if (activeFilters.nationality) {
			clonedItem.countries = (clonedItem.countries || []).filter(c => c.country === activeFilters.nationality);
			
			if (clonedItem.countries.length > 0) {
				const c = clonedItem.countries[0];
				clonedItem.total = JSON.parse(JSON.stringify(c.total));
				clonedItem.male = JSON.parse(JSON.stringify(c.male));
				clonedItem.female = JSON.parse(JSON.stringify(c.female));
			} else {
				clonedItem.total = zeroMetrics(clonedItem.total);
				clonedItem.male = zeroMetrics(clonedItem.male);
				clonedItem.female = zeroMetrics(clonedItem.female);
			}
		}
		
		if (activeFilters.stage) {
			const keepKeys = getStageMetricKeys(activeFilters.stage);
			const allStageKeys = [
				"awaiting_response_overseas", "awaiting_response_local", 
				"accepted_with_visa", "accepted_awaiting_visa", "local_hire"
			];
			
			const zeroOtherStages = (row) => {
				allStageKeys.forEach(k => {
					if (!keepKeys.includes(k)) {
						row[k] = 0;
					}
				});
				row.remaining = row.erf_count - keepKeys.reduce((sum, k) => sum + (row[k] || 0), 0);
			};
			
			zeroOtherStages(clonedItem.total);
			zeroOtherStages(clonedItem.male);
			zeroOtherStages(clonedItem.female);
			
			(clonedItem.countries || []).forEach(c => {
				zeroOtherStages(c.total);
				zeroOtherStages(c.male);
				zeroOtherStages(c.female);
			});
		}
		
		return clonedItem;
	});

	// Update components
	updateKpiCards(processedData);
	renderCharts(processedData);
	renderTreeTable(processedData);
}

function zeroMetrics(row) {
	const keys = [
		"pr_count", "joined_without_pr", "erf_count", "awaiting_response_overseas", 
		"awaiting_response_local", "accepted_with_visa", "accepted_awaiting_visa", 
		"local_hire", "remaining", "planned"
	];
	keys.forEach(k => row[k] = 0);
	row.planning_check = "OK";
	row.status_class = "status-green";
	return row;
}

function getStageMetricKeys(stage) {
	if (stage === "Awaiting Response") {
		return ["awaiting_response_overseas", "awaiting_response_local"];
	} else if (stage === "Awaiting Visa") {
		return ["accepted_awaiting_visa"];
	} else if (stage === "With Visa/Arriving") {
		return ["accepted_with_visa"];
	} else if (stage === "Local Hired") {
		return ["local_hire"];
	}
	return [];
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

function chartClickListener(chartSelector, callback) {
	setTimeout(() => {
		const $parent = $(chartSelector);
		if ($parent.length) {
			$parent.off("data-select").on("data-select", function(e) {
				if (e.index !== undefined && e.index !== -1) {
					callback(e.index);
				}
			});
		}
	}, 500);
}

function renderCharts(filteredData) {
	// 1. Funnel Chart
	let awaitingResponse = 0;
	let awaitingVisa = 0;
	let withVisa = 0;
	let localHire = 0;

	filteredData.forEach(item => {
		awaitingResponse += (item.total.awaiting_response_overseas || 0) + (item.total.awaiting_response_local || 0);
		awaitingVisa += (item.total.accepted_awaiting_visa || 0);
		withVisa += (item.total.accepted_with_visa || 0);
		localHire += (item.total.local_hire || 0);
	});

	const funnelData = {
		labels: ["Awaiting Response", "Awaiting Visa", "With Visa/Arriving", "Local Hired"],
		datasets: [
			{
				name: "Candidates",
				values: [awaitingResponse, awaitingVisa, withVisa, localHire]
			}
		]
	};

	if (!chartFunnel) {
		chartFunnel = new frappe.Chart("#chart-funnel", {
			title: "Candidate Pipeline Stages",
			data: funnelData,
			type: 'bar',
			height: 200,
			colors: ['#6366f1'],
			isNavigable: 1
		});
		
		chartClickListener("#chart-funnel", (index) => {
			const stages = ["Awaiting Response", "Awaiting Visa", "With Visa/Arriving", "Local Hired"];
			activeFilters.stage = stages[index];
			updateFilterChips();
			applyFilters();
		});
	} else {
		chartFunnel.update(funnelData);
	}

	// 2. Nationality Chart
	let countryCounts = {};
	filteredData.forEach(item => {
		(item.countries || []).forEach(c => {
			const active = (c.total.awaiting_response_overseas || 0) + 
			               (c.total.awaiting_response_local || 0) + 
			               (c.total.accepted_awaiting_visa || 0) + 
			               (c.total.accepted_with_visa || 0) + 
			               (c.total.local_hire || 0);
			if (active > 0) {
				countryCounts[c.country] = (countryCounts[c.country] || 0) + active;
			}
		});
	});

	const natLabels = Object.keys(countryCounts);
	const natValues = Object.values(countryCounts);

	const nationalityData = {
		labels: natLabels.length ? natLabels : ["No Candidates"],
		datasets: [
			{
				values: natValues.length ? natValues : [0]
			}
		]
	};

	if (!chartNationality) {
		chartNationality = new frappe.Chart("#chart-nationality", {
			title: "Active Candidates by Nationality",
			data: nationalityData,
			type: 'donut',
			height: 200,
			colors: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'],
			isNavigable: 1
		});
		
		chartClickListener("#chart-nationality", (index) => {
			if (natLabels.length) {
				activeFilters.nationality = natLabels[index];
				updateFilterChips();
				applyFilters();
			}
		});
	} else {
		chartNationality.update(nationalityData);
	}

	// 3. Gap Chart
	let labels = [];
	let prCounts = [];
	let remainingReqs = [];
	filteredData.forEach(item => {
		labels.push(item.designation);
		prCounts.push(item.total.pr_count || 0);
		remainingReqs.push(item.total.remaining || 0);
	});

	const gapData = {
		labels: labels.length ? labels : ["No Gaps"],
		datasets: [
			{
				name: "Total PR Count",
				values: prCounts.length ? prCounts : [0]
			},
			{
				name: "Remaining Needed",
				values: remainingReqs.length ? remainingReqs : [0]
			}
		]
	};

	if (!chartGap) {
		chartGap = new frappe.Chart("#chart-gap", {
			title: "Requirement Gap by Designation",
			data: gapData,
			type: 'bar',
			height: 200,
			colors: ['#3b82f6', '#f59e0b'],
			isNavigable: 1
		});

		chartClickListener("#chart-gap", (index) => {
			if (labels.length) {
				activeFilters.designation = labels[index];
				updateFilterChips();
				applyFilters();
			}
		});
	} else {
		chartGap.update(gapData);
	}
}

function updateFilterChips() {
	const $bar = $(".active-filters-bar");
	const $chips = $(".active-filters-chips");
	$chips.empty();
	
	let hasFilters = false;
	
	for (let key in activeFilters) {
		if (activeFilters[key]) {
			hasFilters = true;
			const displayVal = activeFilters[key];
			const displayName = key.charAt(0).toUpperCase() + key.slice(1);
			
			const $chip = $(`
				<span class="filter-chip badge badge-primary p-2 mr-2 mb-2" style="font-size: 13px; font-weight: normal; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; background-color: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe;">
					${displayName}: <strong class="ml-1">${displayVal}</strong>
					<span class="ml-2 font-weight-bold filter-chip-remove" data-key="${key}" style="font-size: 16px; line-height: 1;">&times;</span>
				</span>
			`);
			
			$chip.find(".filter-chip-remove").on("click", function(e) {
				e.stopPropagation();
				activeFilters[key] = null;
				updateFilterChips();
				applyFilters();
			});
			
			$chips.append($chip);
		}
	}
	
	if (hasFilters) {
		$bar.removeClass("hidden");
	} else {
		$bar.addClass("hidden");
	}
}

function clearAllFilters() {
	activeFilters.stage = null;
	activeFilters.nationality = null;
	activeFilters.designation = null;
	
	if (pageObj && pageObj.fields_dict.erf_filter) {
		pageObj.fields_dict.erf_filter.set_value("All");
	}
	if (pageObj && pageObj.fields_dict.search_filter) {
		pageObj.fields_dict.search_filter.set_value("");
	}
	
	updateFilterChips();
	applyFilters();
}

function renderTreeTable(data) {
	const $tbody = $(".tree-table-body");
	$tbody.empty();

	if (!data || data.length === 0) {
		$tbody.append('<tr><td colspan="13" class="text-center text-muted p-4">No active requirements found.</td></tr>');
		return;
	}

	data.forEach(item => {
		// Render parent ERF row
		const erfRowHtml = `
			<tr data-erf="${item.erf_number}" data-level="erf" class="tree-row row-erf clickable">
				<td class="font-weight-bold" style="color: #1f2937;">
					<span class="toggle-icon mr-2" style="color: #9ca3af; font-size: 10px;">▶</span> ${item.erf_number} - ${item.designation}
				</td>
				<td class="font-weight-bold" style="color: #4b5563;">Total</td>
				${renderMetricCells(item.total)}
			</tr>
		`;
		$tbody.append(erfRowHtml);

		// Render Gender Rows
		const maleRowHtml = `
			<tr data-erf="${item.erf_number}" data-level="gender" class="tree-row row-gender hidden text-muted">
				<td style="padding-left: 30px;"></td>
				<td>Male</td>
				${renderMetricCells(item.male)}
			</tr>
		`;
		const femaleRowHtml = `
			<tr data-erf="${item.erf_number}" data-level="gender" class="tree-row row-gender hidden text-muted">
				<td style="padding-left: 30px;"></td>
				<td>Female</td>
				${renderMetricCells(item.female)}
			</tr>
		`;
		$tbody.append(maleRowHtml);
		$tbody.append(femaleRowHtml);

		// Render Country Header Row
		if (item.countries && item.countries.length > 0) {
			const countryHeaderHtml = `
				<tr data-erf="${item.erf_number}" data-level="country-header" class="tree-row row-country-header clickable hidden font-weight-bold" style="background-color: #fafafa;">
					<td colspan="2" class="text-info" style="padding-left: 30px;">
						<span class="toggle-icon mr-2" style="color: #0d9488; font-size: 10px;">▶</span> Countries (Expand to see Nationality details)
					</td>
					<td colspan="11"></td>
				</tr>
			`;
			$tbody.append(countryHeaderHtml);

			// Render Country Rows
			item.countries.forEach(c => {
				const cTotalHtml = `
					<tr data-erf="${item.erf_number}" data-country="${c.country}" data-level="country-total" class="tree-row row-country-total clickable hidden text-dark font-weight-bold" style="background-color: #fafafa;">
						<td style="padding-left: 50px;">
							<span class="toggle-icon mr-2" style="color: #9ca3af; font-size: 10px;">▶</span> ${c.country}
						</td>
						<td>Total</td>
						${renderMetricCells(c.total)}
					</tr>
				`;
				const cMaleHtml = `
					<tr data-erf="${item.erf_number}" data-country="${c.country}" data-level="country-detail" class="tree-row row-country-detail hidden text-muted">
						<td style="padding-left: 70px;"></td>
						<td>Male</td>
						${renderMetricCells(c.male)}
					</tr>
				`;
				const cFemaleHtml = `
					<tr data-erf="${item.erf_number}" data-country="${c.country}" data-level="country-detail" class="tree-row row-country-detail hidden text-muted">
						<td style="padding-left: 70px;"></td>
						<td>Female</td>
						${renderMetricCells(c.female)}
					</tr>
				`;
				$tbody.append(cTotalHtml);
				$tbody.append(cMaleHtml);
				$tbody.append(cFemaleHtml);
			});
		}
	});
}

function renderMetricCells(row) {
	const remClass = row.remaining < 0 ? "text-danger font-weight-bold" : "text-indigo";
	return `
		<td>${row.pr_count || 0}</td>
		<td>${row.joined_without_pr || 0}</td>
		<td>${row.erf_count || 0}</td>
		<td>${row.awaiting_response_overseas || 0}</td>
		<td>${row.awaiting_response_local || 0}</td>
		<td>${row.accepted_with_visa || 0}</td>
		<td>${row.accepted_awaiting_visa || 0}</td>
		<td>${row.local_hire || 0}</td>
		<td class="${remClass}">${row.remaining || 0}</td>
		<td>${row.planned || 0}</td>
		<td>
			<span class="status-pill ${row.status_class || 'status-grey'}">
				${row.planning_check || 'OK'}
			</span>
		</td>
	`;
}
