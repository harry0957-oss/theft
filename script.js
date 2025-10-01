const DEFAULT_CATEGORIES = [
    'Uncategorised',
    'Housing',
    'Utilities',
    'Groceries',
    'Transport',
    'Entertainment',
    'Subscriptions',
    'Health',
    'Savings',
    'Income'
];

const CATEGORY_RULES = [
    {
        category: 'Income',
        keywords: ['SALARY', 'PAYROLL', 'PAYCHEQUE', 'PAYCHECK', 'WAGES', 'HMRC', 'DIVIDEND', 'BONUS'],
        predicate: tx => tx.credit > tx.debit
    },
    {
        category: 'Groceries',
        keywords: ['TESCO', 'SAINSBURY', 'ASDA', 'ALDI', 'LIDL', 'WAITROSE', 'MORRISONS', 'ICELAND', 'CO-OP']
    },
    {
        category: 'Transport',
        keywords: ['UBER', 'LYFT', 'TFL', 'TRAINLINE', 'NATIONAL RAIL', 'STAGECOACH', 'AVANTI', 'SHELL', 'BP', 'ESSO']
    },
    {
        category: 'Entertainment',
        keywords: ['CINEMA', 'THEATRE', 'BOWLING', 'CONCERT', 'EVENTBRITE']
    },
    {
        category: 'Subscriptions',
        keywords: ['SPOTIFY', 'NETFLIX', 'DISNEY', 'APPLE MUSIC', 'GOOGLE', 'AMAZON PRIME', 'MICROSOFT', 'ADOBE']
    },
    {
        category: 'Health',
        keywords: ['BOOT', 'PHARMACY', 'DENTAL', 'OPTICAL', 'DOCTOR', 'CLINIC']
    },
    {
        category: 'Utilities',
        keywords: ['BRITISH GAS', 'EDF', 'EON', 'OCTOPUS', 'SCOTTISH POWER', 'THAMES WATER', 'UNITED UTILITIES', 'VIRGIN MEDIA', 'SKY']
    },
    {
        category: 'Housing',
        keywords: ['RENT', 'MORTGAGE', 'LANDLORD', 'ESTATE', 'COUNCIL TAX']
    },
    {
        category: 'Savings',
        keywords: ['SAVINGS', 'ISA', 'INVESTMENT', 'VANGUARD', 'ETRADE', 'ROBINHOOD']
    }
];

const CHART_COLOURS = [
    '#60a5fa',
    '#34d399',
    '#fbbf24',
    '#f87171',
    '#a78bfa',
    '#f472b6',
    '#38bdf8',
    '#facc15',
    '#fb7185',
    '#4ade80'
];

const STORAGE_KEYS = {
    CATEGORY_MEMORY: 'financial-tracker-category-memory'
};

const categoryMemory = loadCategoryMemory();

function createEmptyFilters() {
    return {
        startDate: '',
        endDate: '',
        types: new Set(),
        categories: new Set(),
        searchTerm: ''
    };
}

const state = {
    files: new Map(),
    transactions: [],
    categories: new Set(DEFAULT_CATEGORIES),
    selection: new Set(),
    filters: createEmptyFilters()
};

let fileCounter = 0;
let transactionCounter = 0;
let barChartInstance = null;
let pieChartInstance = null;

const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const categoryForm = document.getElementById('category-form');
const categoryInput = document.getElementById('new-category');
const categoryPills = document.getElementById('category-pills');
const filtersForm = document.getElementById('filters');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const typeOptions = document.getElementById('type-options');
const categoryOptions = document.getElementById('category-options');
const resetFiltersButton = document.getElementById('reset-filters');
const paydayForm = document.getElementById('payday-form');
const paydayDayInput = document.getElementById('payday-day');
const paydayMonthInput = document.getElementById('payday-month');
const paydayNote = document.getElementById('payday-note');
const summaryCount = document.getElementById('summary-count');
const summaryDebit = document.getElementById('summary-debit');
const summaryCredit = document.getElementById('summary-credit');
const summaryNet = document.getElementById('summary-net');
const transactionsBody = document.getElementById('transactions-body');
const selectAllCheckbox = document.getElementById('select-all');
const bulkCategorySelect = document.getElementById('bulk-category');
const applyBulkButton = document.getElementById('apply-bulk');
const selectionCount = document.getElementById('selection-count');
const emptyState = document.getElementById('empty-state');
const descriptionSearchInput = document.getElementById('description-search');
const descriptionSuggestions = document.getElementById('description-suggestions');
const exportButton = document.getElementById('export-data');
const restoreInput = document.getElementById('restore-input');

