// Chart Instances

let linearChartInstance = null;

let logChartInstance = null;

let invChartInstance = null;

let invSqChartInstance = null;



// Theming variables for charts

const chartColors = {

    grid: 'rgba(255, 255, 255, 0.05)',

    text: '#a0a0ad',

    point: '#775cf0',

    pointHover: '#886efc',

    lineLinear: 'rgba(119, 92, 240, 0.8)',

    lineLog: 'rgba(0, 210, 255, 0.8)',

    lineInv: 'rgba(255, 99, 132, 0.8)',

    lineInvSq: 'rgba(75, 192, 192, 0.8)'

};



// Global Chart Defaults

Chart.defaults.color = chartColors.text;

Chart.defaults.font.family = "'Inter', sans-serif";



function getCompCount() {

    const compRadio = document.querySelector('input[name="comp_count"]:checked');

    return compRadio ? parseInt(compRadio.value) : 1;

}



function updateCompColumns() {

    const compCount = getCompCount();

    const headerRow = document.getElementById('table-header-row');



    // Update Header

    let headerHTML = '<span>Time (h)</span>';

    headerHTML += '<div class="conc-headers-wrapper">';

    for (let i = 1; i <= compCount; i++) {

        headerHTML += `<span class="conc-header">C${i} (mg/L)</span>`;

    }

    headerHTML += '</div>';

    headerHTML += '<span>Action</span>';

    headerRow.innerHTML = headerHTML;



    // Update Data Rows

    const dataRows = document.querySelectorAll('.data-row');

    dataRows.forEach(row => {

        let wrapper = row.querySelector('.conc-inputs-wrapper');

        if (!wrapper) {

            // Create wrapper if missing (fallback)

            wrapper = document.createElement('div');

            wrapper.className = 'conc-inputs-wrapper';

            const oldInput = row.querySelector('.conc-input');

            if (oldInput) {

                oldInput.className = 'conc-input conc-input-1';

                row.replaceChild(wrapper, oldInput);

                wrapper.appendChild(oldInput);

            }

        }



        // Ensure exact number of inputs exist

        const currentInputs = wrapper.querySelectorAll('.conc-input').length;

        if (currentInputs < compCount) {

            for (let i = currentInputs + 1; i <= compCount; i++) {

                const inp = document.createElement('input');

                inp.type = 'number';

                inp.className = `conc-input conc-input-${i}`;

                inp.placeholder = `C${i}`;

                inp.step = 'any';

                wrapper.appendChild(inp);

            }

        } else if (currentInputs > compCount) {

            const inputs = wrapper.querySelectorAll('.conc-input');

            for (let i = currentInputs; i > compCount; i--) {

                inputs[i - 1].remove();

            }

        }



        // Adjust CSS layout for wrapper to be a horizontal flex

    });

}



function addRow() {

    const container = document.getElementById('data-rows');

    const row = document.createElement('div');

    row.className = 'data-row';



    const compCount = getCompCount();

    let inputsStr = '';

    for (let i = 1; i <= compCount; i++) {

        inputsStr += `<input type="number" class="conc-input conc-input-${i}" placeholder="C${i}" step="any">`;

    }



    row.innerHTML = `

        <input type="number" class="time-input" placeholder="Time" step="any">

        <div class="conc-inputs-wrapper" style="flex: 2;">

            ${inputsStr}

        </div>

        <button class="icon-btn remove-btn" onclick="removeRow(this)" title="Remove point">×</button>

    `;

    container.appendChild(row);

}



function removeRow(btn) {

    const row = btn.parentElement;

    if (document.querySelectorAll('.data-row').length > 1) {

        row.remove();

    }

}



