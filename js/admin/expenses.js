// Expenses Management Script

let currentExpensesFilter = 'today';
const expensesPaginator = new PaginationManager(5);

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
            const container = document.getElementById('expensesPaginationContainer');
            if (container) container.innerHTML = '';
            return;
        }

        // Pagination
        const paginated = expensesPaginator.paginate(filteredExpenses);
        const displayExpenses = paginated.data;

        tableBody.innerHTML = displayExpenses.map(expense => {
            const dateObj = new Date(expense.date);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
            <tr>
                <td colspan="4" style="padding: 0; border: none;">
                    <div onclick="viewExpenseDetails('${expense.id}')" style="cursor: pointer; border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.75rem; background: var(--white); display: flex; flex-direction: column; gap: 0.5rem; transition: all 0.2s;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 600; color: var(--dark);">${escapeHtml(expense.reason)}</div>
                                <div style="font-size: 0.8rem; color: var(--gray-500); margin-top: 2px;">
                                    ${dateStr} • ${timeStr}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="color: var(--danger); font-weight: 700; font-size: 1.1rem;">${formatCurrency(expense.amount)}</div>
                                <div style="font-size: 0.75rem; color: var(--gray-400); margin-top: 2px;">
                                    ${escapeHtml(expense.cashierName || expense.cashier || 'Unknown')}
                                </div>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        }).join('');

        // Pagination Controls
        let paginationContainer = document.getElementById('expensesPaginationContainer');
        if (!paginationContainer && tableBody) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'expensesPaginationContainer';
            tableBody.closest('.table-container').appendChild(paginationContainer);
        }

        expensesPaginator.renderControls('expensesPaginationContainer', paginated.totalPages, (page) => {
            expensesPaginator.setPage(page);
            loadExpenses();
        });

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

// View Expense Details
window.viewExpenseDetails = async function (id) {
    try {
        const expense = await db.get('expenses', id);
        if (!expense) {
            showToast('Expense not found', 'error');
            return;
        }

        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.zIndex = '10000'; // Ensure it's on top
        modal.id = 'expenseDetailsModal';

        const dateObj = new Date(expense.date);
        const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Expense Details</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; margin-bottom: 2rem;">
                         <div style="width: 60px; height: 60px; background: rgba(239, 68, 68, 0.1); color: var(--danger); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                            <i class="ph ph-receipt" style="font-size: 30px;"></i>
                        </div>
                        <div style="font-size: 2rem; font-weight: 800; color: var(--danger); margin-bottom: 0.5rem;">
                            ${formatCurrency(expense.amount)}
                        </div>
                        <div style="color: var(--gray-500); font-size: 0.9rem;">
                            ${dateStr} at ${timeStr}
                        </div>
                    </div>

                    <div class="detail-grid" style="grid-template-columns: 1fr; gap: 1rem;">
                         <div class="detail-item" style="border-bottom: 1px solid var(--gray-200); padding-bottom: 1rem;">
                            <p style="font-weight: 600; color: var(--gray-600); font-size: 0.85rem; margin-bottom: 0.25rem;">Reason / Description</p>
                            <p style="font-size: 1.1rem; color: var(--dark); font-weight: 500;">${escapeHtml(expense.reason)}</p>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                             <div class="detail-item">
                                <p style="font-weight: 600; color: var(--gray-600); font-size: 0.85rem; margin-bottom: 0.25rem;">Recorded By</p>
                                <p style="font-size: 1rem; color: var(--dark);">
                                    <i class="ph ph-user-circle" style="vertical-align: middle; margin-right: 4px;"></i>
                                    ${escapeHtml(expense.cashierName || expense.cashier || 'Unknown')}
                                </p>
                            </div>
                             <div class="detail-item">
                                <p style="font-weight: 600; color: var(--gray-600); font-size: 0.85rem; margin-bottom: 0.25rem;">Transaction ID</p>
                                <p style="font-size: 0.85rem; color: var(--gray-500); font-family: monospace;">${expense.id}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

    } catch (error) {
        console.error('Error viewing expense:', error);
        showToast('Error loading details', 'error');
    }
};

// Admin Quick Action: Expense Modal Helpers
window.showAddExpenseModal = function() {
    const modal = document.getElementById('adminExpenseModal');
    if (!modal) return;

    document.getElementById('adminExpenseAmount').value = '';
    document.getElementById('adminExpenseReason').value = '';
    modal.classList.add('active');
    document.body.classList.add('modal-open');

    // Attach click listener for outside click recovery
    const handleOutsideClick = (e) => {
        if (e.target === modal) {
            window.closeAdminExpenseModal();
            modal.removeEventListener('click', handleOutsideClick);
        }
    };
    modal.addEventListener('click', handleOutsideClick);
};

window.closeAdminExpenseModal = function() {
    const modal = document.getElementById('adminExpenseModal');
    if (modal) {
        modal.classList.remove('active');
    }
    document.body.classList.remove('modal-open');
};

window.saveAdminExpense = async function(e) {
    if (e) e.preventDefault();
    const amountVal = document.getElementById('adminExpenseAmount').value;
    const reasonVal = document.getElementById('adminExpenseReason').value.trim();
    const amount = parseFloat(amountVal);

    if (isNaN(amount) || amount <= 0 || !reasonVal) {
        showToast('Please fill in all fields correctly', 'warning');
        return;
    }

    showLoading('Recording expense...');
    try {
        const user = auth.getCurrentUser();
        const expense = {
            date: new Date().toISOString(),
            amount: amount,
            reason: reasonVal,
            cashier: user.username,
            cashierName: user.name || user.username,
            storeId: user.storeId
        };

        await db.add('expenses', expense);
        hideLoading();
        showToast('Expense recorded successfully', 'success');
        window.closeAdminExpenseModal();

        // Refresh metrics dynamically
        if (typeof loadDashboard === 'function') {
            await loadDashboard();
        } else if (typeof loadDashboardWithRange === 'function') {
            await loadDashboardWithRange((typeof currentTimeRange !== 'undefined') ? currentTimeRange : 'today');
        }
        
        if (typeof loadExpenses === 'function') {
            await loadExpenses();
        }
    } catch (error) {
        hideLoading();
        showToast('Error saving expense: ' + error.message, 'error');
    }
};
