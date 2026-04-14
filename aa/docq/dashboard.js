/**
 * DocQMD Dashboard Module
 * Handles rendering of courses, rotations, filters, and interactive tables.
 */

let dashboardData = null;
let currentRotationData = [];
let filteredData = [];
let activeFilters = {
    section: new Set(),
    workbook: new Set(),
    student: new Set(),
    advisor: new Set()
};
let currentSort = { column: 'submitted_date', desc: true };
let extraHeaders = []; // Track dynamic score columns

/**
 * Initializes the dashboard view after login
 * @param {Object} data - The user context and course data
 */
function initDashboard(data) {
    dashboardData = data;

    // Switch UI
    document.getElementById('login-container').style.display = 'none';
    const container = document.getElementById('dashboard-container');
    container.style.display = 'block'; // Block vertical flow

    // Set user info
    document.getElementById('user-email-display').textContent = `Hello, ${data.token_email}`;

    // Setup logout
    document.getElementById('logout-btn').onclick = () => {
        location.reload();
    };

    // Setup Export
    document.getElementById('export-btn').onclick = handleExport;

    renderNavigation(data.courses);
}

/**
 * Renders the top navigation menu
 */
function renderNavigation(courses) {
    const nav = document.getElementById('nav-menu');
    nav.innerHTML = '';

    courses.forEach(course => {
        const courseDiv = document.createElement('div');
        courseDiv.className = 'nav-course';

        const title = document.createElement('div');
        title.className = 'course-title';
        title.textContent = course.course_title;
        courseDiv.appendChild(title);

        const rotationList = document.createElement('div');
        rotationList.className = 'rotation-list';

        course.rotations.forEach(rotation => {
            const rotItem = document.createElement('div');
            rotItem.className = 'rotation-item';
            rotItem.textContent = rotation.rotation_title;
            rotItem.onclick = () => {
                document.querySelectorAll('.rotation-item').forEach(el => el.classList.remove('active'));
                rotItem.classList.add('active');
                showRotation(rotation);
            };
            rotationList.appendChild(rotItem);
        });

        courseDiv.appendChild(rotationList);
        nav.appendChild(courseDiv);
    });
}

/**
 * Displays the selected rotation view
 */
function showRotation(rotation) {
    document.getElementById('current-view-title').textContent = rotation.rotation_title;

    // Reset score expansion state when switching rotations
    extraHeaders = [];

    // Flatten data to worksheet level
    currentRotationData = flattenRotationData(rotation);

    // Reset filters to "Select All"
    resetFilters(currentRotationData);

    // Render filters UI
    renderFiltersSection(currentRotationData);

    // Refresh table
    applyFiltersAndRender();
}

/**
 * Flattens the nested structure: section -> workbook -> worksheet
 */
function flattenRotationData(rotation) {
    const rows = [];
    rotation.sections.forEach(section => {
        section.workbooks.forEach(workbook => {
            // Automatically remove workbooks with "Draft" status
            if (workbook.status && workbook.status.toLowerCase() === 'draft') return;

            // Handle cases with no worksheets if they exist
            if (!workbook.worksheets || workbook.worksheets.length === 0) {
                rows.push({
                    ...workbook,
                    section_title: section.section_title,
                    worksheet_title: 'N/A',
                    worksheet_id: 'N/A',
                    is_duplicate: false
                });
                return;
            }

            workbook.worksheets.forEach((worksheet, idx) => {
                rows.push({
                    ...workbook,
                    ...worksheet, // This overwrites workbook properties if they conflict, but id field names are unique enough
                    section_title: section.section_title,
                    is_duplicate: idx > 0 // Help identify rows that share same workbook
                });
            });
        });
    });
    return rows;
}

/**
 * Resets the filter sets to include all values from the current data
 */
function resetFilters(data) {
    activeFilters.section = new Set(data.map(r => r.section_title));
    activeFilters.workbook = new Set(data.map(r => r.workbook_title));
    activeFilters.student = new Set(data.map(r => r.student_name));
    activeFilters.advisor = new Set(data.map(r => r.advisor_name));
}

/**
 * Renders the filter UI component
 */
