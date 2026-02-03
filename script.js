// State Management
const STORAGE_KEY = 'project_estimator_v1';
const DEFAULT_STATE = {
    projectName: '',
    duration: 12,
    pricingModel: 'hourly',
    hourlyRate: 100,
    hoursPerDay: 8,
    dailyRate: 800,
    daysPerMonth: 20,
    fixedMonthly: 10000,
    members: []
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || JSON.parse(JSON.stringify(DEFAULT_STATE));

// Elements
const els = {
    inputs: {
        projectName: document.getElementById('project-name'),
        duration: document.getElementById('project-duration'),
        pricingModel: document.getElementById('pricing-model'),
        hourlyRate: document.getElementById('rate-hourly'),
        hoursPerDay: document.getElementById('hours-per-day'),
        dailyRate: document.getElementById('rate-daily'),
        daysPerMonth: document.getElementById('days-per-month'),
        fixedMonthly: document.getElementById('rate-fixed'),
    },
    displays: {
        monthlyRevenue: document.getElementById('display-monthly-revenue'),
        totalRevenue: document.getElementById('stat-total-revenue'),
        totalCost: document.getElementById('stat-total-cost'),
        costPercent: document.getElementById('stat-cost-percent'),
        netValue: document.getElementById('stat-net-value'),
        costProgressBar: document.getElementById('cost-progress-bar'),
        allocWarning: document.getElementById('allocation-warning'),
    },
    team: {
        table: document.getElementById('team-table'),
        tbody: document.getElementById('team-tbody'),
        empty: document.getElementById('empty-state'),
        addBtn: document.getElementById('add-member-btn'),
    },
    breakdown: {
        tbody: document.getElementById('breakdown-tbody')
    },
    actions: {
        reset: document.getElementById('reset-btn'),
        export: document.getElementById('export-btn'),
        theme: document.getElementById('theme-toggle'),
    }
};

// Utils
const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

// Core Logic
function calculateMonthlyRevenue() {
    const { pricingModel, hourlyRate, hoursPerDay, dailyRate, daysPerMonth, fixedMonthly } = state;

    if (pricingModel === 'fixed') return parseFloat(fixedMonthly) || 0;
    if (pricingModel === 'daily') return (parseFloat(dailyRate) || 0) * (parseFloat(daysPerMonth) || 0);
    if (pricingModel === 'hourly') return (parseFloat(hourlyRate) || 0) * (parseFloat(hoursPerDay) || 0) * (parseFloat(daysPerMonth) || 0);
    return 0;
}

function calculateProject() {
    const monthlyRevenue = calculateMonthlyRevenue();
    const projectDuration = parseInt(state.duration) || 1;
    const totalRevenue = monthlyRevenue * projectDuration;

    let totalCost = 0;
    let totalAllocatedPercent = 0;

    const memberStats = state.members.map(member => {
        // Effective duration is the lesser of the member's planned duration or the project duration
        // (Rules: "Payments stop automatically if the project stops" + "Active months only")
        const effectiveDuration = Math.min(parseInt(member.duration) || 0, projectDuration);

        // Check per month cost
        let monthlyCost = 0;
        if (member.shareType === 'percentage') {
            const pct = parseFloat(member.shareValue) || 0;
            totalAllocatedPercent += pct; // Tracking allocation for validaiton
            monthlyCost = monthlyRevenue * (pct / 100);
        } else {
            monthlyCost = parseFloat(member.shareValue) || 0;
            // Fixed costs don't add to percentage allocation directly for the 100% check usually, 
            // but we should track total cost vs revenue.
        }

        const totalMemberPayout = monthlyCost * effectiveDuration;
        totalCost += totalMemberPayout;

        return {
            ...member,
            effectiveDuration,
            monthlyPayout: monthlyCost,
            totalPayout: totalMemberPayout
        };
    });

    const netValue = totalRevenue - totalCost;
    const costPercentOfRevenue = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;

    return {
        monthlyRevenue,
        totalRevenue,
        totalCost,
        netValue,
        costPercentOfRevenue,
        totalAllocatedPercent,
        memberStats,
        projectDuration
    };
}

// UI Updating
function updateUI() {
    // 1. Inputs visibility
    document.querySelectorAll('.dynamic-input').forEach(el => {
        const models = el.dataset.show.split(' ');
        if (models.includes(state.pricingModel)) {
            el.classList.add('visible');
        } else {
            el.classList.remove('visible');
        }
    });

    // 2. Sync input values with state (only if not focused - to prevent cursor jumping)
    // Actually, usually we bind events to update state, so values shouldn't drift.
    // We'll skip forcing values into inputs repeatedly to avoid UI glitches, assuming listeners handle 1-way binding correctly.

    // 3. Update Stats
    const calculations = calculateProject();

    els.displays.monthlyRevenue.textContent = formatMoney(calculations.monthlyRevenue);
    els.displays.totalRevenue.textContent = formatMoney(calculations.totalRevenue);
    els.displays.totalCost.textContent = formatMoney(calculations.totalCost);
    els.displays.netValue.textContent = formatMoney(calculations.netValue);
    els.displays.costPercent.textContent = `${calculations.costPercentOfRevenue.toFixed(1)}% of revenue`;

    // Progress Bar
    const cappedPercent = Math.min(calculations.costPercentOfRevenue, 100);
    els.displays.costProgressBar.style.width = `${cappedPercent}%`;

    if (calculations.costPercentOfRevenue > 100) {
        els.displays.costProgressBar.style.backgroundColor = 'var(--danger)';
        els.displays.allocWarning.textContent = 'Warning: Costs exceed revenue!';
    } else {
        els.displays.costProgressBar.style.backgroundColor = 'var(--danger)'; // Keep red for cost
        els.displays.allocWarning.textContent = '';
    }

    // 4. Render Team Table
    renderTeamTable(calculations.memberStats);

    // 5. Render Breakdown
    renderBreakdown(calculations);

    // Save
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderTeamTable(memberStats) {
    els.team.tbody.innerHTML = '';

    if (memberStats.length === 0) {
        els.team.table.style.display = 'none';
        els.team.empty.style.display = 'block';
        return;
    }

    els.team.table.style.display = 'table';
    els.team.empty.style.display = 'none';

    memberStats.forEach((member, index) => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><input type="text" class="table-input" value="${member.name}" data-idx="${index}" data-field="name"></td>
            <td><input type="text" class="table-input" value="${member.role}" data-idx="${index}" data-field="role" list="role-list" placeholder="Select or type..."></td>
            <td>
                <select class="table-select" data-idx="${index}" data-field="type">
                    <option value="full-time" ${member.type === 'full-time' ? 'selected' : ''}>Full-time</option>
                    <option value="part-time" ${member.type === 'part-time' ? 'selected' : ''}>Part-time</option>
                    <option value="referral" ${member.type === 'referral' ? 'selected' : ''}>Referral</option>
                </select>
            </td>
            <td>
                <select class="table-select" data-idx="${index}" data-field="shareType">
                    <option value="percentage" ${member.shareType === 'percentage' ? 'selected' : ''}>% of Rev</option>
                    <option value="fixed" ${member.shareType === 'fixed' ? 'selected' : ''}>Fixed $</option>
                </select>
            </td>
            <td>
                <input type="number" class="table-input" value="${member.shareValue}" data-idx="${index}" data-field="shareValue" min="0">
            </td>
            <td>
                <input type="number" class="table-input" value="${member.duration}" data-idx="${index}" data-field="duration" min="1">
            </td>
            <td>${formatMoney(member.monthlyPayout)}</td>
            <td>${formatMoney(member.totalPayout)}</td>
            <td>
                <button class="btn-icon btn-sm" onclick="removeMember(${index})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        els.team.tbody.appendChild(tr);
    });

    // Add event listeners to new inputs
    els.team.tbody.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const field = e.target.dataset.field;
            let val = e.target.value;

            // Type conversion
            if (['shareValue', 'duration'].includes(field)) {
                // keep as string for input, parsed in calc
            }

            state.members[idx][field] = val;
            updateUI();
        });
    });
}

