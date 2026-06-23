frappe.pages["recruitment_dashboard_master"].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Recruitment Dashboard Master",
		single_column: true
	});

	page.set_primary_action("Refresh", () => {
		fetchAndRender(page, wrapper);
	}, "refresh");

	// Add search bar wrapper in the filter area
	page.add_field({
		fieldtype: "Data",
		fieldname: "search_filter",
		label: "Search",
		placeholder: "Search by ERF or Designation...",
		change: function() {
			filterTable(this.get_value());
		}
	});

	// Trigger initial fetch and render
	fetchAndRender(page, wrapper);
};

let dashboardData = [];

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
				renderContent($dashboard_area, r.message);
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

function renderContent($container, data) {
	if (!data || data.length === 0) {
		$container.html('<div class="text-muted p-5 text-center">No active ERF requirements found.</div>');
		return;
	}

	// 1. Calculate Summary Card Metrics
	let totalErfs = data.length;
	let activeRequirements = 0;
	let totalPlanned = 0;
	let remainingGap = 0;

	data.forEach(item => {
		activeRequirements += (item.total.erf_count || 0);
		totalPlanned += (item.total.planned || 0);
		remainingGap += (item.total.remaining || 0);
	});

	// 2. Render Summary Card Grid
	const summaryHtml = `
		<div class="dashboard-summary-grid">
			<div class="summary-card accent-indigo">
				<div class="summary-card-title">Total Active ERFs</div>
				<div class="summary-card-value">${totalErfs}</div>
			</div>
			<div class="summary-card accent-amber">
				<div class="summary-card-title">Net Requirement (ERF Count)</div>
				<div class="summary-card-value">${activeRequirements}</div>
			</div>
			<div class="summary-card accent-emerald">
				<div class="summary-card-title">Total Planned Numbers</div>
				<div class="summary-card-value">${totalPlanned}</div>
			</div>
			<div class="summary-card ${remainingGap < 0 ? "accent-rose" : "accent-indigo"}">
				<div class="summary-card-title">Remaining Requirement</div>
				<div class="summary-card-value">${remainingGap}</div>
			</div>
		</div>
	`;
	$container.append(summaryHtml);

	// 3. Render Dashboard Table Wrapper
	const tableHtml = `
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
	$container.append(tableHtml);

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

	// Add collapse/expand event listener to ERF row
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

function filterTable(query) {
	const lowercaseQuery = (query || "").trim().toLowerCase();
	const $rows = $(".dashboard-rows");

	$rows.find(".erf-row").each(function() {
		const $row = $(this);
		const erf = $row.attr("data-erf").toLowerCase();
		const designation = $row.attr("data-designation");

		if (!lowercaseQuery || erf.indexOf(lowercaseQuery) > -1 || designation.indexOf(lowercaseQuery) > -1) {
			$row.show();
			// Keep child rows state corresponding to whether master row is expanded
			if ($row.hasClass("expanded")) {
				$(`.gender-row[data-parent-erf="${$row.attr("data-erf")}"]`).addClass("visible");
			}
		} else {
			$row.hide();
			// Hide children if master row is hidden
			$(`.gender-row[data-parent-erf="${$row.attr("data-erf")}"]`).removeClass("visible");
		}
	});
}