function renderFiltersSection(data) {
    const filterContainer = document.getElementById('filter-section');
    filterContainer.innerHTML = '';

    const filterConfigs = [
        { label: 'Filters by Section', key: 'section', dataKey: 'section_title' },
        { label: 'Filters by Workbook', key: 'workbook', dataKey: 'workbook_title' },
        { label: 'Filters by Student', key: 'student', dataKey: 'student_name' },
        { label: 'Filters by Advisor', key: 'advisor', dataKey: 'advisor_name' }
    ];

    filterConfigs.forEach(conf => {
        const uniqueValues = [...new Set(data.map(r => r[conf.dataKey]))].sort();

        const group = document.createElement('div');
        group.className = 'filter-group';

        const labelRow = document.createElement('div');
        labelRow.className = 'filter-label-row';

        const label = document.createElement('span');
        label.className = 'filter-label';
        label.textContent = conf.label;
        labelRow.appendChild(label);

        const toggleAll = document.createElement('button');
        toggleAll.className = 'toggle-all';
        const isAllSelected = uniqueValues.every(val => activeFilters[conf.key].has(val));
        toggleAll.textContent = isAllSelected ? 'Deselect All' : 'Select All';
        toggleAll.onclick = () => {
            if (isAllSelected) {
                activeFilters[conf.key].clear();
            } else {
                uniqueValues.forEach(val => activeFilters[conf.key].add(val));
            }
            renderFiltersSection(data);
            applyFiltersAndRender();
        };
        labelRow.appendChild(toggleAll);
        group.appendChild(labelRow);

        const buttons = document.createElement('div');
        buttons.className = 'filter-buttons';

        uniqueValues.forEach(val => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${activeFilters[conf.key].has(val) ? 'active' : ''}`;
            btn.textContent = val || 'N/A';
            btn.onclick = () => {
                if (activeFilters[conf.key].has(val)) {
                    activeFilters[conf.key].delete(val);
                } else {
                    activeFilters[conf.key].add(val);
                }
                renderFiltersSection(data);
                applyFiltersAndRender();
            };
            buttons.appendChild(btn);
        });

        group.appendChild(buttons);
        filterContainer.appendChild(group);
    });
}

/**
 * Filters the current rotation data based on active filters and triggers table render
 */
function applyFiltersAndRender() {
    filteredData = currentRotationData.filter(row => {
        return activeFilters.section.has(row.section_title) &&
            activeFilters.workbook.has(row.workbook_title) &&
            activeFilters.student.has(row.student_name) &&
            activeFilters.advisor.has(row.advisor_name);
    });

    sortData();
    renderTable();
}

/**
 * Sorts the filtered data based on currentSort configuration
 */
function sortData() {
    filteredData.sort((a, b) => {
        let valA = a[currentSort.column] || '';
        let valB = b[currentSort.column] || '';

        // Handle dates
        if (currentSort.column.includes('date')) {
            valA = new Date(valA).getTime() || 0;
            valB = new Date(valB).getTime() || 0;
        }

        if (valA < valB) return currentSort.desc ? 1 : -1;
        if (valA > valB) return currentSort.desc ? -1 : 1;
        return 0;
    });
}

/**
 * Renders the worksheet table
 */
function renderTable() {
    const thead = document.querySelector('#data-table thead');
    const tbody = document.getElementById('table-body');

    // Headers
    const baseHeaders = [
        { label: 'Workbook Title', key: 'workbook_title' },
        { label: 'Workbook ID', key: 'workbook_id' },
        { label: 'HN', key: 'hospital_number' },
        { label: 'AN', key: 'admission_number' },
        { label: 'Student Name', key: 'student_name' },
        { label: 'Student Email', key: 'student_email' },
        { label: 'Advisor Name', key: 'advisor_name' },
        { label: 'Advisor Email', key: 'advisor_email' },
        { label: 'Submitted Date', key: 'submitted_date' },
        { label: 'Approved Date', key: 'approved_date' },
        { label: 'Status', key: 'status' },
        { label: 'Worksheet Title', key: 'worksheet_title' },
        { label: 'Worksheet ID', key: 'worksheet_id' }
    ];

    const headers = [...baseHeaders, ...extraHeaders];

    thead.innerHTML = '';
    const htr = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h.label;
        th.title = h.label; // Tooltip for header
        th.style.width = '10em'; // Slightly wider default and fixed for stability

        // Add resizer handle
        const resizer = document.createElement('div');
        resizer.className = 'resizer';
        th.appendChild(resizer);
        initResizer(th, resizer);

        if (currentSort.column === h.key) {
            th.className = currentSort.desc ? 'sort-desc' : 'sort-asc';
        }
        th.onclick = (e) => {
            // If clicking the resizer, don't sort or copy
            if (e.target.className === 'resizer') return;

            // Copy header name
            copyToClipboard(h.label);

            if (currentSort.column === h.key) {
                currentSort.desc = !currentSort.desc;
            } else {
                currentSort.column = h.key;
                currentSort.desc = false;
            }
            sortData();
            renderTable();
        };
        htr.appendChild(th);
    });
    thead.appendChild(htr);

    // Body
    tbody.innerHTML = '';
    filteredData.forEach(row => {
        const tr = document.createElement('tr');
        if (row.is_duplicate) tr.className = 'duplicate-row';

        headers.forEach(h => {
            const td = document.createElement('td');
            let val = row[h.key];

            // Handle display formatting
            if (val === undefined || val === null || val === '') {
                td.textContent = '-';
            } else {
                // Format dates for display
                if (h.key.includes('date') && val !== '-') {
                    try {
                        val = new Date(val).toLocaleString('th-TH', {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        });
                    } catch (e) { }
                }
                td.textContent = val;
            }

            td.title = val || h.label; // Tooltip for cell content

            // Apply color coding based on header type
            if (h.type === 'rubric' && val === 'NA') {
                td.className = 'eval-grey';
            } else if (h.type === 'su') {
                if (val === 'S') td.className = 'eval-green';
                if (val === 'U') td.className = 'eval-red';
            } else if (h.type === 'ordinal' && val) {
                const prefix = val.substring(0, 2).toUpperCase();
                if (['OS', 'EE', 'ME'].includes(prefix)) td.className = 'eval-green';
                else if (['BE', 'UA'].includes(prefix)) td.className = 'eval-red';
            }

            // Status Highlighting for the base 'status' column
            if (h.key === 'status') {
                if (val === 'Approved') td.classList.add('status-approved');
                if (val === 'Submitted') {
                    const subDate = new Date(row.submitted_at);
                    const now = new Date();
                    const diffDays = (now - subDate) / (1000 * 60 * 60 * 24);
                    if (diffDays > 7) td.classList.add('status-delayed');
                }
            }

            td.onclick = (e) => {
                e.stopPropagation();
                copyToClipboard(val || '-');
            };

            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 2rem;">No data matching filters</td></tr>';
    }
}

/**
 * Clipboard helper
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const toast = document.getElementById('copy-toast');
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 2000);
    });
}

/**
 * Logic for dragging the resizer on a table header
 * Fixed version to prevent "springing"
 */
function initResizer(th, resizer) {
    let x = 0;
    let w = 0;

    const mouseMoveHandler = function (e) {
        const dx = e.clientX - x;
        // Setting exact pixel width overcomes "springing" in table-layout: fixed
        th.style.width = `${w + dx}px`;
    };

    const mouseUpHandler = function () {
        resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };

    resizer.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        e.preventDefault();

        x = e.clientX;
        const styles = window.getComputedStyle(th);
        w = parseInt(styles.width, 10);

        resizer.classList.add('resizing');

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });
}

/**
 * Main Export Logic
 * 1. Gather filtered IDs
 * 2. Fetch results from webhook
 * 3. Transform hierarchical JSON to flattened CSV
 * 4. Trigger download
 */
async function handleExport() {
    if (filteredData.length === 0) {
        alert('ไม่มีข้อมูลที่จะส่งออก');
        return;
    }

    const exportBtn = document.getElementById('export-btn');
    const originalText = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = 'Processing...';

    try {
        // 0. Reset score expansion state for new fresh download
        extraHeaders = [];

        // 1. Send only wbws with Status "Approved"
        const approvedRows = filteredData.filter(row => row.status && row.status.toLowerCase() === 'approved');

        if (approvedRows.length === 0) {
            alert('ไม่มี workbook ที่มีสถานะ "Approved" ในหน้านี้');
            return;
        }

        const wbws = approvedRows.map(row => ({
            workbook_id: row.workbook_id,
            worksheet_id: row.worksheet_id
        }));

        let results = [];

        if (results.length === 0) {
            const payload = {
                "request": "results",
                "wbws": wbws
            };

            const response = await fetch('https://playground.n8n.md.chula.ac.th/webhook/docqadmin', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${dashboardData.token}`,
                    'X-User-Email': dashboardData.token_email
                },
                body: JSON.stringify(payload)
            });
            results = await response.json();
        }

        if (!results || results.length === 0) {
            throw new Error('No data received from export call');
        }

        // 2. Print in dev console when data comes back
        console.log('Raw n8n Result Data:', results);

        const transformed = transformResults(results);

        // 3. Print transformed array in dev console
        console.log('Transformed Score Data:', transformed);

        // 4. Update the original table: Merge scores into currentRotationData
        const resultsArray = Array.isArray(results) ? results : [results];

        // Use a map for fast lookup
        const scoreLookup = new Map();
        transformed.rows.forEach(scoreRow => {
            const wsId = scoreRow[0]; // worksheet_id is the first element
            const scoreObj = {};
            transformed.headers.forEach((hKey, idx) => {
                scoreObj[hKey] = scoreRow[idx];
            });
            scoreLookup.set(wsId, scoreObj);
        });

        // Update main data entries
        currentRotationData.forEach(row => {
            if (scoreLookup.has(row.worksheet_id)) {
                Object.assign(row, scoreLookup.get(row.worksheet_id));
            }
        });

        // 5. Update extra headers metadata (discovered by transformResults)
        extraHeaders = transformed.headerMetadata;

        // 6. Expand table and allow sorting/filtering
        renderTable();

        // 7. Generate FULL CSV (Base Columns + Extra Columns)
        const fullCSV = generateFullCSV();
        downloadCSV(fullCSV);

    } catch (error) {
        console.error('Export Error:', error);
        alert('เกิดข้อผิดพลาดในการส่งออกข้อมูล: ' + error.message);
    } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = originalText;
    }
}