function renderBreakdown({ projectDuration, monthlyRevenue, memberStats }) {
    els.breakdown.tbody.innerHTML = '';

    // Generate array of months [1, 2, ... duration]
    for (let month = 1; month <= projectDuration; month++) {
        let monthlyTotalCost = 0;
        let referralCost = 0;
        let teamCost = 0;

        memberStats.forEach(m => {
            if (month <= m.effectiveDuration) {
                if (m.type === 'referral') {
                    referralCost += m.monthlyPayout;
                } else {
                    teamCost += m.monthlyPayout;
                }
            }
        });

        monthlyTotalCost = teamCost + referralCost;
        const netIncome = monthlyRevenue - monthlyTotalCost;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Month ${month}</td>
            <td>${formatMoney(monthlyRevenue)}</td>
            <td>${formatMoney(teamCost)}</td>
            <td>${formatMoney(referralCost)}</td>
            <td style="color: ${netIncome >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 500;">
                ${formatMoney(netIncome)}
            </td>
        `;
        els.breakdown.tbody.appendChild(tr);
    }
}

// Event Bindings
function bindEvents() {
    // Project Inputs
    Object.keys(els.inputs).forEach(key => {
        const input = els.inputs[key];
        // Init value
        if (state[key] !== undefined) input.value = state[key];

        input.addEventListener('input', (e) => {
            state[key] = e.target.value;
            updateUI();
        });
    });

    // Add Member
    els.team.addBtn.addEventListener('click', () => {
        state.members.push({
            name: 'New Member',
            role: 'Developer',
            type: 'full-time',
            shareType: 'percentage', // percentage | fixed
            shareValue: 10,
            duration: state.duration // default to project duration
        });
        updateUI();
    });

    // Reset
    els.actions.reset.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all data?')) {
            state = JSON.parse(JSON.stringify(DEFAULT_STATE));
            // reload values into inputs
            Object.keys(els.inputs).forEach(key => {
                if (state[key] !== undefined) els.inputs[key].value = state[key];
            });
            updateUI();
        }
    });

    // Export Real Excel (.xlsx) with Colors via Library
    els.actions.export.addEventListener('click', () => {
        if (typeof XLSX === 'undefined') {
            alert('Export library is still loading. Please try again in a moment or check your internet connection.');
            return;
        }

        const calcs = calculateProject();
        const { monthlyRevenue, totalRevenue, totalCost, netValue, memberStats, projectDuration } = calcs;

        // --- Styles Configuration ---
        const sHeader = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4F81BD" } },
            alignment: { horizontal: "center" },
            border: {
                top: { style: "thin" }, bottom: { style: "thin" },
                left: { style: "thin" }, right: { style: "thin" }
            }
        };
        const sSubHeader = {
            font: { bold: true },
            fill: { fgColor: { rgb: "DCE6F1" } },
            border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
        };
        const sCell = {
            border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
        };
        const sCurrency = {
            ...sCell,
            alignment: { horizontal: "right" }
        };
        const sSection = {
            font: { bold: true, sz: 14, color: { rgb: "366092" } }
        };

        // --- Data Construction ---
        // We will build a row-by-row array of objects or arrays, then convert to sheet
        let rows = [];

        // Helper to push a row with specific style applied to all cells
        const addRow = (cells, defaultStyle = sCell) => {
            const rowData = cells.map(c => ({
                v: c.v, // value
                s: c.s || defaultStyle // style
            }));
            rows.push(rowData);
        };

        // Spacer
        const addSpacer = () => rows.push([]);

        // SECTION 1: Summary
        rows.push([{ v: "PROJECT SUMMARY", s: sSection }]);
        addRow([
            { v: "Metric", s: sSubHeader },
            { v: "Value", s: sSubHeader }
        ]);
        addRow([{ v: "Project Name" }, { v: state.projectName }]);
        addRow([{ v: "Duration" }, { v: `${state.duration} Months` }]);
        addRow([{ v: "Pricing Model" }, { v: state.pricingModel }]);
        addRow([{ v: "Monthly Revenue" }, { v: formatMoney(monthlyRevenue), s: sCurrency }]);
        addRow([{ v: "Total Revenue" }, { v: formatMoney(totalRevenue), s: sCurrency }]);

        // Conditional Style for Total Cost
        addRow([
            { v: "Total Cost" },
            { v: formatMoney(totalCost), s: { ...sCurrency, font: { color: { rgb: "FF0000" } } } }
        ]);

        // Conditional Style for Net Value
        const netColor = netValue >= 0 ? "008000" : "FF0000"; // Green vs Red
        addRow([
            { v: "Net Value" },
            { v: formatMoney(netValue), s: { ...sCurrency, font: { bold: true, color: { rgb: netColor } } } }
        ]);

        addSpacer();

        // SECTION 2: Team Roster
        rows.push([{ v: "TEAM ROSTER", s: sSection }]);
        addRow([
            { v: "Role", s: sHeader },
            { v: "Name", s: sHeader },
            { v: "Type", s: sHeader },
            { v: "Model", s: sHeader },
            { v: "Share Value", s: sHeader },
            { v: "Months Active", s: sHeader },
            { v: "Monthly Payout", s: sHeader },
            { v: "Total Payout", s: sHeader }
        ]);

        memberStats.forEach(m => {
            addRow([
                { v: m.role },
                { v: m.name },
                { v: m.type },
                { v: m.shareType },
                { v: m.shareValue },
                { v: m.effectiveDuration },
                { v: formatMoney(m.monthlyPayout), s: sCurrency },
                { v: formatMoney(m.totalPayout), s: sCurrency }
            ]);
        });

        addSpacer();

        // SECTION 3: Breakdown
        rows.push([{ v: "MONTHLY BREAKDOWN", s: sSection }]);
        addRow([
            { v: "Month", s: sHeader },
            { v: "Gross Revenue", s: sHeader },
            { v: "Team Costs", s: sHeader },
            { v: "Referral Fees", s: sHeader },
            { v: "Total Cost", s: sHeader },
            { v: "Net Income", s: sHeader },
            { v: "Cumulative Net", s: sHeader }
        ]);

        let cumulativeNet = 0;
        for (let month = 1; month <= projectDuration; month++) {
            let teamCost = 0;
            let referralCost = 0;

            memberStats.forEach(m => {
                if (month <= m.effectiveDuration) {
                    if (m.type === 'referral') {
                        referralCost += m.monthlyPayout;
                    } else {
                        teamCost += m.monthlyPayout;
                    }
                }
            });

            const currentTotalCost = teamCost + referralCost;
            const currentNet = monthlyRevenue - currentTotalCost;
            cumulativeNet += currentNet;

            const monthNetColor = currentNet >= 0 ? "008000" : "FF0000";

            addRow([
                { v: `Month ${month}` },
                { v: formatMoney(monthlyRevenue), s: sCurrency },
                { v: formatMoney(teamCost), s: sCurrency },
                { v: formatMoney(referralCost), s: sCurrency },
                { v: formatMoney(currentTotalCost), s: sCurrency },
                { v: formatMoney(currentNet), s: { ...sCurrency, font: { bold: true, color: { rgb: monthNetColor } } } },
                { v: formatMoney(cumulativeNet), s: sCurrency }
            ]);
        }

        // --- Workbook Creation ---
        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Auto-width columns
        const colWidths = [20, 20, 15, 15, 15, 15, 18, 18];
        ws['!cols'] = colWidths.map(w => ({ wch: w }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Project Estimate");

        // Write File
        XLSX.writeFile(wb, `project_estimate_real_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });

    // Theme Toggle
    els.actions.theme.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.getAttribute('data-theme') === 'dark') {
            html.removeAttribute('data-theme');
            els.actions.theme.innerHTML = '<i class="fa-solid fa-moon"></i>';
            localStorage.setItem('theme', 'light');
        } else {
            html.setAttribute('data-theme', 'dark');
            els.actions.theme.innerHTML = '<i class="fa-solid fa-sun"></i>';
            localStorage.setItem('theme', 'dark');
        }
    });
}

// Global scope for onclick handlers
window.removeMember = (index) => {
    state.members.splice(index, 1);
    updateUI();
};

// Init
function init() {
    // Load theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        els.actions.theme.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    bindEvents();
    updateUI();
}

init();

// Additional CSS for dynamic inputs inserted here or assume main CSS covers it.
// We added .table-input in render but need to make sure styles match.
// Let's add simple styles for table inputs via JS injection or relying on global input styles + class.
document.head.insertAdjacentHTML("beforeend", `<style>
.table-input { width: 100%; min-width: 80px; padding: 0.4rem; font-size: 0.85rem; } 
.table-select { width: 100%; min-width: 100px; padding: 0.4rem; font-size: 0.85rem; }
</style>`)