fileInput.addEventListener('change', handleFileSelection);
categoryForm.addEventListener('submit', handleAddCategory);
startDateInput.addEventListener('change', () => updateFilter('startDate', startDateInput.value));
endDateInput.addEventListener('change', () => updateFilter('endDate', endDateInput.value));
resetFiltersButton.addEventListener('click', resetFilters);
paydayForm.addEventListener('submit', handlePaydaySubmit);
selectAllCheckbox.addEventListener('change', handleSelectAll);
applyBulkButton.addEventListener('click', applyBulkCategory);

if (descriptionSearchInput) {
    descriptionSearchInput.addEventListener('input', handleSearchInput);
    descriptionSearchInput.addEventListener('focus', () => updateSearchSuggestions(state.filters.searchTerm));
}
if (filtersForm) {
    filtersForm.addEventListener('submit', (event) => {
        event.preventDefault();
    });
}
if (exportButton) {
    exportButton.addEventListener('click', exportDataSnapshot);
}
if (restoreInput) {
    restoreInput.addEventListener('change', handleRestoreSnapshot);
}

document.addEventListener('DOMContentLoaded', () => {
    refreshCategoriesUI();
    refreshTypeFilterOptions();
    render();
});

function handleFileSelection(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
        return;
    }

    files.forEach(file => parseCsv(file));
    event.target.value = '';
}

function parseCsv(file) {
    const fileId = `file-${++fileCounter}`;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            if (results.errors.length) {
                console.error('Failed to parse file', file.name, results.errors);
                return;
            }

            const parsedTransactions = results.data
                .map(row => normaliseRow(row, fileId, file.name))
                .filter(Boolean);

            if (!parsedTransactions.length) {
                return;
            }

            state.files.set(fileId, {
                id: fileId,
                name: file.name,
                count: parsedTransactions.length
            });

            state.transactions.push(...parsedTransactions);
            parsedTransactions.forEach(tx => state.categories.add(tx.category));

            renderFileList();
            refreshCategoriesUI();
            refreshTypeFilterOptions();
            render();
        }
    });
}

function normaliseRow(row, fileId, fileName) {
    const dateValue = (row['Transaction Date'] || row['Date'] || '').trim();
    const type = (row['Transaction Type'] || row['Type'] || '').trim();
    const description = (row['Transaction Description'] || row['Description'] || '').trim();
    const debitRaw = row['Debit Amount'] ?? row['Debit'] ?? '';
    const creditRaw = row['Credit Amount'] ?? row['Credit'] ?? '';
    const balanceRaw = row['Balance'] ?? '';

    if (!dateValue || (!debitRaw && !creditRaw && !description)) {
        return null;
    }

    const date = parseDate(dateValue);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const hasDebit = hasNumericValue(debitRaw);
    const hasCredit = hasNumericValue(creditRaw);
    const hasBalance = hasNumericValue(balanceRaw);
    const debit = hasDebit ? parseAmount(debitRaw) : 0;
    const credit = hasCredit ? parseAmount(creditRaw) : 0;
    const balance = hasBalance ? parseAmount(balanceRaw) : null;
    const category = inferCategory({ description, type, debit, credit });

    return {
        id: `tx-${++transactionCounter}`,
        fileId,
        fileName,
        date,
        type,
        description,
        debit,
        credit,
        balance,
        hasDebit,
        hasCredit,
        hasBalance,
        category
    };
}

function parseDate(value) {
    const trimmed = value.trim();
    const parts = trimmed.split(/[\/\-]/);
    if (parts.length === 3) {
        let [day, month, year] = parts.map(part => part.replace(/[^0-9]/g, ''));
        if (year && year.length === 2) {
            year = `20${year}`;
        }
        const dayNum = Number(day);
        const monthNum = Number(month) - 1;
        const yearNum = Number(year);
        return new Date(yearNum, monthNum, dayNum);
    }
    return new Date(trimmed);
}