/**
 * Transforms the results JSON into structured headers and rows
 */
function transformResults(results) {
    const dataArray = Array.isArray(results) ? results : [results];

    // 1. Discover ALL unique tools and criteria across ALL rows
    const suTools = new Set();
    const ordinalTools = new Set();
    const rubricMap = new Map(); // rubric_title -> Set(criterion_title)

    dataArray.forEach(row => {
        if (row.su_results && row.su_results.su_list) {
            row.su_results.su_list.forEach(t => {
                if (t.su_metric && t.su_metric.title) {
                    suTools.add(t.su_metric.title);
                }
            });
        }
        if (row.su_list) {
            row.su_list.forEach(t => {
                if (t.su_metric && t.su_metric.title) {
                    suTools.add(t.su_metric.title);
                }
            });
        }
        if (row.su_scale_results) {
            row.su_scale_results.forEach(t => suTools.add(t.title));
        }
        if (row.ordinal_scale_results) {
            row.ordinal_scale_results.forEach(t => ordinalTools.add(t.title));
        }
        if (row.rubric_results) {
            const r = row.rubric_results;
            const rTitle = r.rubric_title || "General Rubric";
            if (!rubricMap.has(rTitle)) {
                rubricMap.set(rTitle, new Set());
            }
            if (r.rubric_criteria) {
                r.rubric_criteria.forEach(c => rubricMap.get(rTitle).add(c.criterion_title));
            }
        }
    });

    // 2. Build Header Metadata (Label vs Key)
    const headerMetadata = [];

    // Sort and map SU
    [...suTools].sort().forEach(title => {
        headerMetadata.push({ label: title, key: title, type: 'su' });
    });

    // Sort and map Ordinal
    [...ordinalTools].sort().forEach(title => {
        headerMetadata.push({ label: title, key: title, type: 'ordinal' });
    });

    // Sort and map Rubrics (Using composite key Title|Criterion for uniqueness)
    [...rubricMap.keys()].sort().forEach(rTitle => {
        const criteria = [...rubricMap.get(rTitle)].sort();
        criteria.forEach(cTitle => {
            headerMetadata.push({
                label: cTitle,
                key: `${rTitle}|${cTitle}`,
                type: 'rubric'
            });
        });
    });

    // Add Metrics
    const metrics = ['Total Score', 'Max Score', 'Max Score (Non-NA)', '% from Max', '% from Non-NA'];
    metrics.forEach(m => {
        headerMetadata.push({ label: m, key: m, type: 'metric' });
    });

    const headers = ['worksheet_id', ...headerMetadata.map(m => m.key)];

    // 3. Build Rows
    const rows = dataArray.map(row => {
        const resultRow = [];
        resultRow.push(row.id || 'N/A');

        // Map values into resultRow based on headerMetadata
        headerMetadata.forEach(meta => {
            let val = '';

            if (meta.type === 'su') {
                // Try structure: su_results.su_list
                const foundNewest = (row.su_results && row.su_results.su_list ? row.su_results.su_list : []).find(t => t.su_metric && t.su_metric.title === meta.key);
                if (foundNewest) {
                    val = foundNewest.is_satisfied ? 'S' : 'U';
                } else {
                    // Try structure: su_list
                    const foundNew = (row.su_list || []).find(t => t.su_metric && t.su_metric.title === meta.key);
                    if (foundNew) {
                        val = foundNew.is_satisfied ? 'S' : 'U';
                    } else {
                        // Fallback to old structure if exists
                        const foundOld = (row.su_scale_results || []).find(t => t.title === meta.key);
                        val = foundOld ? foundOld.options.text_score : '';
                    }
                }
            } else if (meta.type === 'ordinal') {
                const found = (row.ordinal_scale_results || []).find(t => t.title === meta.key);
                val = found ? found.options.text_score : '';
            } else if (meta.type === 'rubric') {
                // rubric meta.key is "RubricTitle|CriterionTitle"
                const [rTitle, cTitle] = meta.key.split('|');
                const rRes = row.rubric_results;
                if (rRes && (rRes.rubric_title === rTitle || (!rRes.rubric_title && rTitle === "General Rubric"))) {
                    const crit = (rRes.rubric_criteria || []).find(c => c.criterion_title === cTitle);
                    if (crit) {
                        const opt = crit.rubric_option || {};
                        if (opt.is_na) val = 'NA';
                        else val = opt.weighted_score !== undefined ? opt.weighted_score : '';
                    }
                }
            }
            // Metrics are handled separately below
            if (meta.type !== 'metric') {
                resultRow.push(val);
            }
        });

        // Calculate Metrics for this row
        let rowTotal = 0;
        let rowMax = 0;
        let rowMaxNonNA = 0;

        // Use ONLY the criteria found in this student's specific JSON
        if (row.rubric_results && row.rubric_results.rubric_criteria) {
            row.rubric_results.rubric_criteria.forEach(crit => {
                const opt = crit.rubric_option || {};
                const cMax = Number(crit.criterion_max_score) || 0;
                const cScore = Number(opt.weighted_score) || 0;

                rowMax += cMax;
                if (opt.is_na) {
                    // Item skipped
                } else {
                    rowTotal += cScore;
                    rowMaxNonNA += cMax;
                }
            });
        }

        // Push Metric values
        resultRow.push(rowTotal);
        resultRow.push(rowMax);
        resultRow.push(rowMaxNonNA);
        resultRow.push(rowMax > 0 ? (rowTotal / rowMax * 100).toFixed(4) : '0.0000');
        resultRow.push(rowMaxNonNA > 0 ? (rowTotal / rowMaxNonNA * 100).toFixed(4) : '0.0000');

        return resultRow;
    });

    return { headers, rows, headerMetadata };
}