async function calculatePK() {

    // UI Elements

    const btn = document.querySelector('.calculate-btn');

    const btnText = document.getElementById('btn-text');

    const btnLoader = document.getElementById('btn-loader');

    const errorMsg = document.getElementById('error-message');

    const resultsPanel = document.getElementById('results-panel');



    // Gather data

    const dose = parseFloat(document.getElementById('dose').value);

    const adminRoute = document.querySelector('input[name="admin_route"]:checked').value;

    const compCount = getCompCount();

    const timeInputs = document.querySelectorAll('.time-input');

    const rows = document.querySelectorAll('.data-row');



    let time = [];

    // conc will now be a dictionary mapping compartment index to array of values
    let conc = {};
    for (let c = 1; c <= compCount; c++) {
        conc[c] = [];
    }



    rows.forEach((row, i) => {

        const tVal = parseFloat(timeInputs[i].value);

        if (!isNaN(tVal)) {
            let validRow = true;
            let tempConc = {};

            for (let c = 1; c <= compCount; c++) {
                const cInput = row.querySelector(`.conc-input-${c}`);
                if (cInput) {
                    const cVal = parseFloat(cInput.value);
                    if (!isNaN(cVal)) {
                        tempConc[c] = cVal;
                    } else {
                        validRow = false;
                    }
                } else {
                    validRow = false;
                }
            }

            if (validRow) {
                time.push(tVal);
                for (let c = 1; c <= compCount; c++) {
                    conc[c].push(tempConc[c]);
                }
            }
        }

    });



    // Basic Validation

    if (time.length < 3) {

        showError("Please enter at least 3 valid data points per compartment.");

        return;

    }

    if (isNaN(dose) || dose <= 0) {

        showError("Please enter a valid dose > 0.");

        return;

    }



    // Loading State

    errorMsg.classList.add('hidden');

    btnText.style.opacity = '0';

    btnLoader.classList.remove('hidden');

    btn.disabled = true;



    try {

        const response = await fetch('/api/calculate', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({
                dose,
                time,
                conc,
                admin_route: adminRoute,
                comp_count: compCount
            })

        });



        const data = await response.json();



        if (!response.ok) {

            throw new Error(data.error || 'Calculation failed');

        }



        displayResults(data, time, conc, compCount);



        // Show panel

        resultsPanel.classList.remove('hidden');

        resultsPanel.classList.add('fade-in');



        // Scroll to results on mobile

        if (window.innerWidth <= 900) {

            resultsPanel.scrollIntoView({ behavior: 'smooth' });

        }



    } catch (err) {

        showError(err.message);

    } finally {

        // Reset button

        btnText.style.opacity = '1';

        btnLoader.classList.add('hidden');

        btn.disabled = false;

    }

}



function showError(msg) {

    const errorMsg = document.getElementById('error-message');

    errorMsg.textContent = msg;

    errorMsg.classList.remove('hidden');

}



function formatVal(val, decimals = 3) {

    if (val === undefined || isNaN(val)) return '--';

    if (val === 0) return '0';

    if (Math.abs(val) < 0.001) return val.toExponential(2);

    return val.toFixed(decimals);

}