function parseAmount(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    const normalised = String(value).replace(/[^0-9.-]/g, '');
    const amount = Number.parseFloat(normalised);
    return Number.isFinite(amount) ? amount : 0;
}

function hasNumericValue(value) {
    if (value === null || value === undefined) {
        return false;
    }
    return String(value).trim() !== '';
}

function inferCategory(tx) {
    const stored = getStoredCategory(tx.description);
    if (stored) {
        return stored;
    }

    const descriptionText = (tx.description || '').toUpperCase();
    const typeText = (tx.type || '').toUpperCase();
    const haystack = `${typeText} ${descriptionText}`;

    for (const rule of CATEGORY_RULES) {
        if (rule.predicate && !rule.predicate(tx)) {
            continue;
        }
        if (rule.keywords.some(keyword => keyword && haystack.includes(keyword))) {
            return rule.category;
        }
    }

    if (tx.credit > 0 && tx.credit >= tx.debit) {
        return 'Income';
    }

    return 'Uncategorised';
}

function renderFileList() {
    fileList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    Array.from(state.files.values()).forEach(file => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.innerHTML = `
            <span>${file.name} <small>(${file.count} transactions)</small></span>
            <button type="button" data-file-id="${file.id}">Remove</button>
        `;
        li.querySelector('button').addEventListener('click', () => removeFile(file.id));
        fragment.appendChild(li);
    });

    fileList.appendChild(fragment);
}

function removeFile(fileId) {
    state.files.delete(fileId);
    state.transactions = state.transactions.filter(tx => tx.fileId !== fileId);
    state.selection.clear();
    renderFileList();
    refreshTypeFilterOptions();
    render();
}

function handleAddCategory(event) {
    event.preventDefault();
    const value = categoryInput.value.trim();
    if (!value) {
        return;
    }
    state.categories.add(value);
    categoryInput.value = '';
    refreshCategoriesUI();
    render();
}

function renderCategoryPills() {
    categoryPills.innerHTML = '';
    const fragment = document.createDocumentFragment();
    getSortedCategories().forEach(category => {
        const pill = document.createElement('span');
        pill.className = 'category-pill';
        pill.textContent = category;
        fragment.appendChild(pill);
    });
    categoryPills.appendChild(fragment);
}

function getSortedCategories() {
    const categories = Array.from(state.categories);
    categories.sort((a, b) => a.localeCompare(b));
    const index = categories.indexOf('Uncategorised');
    if (index > 0) {
        categories.splice(index, 1);
        categories.unshift('Uncategorised');
    }
    return categories;
}

function refreshCategorySelects() {
    const categories = getSortedCategories();
    bulkCategorySelect.innerHTML = categories
        .map(category => `<option value="${category}">${category}</option>`)
        .join('');
}

function refreshCategoriesUI() {
    renderCategoryPills();
    refreshCategorySelects();
    refreshCategoryFilterOptions();
}

function renderFilterOptions() {
    refreshTypeFilterOptions();
    refreshCategoryFilterOptions();
}

function refreshTypeFilterOptions() {
    const uniqueTypes = new Set(state.transactions.map(tx => tx.type).filter(Boolean));
    typeOptions.innerHTML = '';
    uniqueTypes.forEach(type => {
        const label = document.createElement('label');
        label.className = 'chip';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = type;
        input.checked = state.filters.types.has(type);
        input.addEventListener('change', () => toggleFilterSet(state.filters.types, type));
        label.append(input, document.createTextNode(type));
        typeOptions.appendChild(label);
    });
}

function refreshCategoryFilterOptions() {
    const categories = getSortedCategories();
    categoryOptions.innerHTML = '';
    categories.forEach(category => {
        const label = document.createElement('label');
        label.className = 'chip';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = category;
        input.checked = state.filters.categories.has(category);
        input.addEventListener('change', () => toggleFilterSet(state.filters.categories, category));
        label.append(input, document.createTextNode(category));
        categoryOptions.appendChild(label);
    });
}

function toggleFilterSet(set, value) {
    clearSelection();
    if (set.has(value)) {
        set.delete(value);
    } else {
        set.add(value);
    }
    render();
}

function handleSearchInput(event) {
    const { value } = event.target;
    updateFilter('searchTerm', value.trim() ? value : '');
}

