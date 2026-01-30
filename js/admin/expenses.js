// Expenses Management Script

let currentExpensesFilter = 'today';

// Load Expenses
window.loadExpenses = async function () {
    const tableBody = document.getElementById('expensesTable');
    const filterSelect = document.getElementById('expensesFilter');

    if (filterSelect) {
        currentExpensesFilter = filterSelect.value;
    }

    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="4" class="table-empty">Loading expenses...</td></tr>';

    try {
        const expenses = await db.getAll('expenses');

        // Create a more robust filter
        const validExpenses = expenses.filter(exp =>
            exp.amount > 0 &&
            exp.reason &&
            exp.reason.trim() !== '' &&
            exp.cashier &&
            exp.cashier !== 'Unknown'
        );

        // Apply date filtering
        const filteredExpenses = filterExpensesByDate(validExpenses, currentExpensesFilter);

        // Sort by date (newest first)
        filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Update stats
        updateExpenseStats(filteredExpenses);

        // Render table
        if (filteredExpenses.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="table-empty">No expenses found</td></tr>';
            return;
        }

        tableBody.innerHTML = filteredExpenses.map(expense => {
            const dateObj = new Date(expense.date);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
            <tr>
                <td>
                    <div style="font-weight: 500;">${dateStr}</div>
                    <div style="font-size: 0.75rem; color: var(--gray-500);">${timeStr}</div>
                </td>
                <td>${escapeHtml(expense.cashierName || expense.cashier || 'Unknown')}</td>
                <td style="white-space: normal; word-break: break-word;">${escapeHtml(expense.reason)}</td>
                <td style="color: var(--danger); font-weight: bold; white-space: nowrap;">${formatCurrency(expense.amount)}</td>
            </tr>
        `}).join('');

    } catch (error) {
        console.error('Error loading expenses:', error);
        tableBody.innerHTML = `<tr><td colspan="4" class="table-empty" style="color: var(--danger)">Error: ${error.message}</td></tr>`;
    }
}

// Filter expenses helper
function filterExpensesByDate(expenses, filter) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    const last7DaysStart = new Date(todayStart);
    last7DaysStart.setDate(last7DaysStart.getDate() - 7);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return expenses.filter(expense => {
        const date = new Date(expense.date);

        switch (filter) {
            case 'today':
                return date >= todayStart;
            case 'yesterday':
                return date >= yesterdayStart && date < yesterdayEnd;
            case 'last7days':
                return date >= last7DaysStart;
            case 'thisMonth':
                return date >= thisMonthStart;
            case 'recent':
            default:
                return true; // Simple logic: return all, but we limit usually in DB or UI. Here we take all for "recent" but maybe we should limit?
            // For "recent", let's just return everything and the UI sorts it. Or we could limit directly here.
        }
    });

}

function updateExpenseStats(expenses) {
    const totalAmount = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    const count = expenses.length;

    const amountEl = document.getElementById('totalExpensesAmount');
    const countEl = document.getElementById('totalExpensesCount');

    if (amountEl) amountEl.textContent = formatCurrency(totalAmount);
    if (countEl) countEl.textContent = count;
}
