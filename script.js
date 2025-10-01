const state = {
    files: new Map(),
    transactions: [],
    categories: new Set([
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
    ]),
    selection: new Set(),
    filters: {
        startDate: '',
        endDate: '',
        types: new Set(),
        categories: new Set()
    }
};

let fileCounter = 0;
let transactionCounter = 0;
let chartInstance = null;

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

fileInput.addEventListener('change', handleFileSelection);
categoryForm.addEventListener('submit', handleAddCategory);
startDateInput.addEventListener('change', () => updateFilter('startDate', startDateInput.value));
endDateInput.addEventListener('change', () => updateFilter('endDate', endDateInput.value));
resetFiltersButton.addEventListener('click', resetFilters);
paydayForm.addEventListener('submit', handlePaydaySubmit);
selectAllCheckbox.addEventListener('change', handleSelectAll);
applyBulkButton.addEventListener('click', applyBulkCategory);

document.addEventListener('DOMContentLoaded', () => {
    renderCategoryPills();
    refreshCategorySelects();
    renderFilterOptions();
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
            renderFileList();
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
        category: 'Uncategorised'
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
    renderCategoryPills();
    refreshCategorySelects();
    renderFilterOptions();
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
    if (set.has(value)) {
        set.delete(value);
    } else {
        set.add(value);
    }
    render();
}

function updateFilter(key, value) {
    state.filters[key] = value;
    render();
}

function resetFilters() {
    state.filters.startDate = '';
    state.filters.endDate = '';
    state.filters.types.clear();
    state.filters.categories.clear();
    startDateInput.value = '';
    endDateInput.value = '';
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
    renderChart(filteredTransactions);
    updateSelectionState(filteredTransactions);
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
            refreshCategorySelects();
            renderFilterOptions();
        }
        select.value = tx.category;
        select.addEventListener('change', () => {
            tx.category = select.value;
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

function renderChart(transactions) {
    const canvas = document.getElementById('category-chart');
    const spendingByCategory = new Map();

    transactions.forEach(tx => {
        const amount = tx.debit;
        if (!amount) {
            return;
        }
        const current = spendingByCategory.get(tx.category) ?? 0;
        spendingByCategory.set(tx.category, current + amount);
    });

    const labels = Array.from(spendingByCategory.keys());
    const data = Array.from(spendingByCategory.values());

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Debit total (£)',
                    data,
                    backgroundColor: 'rgba(96, 165, 250, 0.6)',
                    borderColor: 'rgba(96, 165, 250, 1)',
                    borderWidth: 1,
                    borderRadius: 12
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => `£${value}`
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
        }
    });
    render();
}