/**
 * Generates a full CSV string based on all current headers and filtered data
 */
function generateFullCSV() {
    const baseHeaders = [
        { label: 'Workbook Title', key: 'workbook_title' },
        { label: 'Workbook ID', key: 'workbook_id' },
        { label: 'HN', key: 'hospital_number' },
        { label: 'AN', key: 'admission_number' },
        { label: 'Student Name', key: 'student_name' },
        { label: 'Student Email', key: 'student_email' },
        { label: 'Advisor Name', key: 'advisor_name' },
        { label: 'Advisor Email', key: 'advisor_email' },
        { label: 'Submitted Date', key: 'submitted_date' },
        { label: 'Approved Date', key: 'approved_date' },
        { label: 'Status', key: 'status' },
        { label: 'Worksheet Title', key: 'worksheet_title' },
        { label: 'Worksheet ID', key: 'worksheet_id' }
    ];

    const headers = [...baseHeaders, ...extraHeaders];
    
    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const headerLine = headers.map(h => escapeCsv(h.label)).join(',');
    const rowLines = filteredData.map(row => {
        return headers.map(h => escapeCsv(row[h.key])).join(',');
    }).join('\n');

    return headerLine + '\n' + rowLines;
}

/**
 * Replace previous buildCSVString with simplified version if needed
 */
function buildCSVString(headers, rows) {
    // This is now legacy but we keep it for any separate transformations
    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const headerLine = headers.map(escapeCsv).join(',');
    const rowLines = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
    return headerLine + '\n' + rowLines;
}

/**
 * Renders the score table on screen
 */
function renderScoreTable(headers, rows) {
    const section = document.getElementById('score-preview-section');
    const thead = document.querySelector('#score-preview-table thead');
    const tbody = document.getElementById('score-table-body');

    section.style.display = 'block';

    // Headers
    thead.innerHTML = '';
    const htr = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        htr.appendChild(th);
    });
    thead.appendChild(htr);

    // Body
    tbody.innerHTML = '';
    rows.forEach(rowArr => {
        const tr = document.createElement('tr');
        rowArr.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell === '' ? '-' : cell;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    // Scroll into view
    section.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Replace previous generateCSV with new structure if it still exists
 */
function generateCSV(results) {
    const { headers, rows } = transformResults(results);
    return buildCSVString(headers, rows);
}

/**
 * Triggers browser download of CSV string
 */
function downloadCSV(csvContent) {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');

    const fileName = `${timestamp}.csv`;

    // Add UTF-8 BOM for Excel compatibility
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, fileName);
    } else {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