function displayResults(data, time, conc, compCount) {

    const params = data.parameters;

    const orderInfo = data.order_analysis;

    const compInfo = data.compartment_analysis;



    // Update Badges

    document.getElementById('order-badge').textContent = orderInfo.likely_order;



    // Add compartment badge

    let compBadge = document.getElementById('comp-badge');

    if (!compBadge) {

        compBadge = document.createElement('span');

        compBadge.className = 'badge';

        compBadge.id = 'comp-badge';

        document.getElementById('order-badge').after(compBadge);

    }



    compBadge.textContent = compInfo.model;



    // Base styles for Order Badge

    if (orderInfo.likely_order.includes('Zero')) {

        document.getElementById('order-badge').style.color = '#ff9900';

        document.getElementById('order-badge').style.backgroundColor = 'rgba(255, 153, 0, 0.1)';

        document.getElementById('order-badge').style.borderColor = 'rgba(255, 153, 0, 0.2)';

    } else if (orderInfo.likely_order.includes('First')) {

        document.getElementById('order-badge').style.color = '#00d2ff';

        document.getElementById('order-badge').style.backgroundColor = 'rgba(0, 210, 255, 0.1)';

        document.getElementById('order-badge').style.borderColor = 'rgba(0, 210, 255, 0.2)';

    } else {

        document.getElementById('order-badge').style.color = '#ff6384';

        document.getElementById('order-badge').style.backgroundColor = 'rgba(255, 99, 132, 0.1)';

        document.getElementById('order-badge').style.borderColor = 'rgba(255, 99, 132, 0.2)';

    }



    // Compartment badge styles
    if (compInfo.route === 'Oral') {
        compBadge.style.color = '#FFB020';
        compBadge.style.backgroundColor = 'rgba(255, 176, 32, 0.1)';
        compBadge.style.borderColor = 'rgba(255, 176, 32, 0.2)';
        compBadge.style.marginLeft = '10px';
    } else if (compInfo.model === "2-Compartment") {

        compBadge.style.color = '#a060ff';

        compBadge.style.backgroundColor = 'rgba(160, 96, 255, 0.1)';

        compBadge.style.borderColor = 'rgba(160, 96, 255, 0.2)';

        compBadge.style.marginLeft = '10px';

    } else {

        compBadge.style.color = '#4bc0c0';

        compBadge.style.backgroundColor = 'rgba(75, 192, 192, 0.1)';

        compBadge.style.borderColor = 'rgba(75, 192, 192, 0.2)';

        compBadge.style.marginLeft = '10px';

    }





    // Handle 2-compartment parameters section

    let compParamsContainer = document.getElementById('comp2-params-container');

    // Clear out oral tags or 2-comp tags
    if (compParamsContainer) {
        compParamsContainer.style.display = 'none';
        compParamsContainer.innerHTML = '';
    }

    if (compInfo.model === "2-Compartment" && compInfo.parameters_2comp) {

        if (!compParamsContainer) {

            compParamsContainer = document.createElement('div');

            compParamsContainer.id = 'comp2-params-container';

            document.querySelector('.pk-grid').after(compParamsContainer);

        }


        compParamsContainer.innerHTML = '<h3>2-Compartment Parameters</h3><div class="pk-grid comp2-grid"></div>';
        const grid = compParamsContainer.querySelector('.comp2-grid');

        const cp = compInfo.parameters_2comp;

        grid.innerHTML = `

            <div class="pk-card"><span class="pk-label">A</span><div class="pk-value">${formatVal(cp.A, 2)} <span class="unit">mg/L</span></div></div>

            <div class="pk-card"><span class="pk-label">α (Alpha)</span><div class="pk-value">${formatVal(cp.alpha, 4)} <span class="unit">h⁻¹</span></div></div>

            <div class="pk-card"><span class="pk-label">B</span><div class="pk-value">${formatVal(cp.B, 2)} <span class="unit">mg/L</span></div></div>

            <div class="pk-card"><span class="pk-label">β (Beta)</span><div class="pk-value">${formatVal(cp.beta, 4)} <span class="unit">h⁻¹</span></div></div>

            <div class="pk-card"><span class="pk-label">K12</span><div class="pk-value">${formatVal(cp.k12, 4)} <span class="unit">h⁻¹</span></div></div>

            <div class="pk-card"><span class="pk-label">K21</span><div class="pk-value">${formatVal(cp.k21, 4)} <span class="unit">h⁻¹</span></div></div>

            <div class="pk-card"><span class="pk-label">K10</span><div class="pk-value">${formatVal(cp.k10, 4)} <span class="unit">h⁻¹</span></div></div>

        `;

        compParamsContainer.style.display = 'block';

    } else if (compInfo.route === "Oral" && compInfo.oral_params) {
        if (!compParamsContainer) {
            compParamsContainer = document.createElement('div');
            compParamsContainer.id = 'comp2-params-container';
            document.querySelector('.pk-grid').after(compParamsContainer);
        }

        compParamsContainer.innerHTML = '<h3>Oral Parameters</h3><div class="pk-grid comp2-grid"></div>';
        const grid = compParamsContainer.querySelector('.comp2-grid');
        const op = compInfo.oral_params;

        grid.innerHTML = `
            <div class="pk-card"><span class="pk-label">Absorption Rate (Ka)</span><div class="pk-value">${formatVal(op.ka, 4)} <span class="unit">h⁻¹</span></div></div>
            <div class="pk-card"><span class="pk-label">Observed Tmax</span><div class="pk-value">${formatVal(op.tmax_obs, 2)} <span class="unit">h</span></div></div>
            <div class="pk-card"><span class="pk-label">Observed Cmax</span><div class="pk-value">${formatVal(op.cmax_obs, 2)} <span class="unit">mg/L</span></div></div>
            <div class="pk-card"><span class="pk-label">Predicted Tmax</span><div class="pk-value">${formatVal(op.tmax_pred, 2)} <span class="unit">h</span></div></div>
            <div class="pk-card"><span class="pk-label">Apparent Vd/F</span><div class="pk-value">${formatVal(op.vd_f, 2)} <span class="unit">L</span></div></div>
            <div class="pk-card"><span class="pk-label">Apparent Cl/F</span><div class="pk-value">${formatVal(op.cl_f, 2)} <span class="unit">L/h</span></div></div>
        `;
        compParamsContainer.style.display = 'block';
    }



    // Update Values

    document.getElementById('val-ke').textContent = formatVal(params.ke, 4);

    document.getElementById('val-hl').textContent = formatVal(params.half_life, 2);

    document.getElementById('val-vd').textContent = formatVal(params.vd, 2);

    document.getElementById('val-cl').textContent = formatVal(params.cl, 2);

    document.getElementById('val-c0').textContent = formatVal(params.c0, 2);

    document.getElementById('val-auc').textContent = formatVal(params.auc_total, 2);

    // Swap label if Oral
    const c0Label = document.getElementById('val-c0').parentElement.previousElementSibling;
    const vdLabel = document.getElementById('val-vd').parentElement.previousElementSibling;
    const clLabel = document.getElementById('val-cl').parentElement.previousElementSibling;

    if (compInfo.route === 'Oral') {
        c0Label.textContent = "Extrapolated C0";
        vdLabel.textContent = "Apparent Vd/F";
        clLabel.textContent = "Apparent Cl/F";
    } else {
        c0Label.textContent = "Initial Conc. (C0)";
        vdLabel.textContent = "Volume of Dist. (Vd)";
        clLabel.textContent = "Clearance (Cl)";
    }

    // Update Charts

    updateCharts(time, conc, data.fits, compInfo.model, compInfo.route, compCount, compInfo.multi_data);

}



