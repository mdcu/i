document.addEventListener('DOMContentLoaded', init);

const state = {
    sheetsId: null,
    sheetName: null,
    data: [],
    headers: [],
    studentData: [],
    selectedTeacher: "All",
    luckyDrawPool: [],
    selectedStudentEmail: null,
    selectedChartEmails: null
};

const CHART_COLORS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b',
    '#06b6d4', '#ef4444', '#14b8a6', '#f43f5e', '#84cc16'
];

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    state.sheetsId = urlParams.get('sheetsid');
    state.sheetName = urlParams.get('sheetname');

    if (!state.sheetsId || !state.sheetName) {
        promptForDetails();
        return;
    }

    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadData();
    });

    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
    });

    document.getElementById('mobile-sidebar-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('sidebar-open');
    });

    await loadData();
}

function promptForDetails() {
    let sheetsid = state.sheetsId || prompt("Please enter the Google Sheet ID:", "18YHCVM2HZmVAcoS5xeQaf3cqwrLjEwUso39DZm4nlQA");
    let sheetname = state.sheetName || prompt("Please enter the Sheet Name:", "diagnostic");

    if (sheetsid && sheetname) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('sheetsid', sheetsid);
        newUrl.searchParams.set('sheetname', sheetname);
        window.location.href = newUrl.toString();
    } else {
        alert("Both Sheet ID and Sheet Name are required.");
    }
}

async function loadData() {
    showLoading(true);
    try {
        const mainUrl = `https://docs.google.com/spreadsheets/d/${state.sheetsId}/gviz/tq?tqx=out:csv&sheet=${state.sheetName}`;
        const studentUrl = `https://docs.google.com/spreadsheets/d/${state.sheetsId}/gviz/tq?tqx=out:csv&sheet=student`;

        const [mainRes, studentRes] = await Promise.all([
            fetch(mainUrl),
            fetch(studentUrl)
        ]);

        if (!mainRes.ok) throw new Error('Failed to fetch main data');
        
        const mainCsv = await mainRes.text();
        const mainParsed = parseCSV(mainCsv);
        state.headers = mainParsed.headers;
        state.data = mainParsed.data;

        if (studentRes.ok) {
            const studentCsv = await studentRes.text();
            const studentParsed = parseCSV(studentCsv);
            processStudentData(studentParsed.headers, studentParsed.data);
        }

        processData();
        showLoading(false);
    } catch (error) {
        console.error("Error loading data:", error);
        alert("Error loading data from Google Sheets. Ensure the sheet is published or public and the ID/Name are correct.");
        showLoading(false);
    }
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// Simple CSV Parser handling quoted strings
function parseCSV(text) {
    const lines = [];
    let currentLine = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentCell += '"';
                i++; // Skip escaped quote
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            currentLine.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\n' || char === '\r') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++; // Skip \n in \r\n
            currentLine.push(currentCell.trim());
            if (currentLine.join('') !== '') { // Skip empty lines
                lines.push(currentLine);
            }
            currentLine = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }

    // Add last line
    if (currentCell !== '' || currentLine.length > 0) {
        currentLine.push(currentCell.trim());
        lines.push(currentLine);
    }

    if (lines.length > 0) {
        return {
            headers: lines[0],
            data: lines.slice(1)
        };
    }
    return { headers: [], data: [] };
}