function updateSearchSuggestions(query = '') {
    if (!descriptionSuggestions) {
        return;
    }

    const counts = new Map();
    state.transactions.forEach(tx => {
        const description = (tx.description || '').trim();
        if (!description) {
            return;
        }
        counts.set(description, (counts.get(description) ?? 0) + 1);
    });

    const normalisedQuery = query.trim().toLowerCase();
    const matches = Array.from(counts.entries())
        .map(([description, count]) => {
            const lower = description.toLowerCase();
            let rank = 2;
            if (!normalisedQuery) {
                rank = 0;
            } else if (lower.startsWith(normalisedQuery)) {
                rank = 0;
            } else if (lower.includes(normalisedQuery)) {
                rank = 1;
            }
            return { description, count, rank };
        })
        .filter(item => !normalisedQuery || item.rank < 2)
        .sort((a, b) => a.rank - b.rank || b.count - a.count || a.description.localeCompare(b.description))
        .slice(0, 12);

    descriptionSuggestions.innerHTML = '';
    const fragment = document.createDocumentFragment();
    matches.forEach(item => {
        const option = document.createElement('option');
        option.value = item.description;
        fragment.appendChild(option);
    });
    descriptionSuggestions.appendChild(fragment);
}

function exportDataSnapshot() {
    const snapshot = buildSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateStamp = new Date().toISOString().split('T')[0];
    anchor.href = url;
    anchor.download = `financial-tracker-${dateStamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function buildSnapshot() {
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        categoryMemory: Array.from(categoryMemory.entries()),
        categories: Array.from(state.categories),
        files: Array.from(state.files.values()).map(file => ({ ...file })),
        filters: {
            startDate: state.filters.startDate,
            endDate: state.filters.endDate,
            searchTerm: state.filters.searchTerm,
            types: Array.from(state.filters.types),
            categories: Array.from(state.filters.categories)
        },
        transactions: state.transactions.map(tx => ({
            id: tx.id,
            fileId: tx.fileId,
            fileName: tx.fileName,
            date: tx.date.toISOString(),
            type: tx.type,
            description: tx.description,
            debit: tx.debit,
            credit: tx.credit,
            balance: tx.balance,
            hasDebit: tx.hasDebit,
            hasCredit: tx.hasCredit,
            hasBalance: tx.hasBalance,
            category: tx.category
        }))
    };
}

function handleRestoreSnapshot(event) {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            applySnapshot(data);
        } catch (error) {
            console.error('Unable to restore snapshot', error);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

function applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return;
    }

    if (Array.isArray(snapshot.categoryMemory)) {
        restoreCategoryMemory(snapshot.categoryMemory);
    }

    const transactions = Array.isArray(snapshot.transactions)
        ? snapshot.transactions
              .map(parseSnapshotTransaction)
              .filter(Boolean)
        : [];

    state.transactions = transactions;

    const snapshotCategories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
    state.categories = new Set([...DEFAULT_CATEGORIES, ...snapshotCategories]);
    state.transactions.forEach(tx => state.categories.add(tx.category));

    const filesMap = new Map();
    if (Array.isArray(snapshot.files)) {
        snapshot.files.forEach(file => {
            if (file && file.id) {
                filesMap.set(file.id, { ...file, count: 0 });
            }
        });
    }

    state.transactions.forEach(tx => {
        const existing = filesMap.get(tx.fileId) ?? { id: tx.fileId, name: tx.fileName, count: 0 };
        existing.name = tx.fileName || existing.name;
        existing.count = (existing.count ?? 0) + 1;
        filesMap.set(existing.id, existing);
    });

    state.files = filesMap;

    transactionCounter = state.transactions.reduce((max, tx) => Math.max(max, extractCounter(tx.id, 'tx-')), 0);
    fileCounter = 0;
    state.files.forEach(file => {
        fileCounter = Math.max(fileCounter, extractCounter(file.id, 'file-'));
    });

    state.selection.clear();
    renderFileList();
    refreshCategoriesUI();
    refreshTypeFilterOptions();

    const availableTypes = new Set(state.transactions.map(tx => tx.type).filter(Boolean));
    const availableCategories = new Set(state.categories);

    if (snapshot.filters && typeof snapshot.filters === 'object') {
        const filters = createEmptyFilters();
        filters.startDate = snapshot.filters.startDate || '';
        filters.endDate = snapshot.filters.endDate || '';
        filters.searchTerm = snapshot.filters.searchTerm || '';
        (Array.isArray(snapshot.filters.types) ? snapshot.filters.types : []).forEach(type => {
            if (availableTypes.has(type)) {
                filters.types.add(type);
            }
        });
        (Array.isArray(snapshot.filters.categories) ? snapshot.filters.categories : []).forEach(category => {
            if (availableCategories.has(category)) {
                filters.categories.add(category);
            }
        });
        state.filters = filters;
        startDateInput.value = filters.startDate;
        endDateInput.value = filters.endDate;
        descriptionSearchInput.value = filters.searchTerm;
    } else {
        state.filters = createEmptyFilters();
        startDateInput.value = '';
        endDateInput.value = '';
        descriptionSearchInput.value = '';
    }

    paydayNote.textContent = '';
    renderFilterOptions();
    render();
}

function parseSnapshotTransaction(raw) {
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.fileId || !raw.date) {
        return null;
    }

    const date = new Date(raw.date);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const debit = Number.parseFloat(raw.debit) || 0;
    const credit = Number.parseFloat(raw.credit) || 0;
    const balance = raw.balance === null || raw.balance === undefined ? null : Number.parseFloat(raw.balance);

    return {
        id: raw.id,
        fileId: raw.fileId,
        fileName: raw.fileName || 'Imported snapshot',
        date,
        type: raw.type || '',
        description: raw.description || '',
        debit,
        credit,
        balance,
        hasDebit: raw.hasDebit !== undefined ? Boolean(raw.hasDebit) : debit !== 0,
        hasCredit: raw.hasCredit !== undefined ? Boolean(raw.hasCredit) : credit !== 0,
        hasBalance: raw.hasBalance !== undefined ? Boolean(raw.hasBalance) : balance !== null,
        category: raw.category || 'Uncategorised'
    };
}

function extractCounter(id, prefix) {
    if (typeof id !== 'string' || !id.startsWith(prefix)) {
        return 0;
    }
    const numeric = Number.parseInt(id.slice(prefix.length), 10);
    return Number.isFinite(numeric) ? numeric : 0;
}

function updateFilter(key, value) {
    clearSelection();
    state.filters[key] = value;
    render();
}

function resetFilters() {
    clearSelection();
    state.filters = createEmptyFilters();
    startDateInput.value = '';
    endDateInput.value = '';
    descriptionSearchInput.value = '';
    paydayNote.textContent = '';
    renderFilterOptions();
    render();
}

function handlePaydaySubmit(event) {
    event.preventDefault();
    const day = Number(paydayDayInput.value);
    const monthValue = paydayMonthInput.value;
    if (!day || !monthValue) {
        return;
    }
    const [year, month] = monthValue.split('-').map(Number);
    const start = new Date(year, month - 1, day);
    const end = new Date(year, month, day);
    end.setDate(end.getDate() - 1);

    const startIso = start.toISOString().split('T')[0];
    const endIso = end.toISOString().split('T')[0];

    startDateInput.value = startIso;
    endDateInput.value = endIso;
    updateFilter('startDate', startIso);
    updateFilter('endDate', endIso);

    paydayNote.textContent = `Showing transactions from ${formatDisplayDate(start)} to ${formatDisplayDate(end)}.`;
}

function formatDisplayDate(date) {
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function applyFilters(transactions) {
    return transactions.filter(tx => {
        if (state.filters.startDate) {
            const start = new Date(state.filters.startDate);
            if (tx.date < start) {
                return false;
            }
        }
        if (state.filters.endDate) {
            const end = new Date(state.filters.endDate);
            end.setHours(23, 59, 59, 999);
            if (tx.date > end) {
                return false;
            }
        }
        if (state.filters.searchTerm) {
            const query = state.filters.searchTerm.toLowerCase();
            const description = (tx.description || '').toLowerCase();
            if (!description.includes(query)) {
                return false;
            }
        }
        if (state.filters.types.size && !state.filters.types.has(tx.type)) {
            return false;
        }
        if (state.filters.categories.size && !state.filters.categories.has(tx.category)) {
            return false;
        }
        return true;
    });
}

function render() {
    const filteredTransactions = applyFilters(state.transactions);
    filteredTransactions.sort((a, b) => b.date - a.date);
    renderTransactions(filteredTransactions);
    renderSummary(filteredTransactions);
    renderCharts(filteredTransactions);
    updateSelectionState(filteredTransactions);
    if (descriptionSearchInput) {
        descriptionSearchInput.value = state.filters.searchTerm;
    }
    updateSearchSuggestions(state.filters.searchTerm);
}

function renderTransactions(transactions) {
    transactionsBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    transactions.forEach(tx => {
        const row = document.createElement('tr');
        if (state.selection.has(tx.id)) {
            row.classList.add('selected');
        }

        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.selection.has(tx.id);
        checkbox.addEventListener('change', () => toggleSelection(tx.id));
        checkboxCell.appendChild(checkbox);
        row.appendChild(checkboxCell);

        row.appendChild(createCell(formatDisplayDate(tx.date)));
        row.appendChild(createCell(tx.type || '—'));
        row.appendChild(createCell(tx.description || '—'));
        row.appendChild(createCell(tx.hasDebit ? formatCurrency(tx.debit) : '—'));
        row.appendChild(createCell(tx.hasCredit ? formatCurrency(tx.credit) : '—'));
        row.appendChild(createCell(tx.hasBalance ? formatCurrency(tx.balance) : '—'));

        const categoryCell = document.createElement('td');
        const select = document.createElement('select');
        getSortedCategories().forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
        if (!state.categories.has(tx.category)) {
            state.categories.add(tx.category);
            refreshCategoriesUI();
        }
        select.value = tx.category;
        select.addEventListener('change', () => {
            tx.category = select.value;
            rememberCategory(tx.description, tx.category);
            render();
        });
        categoryCell.appendChild(select);
        row.appendChild(categoryCell);

        row.appendChild(createCell(tx.fileName));

        fragment.appendChild(row);
    });

    transactionsBody.appendChild(fragment);
    emptyState.hidden = transactions.length > 0;
}

function createCell(content) {
    const cell = document.createElement('td');
    cell.textContent = content;
    return cell;
}

function formatCurrency(value) {
    if (!value) {
        return '£0.00';
    }
    const sign = value < 0 ? '-' : '';
    const absolute = Math.abs(value);
    return `${sign}£${absolute.toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function renderSummary(transactions) {
    const totalDebit = transactions.reduce((sum, tx) => sum + tx.debit, 0);
    const totalCredit = transactions.reduce((sum, tx) => sum + tx.credit, 0);
    const net = totalCredit - totalDebit;

    summaryCount.textContent = transactions.length.toLocaleString();
    summaryDebit.textContent = formatCurrency(totalDebit);
    summaryCredit.textContent = formatCurrency(totalCredit);
    summaryNet.textContent = formatCurrency(net);

    summaryNet.classList.toggle('positive', net >= 0);
    summaryNet.classList.toggle('negative', net < 0);
}

function renderCharts(transactions) {
    const spendingByCategory = new Map();

    transactions.forEach(tx => {
        if (!tx.debit) {
            return;
        }
        const current = spendingByCategory.get(tx.category) ?? 0;
        spendingByCategory.set(tx.category, current + tx.debit);
    });

    const labels = Array.from(spendingByCategory.keys());
    const data = Array.from(spendingByCategory.values());

    drawBarChart(labels, data);
    drawPieChart(labels, data);
}

function drawBarChart(labels, data) {
    const canvas = document.getElementById('category-chart');
    if (!canvas) {
        return;
    }

    if (barChartInstance) {
        barChartInstance.destroy();
        barChartInstance = null;
    }

    if (!labels.length) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    barChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Debit total (£)',
                    data,
                    backgroundColor: labels.map((_, index) => `${CHART_COLOURS[index % CHART_COLOURS.length]}99`),
                    borderColor: labels.map((_, index) => CHART_COLOURS[index % CHART_COLOURS.length]),
                    borderWidth: 1,
                    borderRadius: 12
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        color: '#e2e8f0'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.15)'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#e2e8f0',
                        callback: value => `£${value}`
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.15)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: context => `£${context.parsed.y.toFixed(2)}`
                    }
                }
            }
        }
    });
}