function updateCharts(time, conc_dict, fits, compModel, route, compCount, multiData) {

    // Evaluate core parameter "conc" which algorithm uses as central compartment (Compartment 1)
    const conc = conc_dict[1];

    // Prepare log / inv data (filter 0s)

    let logTime = [];

    let logConc = [];

    let invConc = [];

    let invSqConc = [];



    for (let i = 0; i < conc.length; i++) {

        if (conc[i] > 0) {

            logTime.push(time[i]);

            logConc.push(Math.log(conc[i]));

            invConc.push(1 / conc[i]);

            invSqConc.push(1 / (conc[i] * conc[i]));

        }

    }



    const commonOptions = {

        responsive: true,

        maintainAspectRatio: false,

        plugins: {

            legend: { display: true, position: 'top', labels: { boxWidth: 12, usePointStyle: true } },

            tooltip: { backgroundColor: 'rgba(20, 20, 25, 0.9)', titleColor: '#fff', bodyColor: '#ccc', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }

        }

    };



    // Determine colors for multiple compartments
    const compColors = [
        chartColors.point,          // C1
        '#ffb020',                  // C2 (Orange)
        '#4bc0c0',                  // C3 (Teal)
        '#ff6384'                   // C4 (Red/Pink)
    ];



    // Linear Chart (C vs t)

    if (linearChartInstance) linearChartInstance.destroy();

    const ctxLinear = document.getElementById('linearChart').getContext('2d');



    const linearDatasets = [];

    if (multiData && Object.keys(multiData).length > 0) {
        let cIndex = 0;
        for (const [key, compConc] of Object.entries(multiData)) {
            linearDatasets.push({
                label: `Observed Data (${key})`,
                data: time.map((t, i) => ({ x: t, y: compConc[i] })),
                backgroundColor: compColors[cIndex % compColors.length],
                pointRadius: 5,
                pointHoverRadius: 7
            });
            cIndex++;
        }
    } else {
        // Fallback for single data mode mapped earlier
        linearDatasets.push({
            label: 'Observed Data',
            data: time.map((t, i) => ({ x: t, y: conc[i] })),
            backgroundColor: chartColors.point,
            pointRadius: 5,
            pointHoverRadius: 7
        });
    }



    linearDatasets.push({

        label: 'Zero Order Fit',

        type: 'line',

        data: time.map((t, i) => ({ x: t, y: fits.zero_order[i] })),

        borderColor: 'rgba(255, 153, 0, 0.8)',

        borderWidth: 2,

        borderDash: [5, 5],

        pointRadius: 0,

        fill: false

    });



    if (compModel === "2-Compartment" && fits.bi_exponential && fits.bi_exponential.length > 0) {

        linearDatasets.push({

            label: '2-Compartment Fit',

            type: 'line',

            data: time.map((t, i) => ({ x: t, y: fits.bi_exponential[i] })),

            borderColor: '#a060ff',

            borderWidth: 2,

            pointRadius: 0,

            fill: false

        });

    } else if (compModel === "1-Compartment Oral" && fits.oral_model && fits.oral_model.length > 0) {
        linearDatasets.push({
            label: 'Oral Absorption Fit',
            type: 'line',
            data: time.map((t, i) => ({ x: t, y: fits.oral_model[i] })),
            borderColor: '#FFB020',
            borderWidth: 2,
            pointRadius: 0,
            fill: false
        });
    }



    linearChartInstance = new Chart(ctxLinear, {

        type: 'scatter',

        data: { datasets: linearDatasets },

        options: { ...commonOptions, scales: { x: { title: { display: true, text: 'Time (h)' }, grid: { color: chartColors.grid } }, y: { title: { display: true, text: 'Concentration (mg/L)' }, grid: { color: chartColors.grid } } } }

    });



    // Logarithmic Chart (ln(C) vs t)

    if (logChartInstance) logChartInstance.destroy();

    const ctxLog = document.getElementById('logChart').getContext('2d');



    const logDatasets = [];



    if (multiData && Object.keys(multiData).length > 0) {

        let cIndex = 0;

        for (const [key, compConc] of Object.entries(multiData)) {

            // Calculate ln values per compartment array

            let logT = [];

            let logC = [];

            for (let i = 0; i < compConc.length; i++) {

                if (compConc[i] > 0) {

                    logT.push(time[i]);

                    logC.push(Math.log(compConc[i]));

                }

            }



            logDatasets.push({

                label: `Observed Data (${key}, ln)`,

                data: logT.map((t, i) => ({ x: t, y: logC[i] })),

                backgroundColor: compColors[cIndex % compColors.length],

                pointBackgroundColor: compColors[cIndex % compColors.length],

                pointRadius: 5,

                pointHoverRadius: 7

            });

            cIndex++;

        }

    } else {

        // Fallback or Single Compartment Logic (Using global logTime/logConc calculated overhead based on Central)

        logDatasets.push({

            label: 'Observed Data (ln)',

            data: logTime.map((t, i) => ({ x: t, y: logConc[i] })),

            backgroundColor: chartColors.point,

            pointBackgroundColor: '#00d2ff',

            pointRadius: 5,

            pointHoverRadius: 7

        });

    }



    logDatasets.push({

        label: 'First Order Fit',

        type: 'line',

        data: logTime.map((t, i) => ({ x: t, y: fits.first_order_log[i] })),

        borderColor: chartColors.lineLog,

        borderWidth: 2,

        pointRadius: 0,

        fill: false

    });



    if (compModel === "2-Compartment" && fits.bi_exponential && fits.bi_exponential.length > 0) {

        logDatasets.push({

            label: '2-Compartment Fit (ln)',

            type: 'line',

            data: logTime.map((t, i) => ({ x: t, y: Math.log(fits.bi_exponential[i]) })),

            borderColor: '#a060ff',

            borderWidth: 2,

            pointRadius: 0,

            fill: false

        });

    } else if (compModel === "1-Compartment Oral" && fits.oral_model && fits.oral_model.length > 0) {
        logDatasets.push({
            label: 'Oral Absorption Fit (ln)',
            type: 'line',
            data: logTime.map((t, i) => ({ x: t, y: Math.log(fits.oral_model[i]) })),
            borderColor: '#FFB020',
            borderWidth: 2,
            pointRadius: 0,
            fill: false
        });
    }



    logChartInstance = new Chart(ctxLog, {

        type: 'scatter',

        data: { datasets: logDatasets },

        options: { ...commonOptions, scales: { x: { title: { display: true, text: 'Time (h)' }, grid: { color: chartColors.grid } }, y: { title: { display: true, text: 'ln(Concentration)' }, grid: { color: chartColors.grid } } } }

    });



    // Inverse Chart (1/C vs t)

    const ctxInv = document.getElementById('invChart');

    if (ctxInv) {

        if (invChartInstance) invChartInstance.destroy();

        invChartInstance = new Chart(ctxInv.getContext('2d'), {

            type: 'scatter',

            data: {

                datasets: [

                    {

                        label: 'Observed Data (1/C)',

                        data: logTime.map((t, i) => ({ x: t, y: invConc[i] })),

                        backgroundColor: chartColors.point,

                        pointBackgroundColor: '#ff6384',

                        pointRadius: 5,

                        pointHoverRadius: 7

                    },

                    {

                        label: 'Second Order Fit',

                        type: 'line',

                        data: logTime.map((t, i) => ({ x: t, y: fits.second_order_inv[i] })),

                        borderColor: chartColors.lineInv,

                        borderWidth: 2,

                        pointRadius: 0,

                        fill: false

                    }

                ]

            },

            options: { ...commonOptions, scales: { x: { title: { display: true, text: 'Time (h)' }, grid: { color: chartColors.grid } }, y: { title: { display: true, text: '1 / Concentration' }, grid: { color: chartColors.grid } } } }

        });

    }



    // Inverse Square Chart (1/C^2 vs t)

    const ctxInvSq = document.getElementById('invSqChart');

    if (ctxInvSq) {

        if (invSqChartInstance) invSqChartInstance.destroy();

        invSqChartInstance = new Chart(ctxInvSq.getContext('2d'), {

            type: 'scatter',

            data: {

                datasets: [

                    {

                        label: 'Observed Data (1/C²)',

                        data: logTime.map((t, i) => ({ x: t, y: invSqConc[i] })),

                        backgroundColor: chartColors.point,

                        pointBackgroundColor: '#4bc0c0',

                        pointRadius: 5,

                        pointHoverRadius: 7

                    },

                    {

                        label: 'Third Order Fit',

                        type: 'line',

                        data: logTime.map((t, i) => ({ x: t, y: fits.third_order_inv_sq[i] })),

                        borderColor: chartColors.lineInvSq,

                        borderWidth: 2,

                        pointRadius: 0,

                        fill: false

                    }

                ]

            },

            options: { ...commonOptions, scales: { x: { title: { display: true, text: 'Time (h)' }, grid: { color: chartColors.grid } }, y: { title: { display: true, text: '1 / (Concentration)²' }, grid: { color: chartColors.grid } } } }

        });

    }

}