function processStudentData(headers, data) {
    const emailIdx = headers.findIndex(h => h.toLowerCase().trim() === 'email address');
    const nameIdx = headers.findIndex(h => h.toLowerCase().trim() === 'name' || h.toLowerCase().trim() === 'student');
    const teacherIdx = headers.findIndex(h => h.toLowerCase().trim() === state.sheetName.toLowerCase().trim());

    if (emailIdx === -1) {
        console.warn("Student sheet missing 'Email address' column.");
        return;
    }

    state.studentData = data.map(row => {
        return {
            email: row[emailIdx],
            name: nameIdx !== -1 ? row[nameIdx] : "Unknown",
            teacher: teacherIdx !== -1 ? row[teacherIdx] : "Unknown"
        };
    }).filter(s => s.email && s.email.trim() !== "");

    // Populate teacher filter
    const teacherSelect = document.getElementById('teacher-filter');
    if (teacherSelect) {
        teacherSelect.innerHTML = '<option value="All">[All Teachers]</option>';
        const uniqueTeachers = [...new Set(state.studentData.map(s => s.teacher).filter(t => t && t !== "Unknown"))].sort();
        uniqueTeachers.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            teacherSelect.appendChild(opt);
        });
        
        teacherSelect.removeEventListener('change', handleTeacherChange);
        teacherSelect.addEventListener('change', handleTeacherChange);
    }
    
    // Setup lucky draw
    const luckyBtn = document.getElementById('lucky-draw-btn');
    if (luckyBtn) {
        luckyBtn.removeEventListener('click', luckyDraw);
        luckyBtn.addEventListener('click', luckyDraw);
    }
    
    resetLuckyDraw();
}

function handleTeacherChange(e) {
    state.selectedTeacher = e.target.value;
    state.selectedStudentEmail = null;
    state.selectedChartEmails = null;
    resetLuckyDraw();
    processData();
}

function resetLuckyDraw() {
    let pool = state.studentData;
    if (state.selectedTeacher !== "All") {
        pool = pool.filter(s => s.teacher === state.selectedTeacher);
    }
    state.luckyDrawPool = pool.map(s => s.email);
}