function drawPieChart(labels, data) {
    const canvas = document.getElementById('category-pie-chart');
    if (!canvas) {
        return;
    }

    if (pieChartInstance) {
        pieChartInstance.destroy();
        pieChartInstance = null;
    }

    if (!labels.length) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const total = data.reduce((sum, value) => sum + value, 0) || 1;

    pieChartInstance = new Chart(canvas, {
        type: 'pie',
        data: {
            labels,
            datasets: [
                {
                    data,
                    backgroundColor: labels.map((_, index) => `${CHART_COLOURS[index % CHART_COLOURS.length]}cc`),
                    borderColor: 'rgba(15, 23, 42, 0.3)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e2e8f0'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context => {
                            const value = context.parsed;
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: £${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function toggleSelection(id) {
    if (state.selection.has(id)) {
        state.selection.delete(id);
    } else {
        state.selection.add(id);
    }
    render();
}

function handleSelectAll(event) {
    const checked = event.target.checked;
    const filteredTransactions = applyFilters(state.transactions);
    if (checked) {
        filteredTransactions.forEach(tx => state.selection.add(tx.id));
    } else {
        filteredTransactions.forEach(tx => state.selection.delete(tx.id));
    }
    render();
}

function updateSelectionState(filteredTransactions) {
    const validIds = new Set(state.transactions.map(tx => tx.id));
    state.selection.forEach(id => {
        if (!validIds.has(id)) {
            state.selection.delete(id);
        }
    });
    const allSelected = filteredTransactions.length > 0 && filteredTransactions.every(tx => state.selection.has(tx.id));
    const anySelected = filteredTransactions.some(tx => state.selection.has(tx.id));
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = !allSelected && anySelected;
    selectionCount.textContent = `${state.selection.size} selected`;
}

function applyBulkCategory() {
    const category = bulkCategorySelect.value;
    if (!category || state.selection.size === 0) {
        return;
    }
    state.transactions.forEach(tx => {
        if (state.selection.has(tx.id)) {
            tx.category = category;
            rememberCategory(tx.description, category);
        }
    });
    render();
}

function normaliseCategoryKey(description) {
    return (description || '').trim().toUpperCase();
}

function getStoredCategory(description) {
    const key = normaliseCategoryKey(description);
    if (!key) {
        return undefined;
    }
    return categoryMemory.get(key);
}

function rememberCategory(description, category) {
    const key = normaliseCategoryKey(description);
    if (!key) {
        return;
    }
    if (!category || category === 'Uncategorised') {
        if (categoryMemory.has(key)) {
            categoryMemory.delete(key);
            persistCategoryMemory();
        }
        return;
    }
    categoryMemory.set(key, category);
    persistCategoryMemory();
}

function restoreCategoryMemory(entries) {
    categoryMemory.clear();
    entries.forEach(entry => {
        if (!Array.isArray(entry) || entry.length < 2) {
            return;
        }
        const [key, category] = entry;
        if (typeof key === 'string' && typeof category === 'string' && category && category !== 'Uncategorised') {
            categoryMemory.set(key, category);
        }
    });
    persistCategoryMemory();
}

function loadCategoryMemory() {
    if (typeof localStorage === 'undefined') {
        return new Map();
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.CATEGORY_MEMORY);
        if (!raw) {
            return new Map();
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return new Map();
        }
        const memory = new Map();
        parsed.forEach(entry => {
            if (!Array.isArray(entry) || entry.length < 2) {
                return;
            }
            const [key, category] = entry;
            if (typeof key === 'string' && typeof category === 'string' && category && category !== 'Uncategorised') {
                memory.set(key, category);
            }
        });
        return memory;
    } catch (error) {
        console.error('Unable to load saved categories', error);
        return new Map();
    }
}

function persistCategoryMemory() {
    if (typeof localStorage === 'undefined') {
        return;
    }
    try {
        const serialised = JSON.stringify(Array.from(categoryMemory.entries()));
        localStorage.setItem(STORAGE_KEYS.CATEGORY_MEMORY, serialised);
    } catch (error) {
        console.error('Unable to save category memory', error);
    }
}

function clearSelection() {
    if (state.selection.size === 0) {
        return;
    }
    state.selection.clear();
}