function luckyDraw() {
    if (state.luckyDrawPool.length === 0) {
        resetLuckyDraw(); // Refill pool
        if (state.luckyDrawPool.length === 0) return; // Still empty? Exit.
    }
    
    const randomIndex = Math.floor(Math.random() * state.luckyDrawPool.length);
    const chosenEmail = state.luckyDrawPool[randomIndex];
    state.luckyDrawPool.splice(randomIndex, 1); // Remove from pool
    
    // Select the student
    selectStudent(chosenEmail);
    
    // Scroll to the student in sidebar
    const studentEl = document.querySelector(`.student-item[data-email="${chosenEmail}"]`);
    if (studentEl) {
        studentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function selectStudent(email) {
    if (state.selectedStudentEmail === email) {
        state.selectedStudentEmail = null; // Toggle off
    } else {
        state.selectedStudentEmail = email;
        state.selectedChartEmails = null; // Clear chart highlight
    }
    applyHighlights();
}

function selectChartEmails(emailsArray) {
    if (state.selectedChartEmails && state.selectedChartEmails.join(',') === emailsArray.join(',')) {
        state.selectedChartEmails = null; // Toggle off
    } else {
        state.selectedChartEmails = emailsArray;
        state.selectedStudentEmail = null; // Clear student highlight
    }
    applyHighlights();
}

function applyHighlights() {
    // 1. Sidebar Highlights
    document.querySelectorAll('.student-item').forEach(el => {
        const email = el.getAttribute('data-email');
        el.classList.remove('highlighted', 'dimmed');
        
        if (state.selectedStudentEmail) {
            if (email === state.selectedStudentEmail) {
                el.classList.add('highlighted');
            } else {
                el.classList.add('dimmed');
            }
        } else if (state.selectedChartEmails) {
            if (state.selectedChartEmails.includes(email)) {
                el.classList.add('highlighted');
            } else {
                el.classList.add('dimmed');
            }
        }
    });
    
    // 2. Chart Highlights
    document.querySelectorAll('.boxplot-point, .stacked-segment, .text-bubble-container').forEach(el => {
        el.classList.remove('highlighted-answer', 'dimmed');
        const emailsAttr = el.getAttribute('data-emails');
        if (!emailsAttr) return;
        
        const pointEmails = emailsAttr.split(',');
        
        if (state.selectedStudentEmail) {
            if (pointEmails.includes(state.selectedStudentEmail)) {
                el.classList.add('highlighted-answer');
            } else {
                el.classList.add('dimmed');
            }
        } else if (state.selectedChartEmails) {
            if (state.selectedChartEmails.join(',') === emailsAttr) {
                el.classList.add('highlighted-answer');
            } else {
                el.classList.add('dimmed');
            }
        }
    });
}

function processData() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = ''; // Clear existing

    // Filter main data by selected teacher
    let activeData = state.data;
    const mainEmailIdx = state.headers.findIndex(h => h.toLowerCase().trim() === 'email address');
    
    if (state.studentData.length > 0 && mainEmailIdx !== -1) {
        let validEmails = state.studentData;
        if (state.selectedTeacher !== "All") {
            validEmails = validEmails.filter(s => s.teacher === state.selectedTeacher);
        }
        const validEmailSet = new Set(validEmails.map(s => s.email));
        activeData = state.data.filter(row => validEmailSet.has(row[mainEmailIdx]));
    }

    // Populate Sidebar with filtered students
    populateSidebar();

    // Identify columns starting with [...]
    const regex = /^\[(.*?)\]/;
    const groups = {}; // Map: groupName -> [colIndex1, colIndex2]

    state.headers.forEach((header, index) => {
        const match = header.match(regex);
        if (match) {
            const groupName = match[1]; // e.g., "A-1"
            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(index);
        }
    });

    // Process each group
    let delay = 0;
    for (const [groupName, colIndices] of Object.entries(groups)) {
        renderGroup(groupName, colIndices, container, activeData, mainEmailIdx, delay);
        delay += 100; // Staggered animation
    }
    
    applyHighlights(); // Apply initial highlights if any
}

function populateSidebar() {
    const studentList = document.getElementById('student-list');
    
    let filteredStudents = state.studentData;
    if (state.selectedTeacher !== "All") {
        filteredStudents = filteredStudents.filter(s => s.teacher === state.selectedTeacher);
    }

    if (filteredStudents.length > 0) {
        studentList.innerHTML = filteredStudents.map(s => `
            <div class="student-item" data-email="${s.email}">
                ${s.name}
            </div>
        `).join('');
        
        // Attach click events
        document.querySelectorAll('.student-item').forEach(el => {
            el.addEventListener('click', () => {
                selectStudent(el.getAttribute('data-email'));
            });
        });
        return;
    }

    studentList.innerHTML = '<div class="placeholder-text">No student names found. Please verify the "student" sheet exists and has "Email address" and "Name" columns.</div>';
}

function renderGroup(groupName, colIndices, container, activeData, mainEmailIdx, animationDelay) {
    const section = document.createElement('div');
    section.className = 'chart-section';
    section.style.animationDelay = `${animationDelay}ms`;

    const h2 = document.createElement('h2');
    h2.textContent = state.headers[colIndices[0]];
    section.appendChild(h2);

    let allDataPoints = []; // Array of { value, email }
    colIndices.forEach(colIndex => {
        activeData.forEach(row => {
            const v = row[colIndex];
            const email = mainEmailIdx !== -1 ? row[mainEmailIdx] : null;
            if (v !== undefined && v !== null && v !== '') {
                allDataPoints.push({ value: v, email: email });
            }
        });
    });

    if (allDataPoints.length === 0) return;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';

    // Analyze Data Type
    const isNumeric = allDataPoints.every(dp => !isNaN(parseFloat(dp.value)) && isFinite(dp.value));

    if (isNumeric) {
        renderBoxplot(allDataPoints, chartContainer);
    } else {
        // Count unique variations
        const counts = {}; // Map value -> { count, emails: [] }
        allDataPoints.forEach(dp => {
            if (!counts[dp.value]) counts[dp.value] = { count: 0, emails: [] };
            counts[dp.value].count++;
            if (dp.email) counts[dp.value].emails.push(dp.email);
        });
        const uniqueVariations = Object.keys(counts).length;

        if (uniqueVariations < 10) {
            renderStackedBar(counts, allDataPoints.length, chartContainer);
        } else {
            renderBubbleChart(counts, chartContainer);
        }
    }

    section.appendChild(chartContainer);

    if (section.children.length > 1) { // Only append if it has charts
        container.appendChild(section);
    }
}

// Visualizations

function renderBoxplot(dataPoints, container) {
    if (dataPoints.length === 0) return;

    const values = dataPoints.map(dp => parseFloat(dp.value));
    const sorted = [...values].sort((a, b) => a - b);

    const getPercentile = (p) => {
        const index = (sorted.length - 1) * p;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        if (upper >= sorted.length) return sorted[lower];
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    const q1 = getPercentile(0.25);
    const median = getPercentile(0.5);
    const q3 = getPercentile(0.75);
    const iqr = q3 - q1;

    let lowerFence = q1 - 1.5 * iqr;
    let upperFence = q3 + 1.5 * iqr;

    lowerFence = Math.max(sorted[0], lowerFence);
    upperFence = Math.min(sorted[sorted.length - 1], upperFence);

    const visualPadding = (upperFence - lowerFence) * 0.1 || 1;
    const scaleMin = lowerFence - visualPadding;
    const scaleMax = upperFence + visualPadding;
    const range = scaleMax - scaleMin || 1;

    const getPct = (val) => {
        let pct = ((val - scaleMin) / range) * 100;
        if (pct < 5) return 5;
        if (pct > 95) return 95;
        return pct;
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'boxplot-chart';

    const plotContainer = document.createElement('div');
    plotContainer.className = 'boxplot-container';

    const whiskerLine = document.createElement('div');
    whiskerLine.className = 'boxplot-whisker-line';
    whiskerLine.style.left = `${getPct(lowerFence)}%`;
    whiskerLine.style.width = `${getPct(upperFence) - getPct(lowerFence)}%`;
    plotContainer.appendChild(whiskerLine);

    const box = document.createElement('div');
    box.className = 'boxplot-box';
    box.style.left = `${getPct(q1)}%`;
    box.style.width = `${getPct(q3) - getPct(q1)}%`;

    const medianLine = document.createElement('div');
    medianLine.className = 'boxplot-median';
    medianLine.style.left = `${((median - q1) / (q3 - q1 || 1)) * 100}%`;
    box.appendChild(medianLine);

    plotContainer.appendChild(box);

    const tooltip = document.createElement("div");
    tooltip.className = "boxplot-tooltip";
    wrapper.appendChild(tooltip);

    // Group identical values
    const groupedPoints = {}; // Map value -> { count, emails: [] }
    dataPoints.forEach(dp => {
        const val = parseFloat(dp.value);
        if (!groupedPoints[val]) groupedPoints[val] = { count: 0, emails: [] };
        groupedPoints[val].count++;
        if (dp.email) groupedPoints[val].emails.push(dp.email);
    });

    // Data points
    Object.entries(groupedPoints).forEach(([valStr, groupData]) => {
        const val = parseFloat(valStr);
        const count = groupData.count;
        const emails = groupData.emails;
        
        const point = document.createElement('div');
        point.className = 'boxplot-point';
        point.setAttribute('data-emails', emails.join(','));

        let pct;
        if (val < lowerFence) {
            pct = 2 + Math.random() * 2; // cluster at very left
        } else if (val > upperFence) {
            pct = 96 + Math.random() * 2; // cluster at very right
        } else {
            pct = getPct(val);
        }

        point.style.left = `${pct}%`;
        point.style.top = `${20 + Math.random() * 60}%`;
        
        const size = count === 1 ? 8 : 8 + Math.log2(count) * 4;
        point.style.width = `${size}px`;
        point.style.height = `${size}px`;

        point.addEventListener("mouseenter", () => {
            tooltip.textContent = `Value: ${val} (Count: ${count})`;
            tooltip.style.opacity = "1";
            tooltip.style.left = point.style.left;
            tooltip.style.top = point.style.top;
        });
        point.addEventListener("mouseleave", () => {
            tooltip.style.opacity = "0";
        });
        
        point.addEventListener('click', () => {
            selectChartEmails(emails);
        });

        plotContainer.appendChild(point);
    });

    wrapper.appendChild(plotContainer);

    // Axis Labels
    const axis = document.createElement('div');
    axis.className = 'boxplot-axis';
    axis.innerHTML = `
        <span style="position:absolute; left: ${getPct(lowerFence)}%; transform: translateX(-50%);">${lowerFence.toFixed(1)}</span>
        <span style="position:absolute; left: ${getPct(median)}%; transform: translateX(-50%); font-weight: bold; color: var(--text-primary);">${median.toFixed(1)}</span>
        <span style="position:absolute; left: ${getPct(upperFence)}%; transform: translateX(-50%);">${upperFence.toFixed(1)}</span>
    `;
    wrapper.appendChild(axis);

    container.appendChild(wrapper);
}

function renderStackedBar(counts, total, container) {
    // Sort by count descending
    const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);

    const wrapper = document.createElement('div');

    const barContainer = document.createElement('div');
    barContainer.className = 'stacked-bar-container';

    const legend = document.createElement('div');
    legend.className = 'stacked-legend';

    sorted.forEach(([label, groupData], index) => {
        const count = groupData.count;
        const emails = groupData.emails;
        const pct = (count / total) * 100;
        const color = CHART_COLORS[index % CHART_COLORS.length];

        // Bar Segment
        const segment = document.createElement('div');
        segment.className = 'stacked-segment';
        segment.setAttribute('data-emails', emails.join(','));
        segment.style.width = `${pct}%`;
        segment.style.backgroundColor = color;
        segment.title = `${label}: ${count} (${pct.toFixed(1)}%)`;
        segment.style.cursor = 'pointer';

        if (pct > 5) {
            segment.textContent = `${pct.toFixed(0)}%`;
        }
        
        segment.addEventListener('click', () => {
            selectChartEmails(emails);
        });

        barContainer.appendChild(segment);

        // Legend Item
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.innerHTML = `
            <div class="legend-color" style="background-color: ${color}"></div>
            <span>${label} (${count})</span>
        `;
        legend.appendChild(legendItem);
    });

    wrapper.appendChild(barContainer);
    wrapper.appendChild(legend);
    container.appendChild(wrapper);
}

function renderBubbleChart(counts, container) {
    const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);

    const wrapper = document.createElement('div');
    wrapper.className = 'bubble-chart';

    sorted.forEach(([label, groupData], index) => {
        const count = groupData.count;
        const emails = groupData.emails;
        const color = CHART_COLORS[index % CHART_COLORS.length];

        const bubbleContainer = document.createElement('div');
        bubbleContainer.className = 'text-bubble-container';
        bubbleContainer.setAttribute('data-emails', emails.join(','));
        bubbleContainer.style.borderColor = color;
        bubbleContainer.style.cursor = 'pointer';

        const content = document.createElement('div');
        content.className = 'text-bubble-content';
        content.textContent = label;
        content.title = label; // Fallback tooltip for full text

        const countBadge = document.createElement('div');
        countBadge.className = 'text-bubble-count';
        countBadge.textContent = count;
        countBadge.style.borderColor = color;
        
        bubbleContainer.addEventListener('click', () => {
            selectChartEmails(emails);
        });

        bubbleContainer.appendChild(content);
        bubbleContainer.appendChild(countBadge);
        wrapper.appendChild(bubbleContainer);
    });

    container.appendChild(wrapper);
}
