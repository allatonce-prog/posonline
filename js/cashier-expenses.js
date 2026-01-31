
// Expenses View Functions
if (!window.currentExpensesFilter) {
    window.currentExpensesFilter = 'today';
}

// Pagination
const EXPENSES_PER_PAGE = 5;
let currentExpensesPage = 1;

window.loadExpenses = async function (filter = 'today') {
    currentExpensesPage = 1; // Reset to first page
    await filterExpenses(filter);
};

async function filterExpenses(filter) {
    window.currentExpensesFilter = filter;
    currentExpensesPage = 1; // Reset to first page when filter changes

    // Update title and filter buttons
    const titleEl = document.getElementById('expensesTitle');
    const filterBtns = document.querySelectorAll('#expensesView .sales-filter-btn');

    filterBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(filter)) {
            btn.classList.add('active');
        }
    });

    if (titleEl) {
        if (filter === 'today') {
            titleEl.textContent = "Today's Expenses";
        } else if (filter === 'yesterday') {
            titleEl.textContent = "Yesterday's Expenses";
        } else {
            titleEl.textContent = 'Expense History';
        }
    }

    const expensesList = document.getElementById('expensesList');
    if (!expensesList) {
        console.error('expensesList element not found');
        return;
    }

    expensesList.innerHTML = '<div class="loading-spinner">Loading expenses...</div>';

    try {
        const user = auth.getCurrentUser();
        if (!user) {
            expensesList.innerHTML = '<div class="empty-state"><p>Not logged in</p></div>';
            return;
        }

        // Get all expenses
        const allExpenses = await db.getAll('expenses');

        // Filter by cashier and storeId
        let expenses = allExpenses.filter(e =>
            e.cashier === user.username &&
            e.storeId === user.storeId
        );

        // Apply date filter
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (filter === 'today') {
            expenses = expenses.filter(e => new Date(e.date) >= today);
        } else if (filter === 'yesterday') {
            expenses = expenses.filter(e => {
                const expDate = new Date(e.date);
                return expDate >= yesterday && expDate < today;
            });
        }
        // 'history' shows all

        // Sort by date descending
        expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate total
        const total = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        const totalEl = document.getElementById('todayExpensesTotal');
        if (totalEl) {
            totalEl.textContent = formatCurrency(total);
        }

        // Render expenses list with pagination
        if (expenses.length === 0) {
            expensesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💰</div>
                    <h3>No expenses found</h3>
                    <p>No expenses for this period</p>
                </div>
            `;
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(expenses.length / EXPENSES_PER_PAGE);
        const startIndex = (currentExpensesPage - 1) * EXPENSES_PER_PAGE;
        const endIndex = startIndex + EXPENSES_PER_PAGE;
        const paginatedExpenses = expenses.slice(startIndex, endIndex);

        // Render paginated expenses
        expensesList.innerHTML = paginatedExpenses.map(expense => {
            const date = new Date(expense.date);
            const dateStr = date.toLocaleDateString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric'
            });
            const timeStr = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="sale-card" style="cursor: default;">
                    <div class="sale-header">
                        <div>
                            <div class="sale-id">${dateStr} ${timeStr}</div>
                            <div class="sale-details" style="margin-top: 0.5rem;">
                                <i class="ph ph-receipt"></i>
                                <span>${escapeHtml(expense.reason) || 'No description'}</span>
                            </div>
                        </div>
                        <div class="sale-amount" style="color: var(--danger);">
                            -${formatCurrency(parseFloat(expense.amount) || 0)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Add pagination controls if more than one page
        if (totalPages > 1) {
            const paginationHTML = `
                <div class="pagination-controls" style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.5rem; padding: 1rem;">
                    <button 
                        class="btn btn-secondary" 
                        onclick="changeExpensesPage(${currentExpensesPage - 1})"
                        ${currentExpensesPage === 1 ? 'disabled' : ''}
                        style="min-width: 80px; ${currentExpensesPage === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                    >
                        <i class="ph ph-caret-left"></i> Previous
                    </button>
                    
                    <span style="font-size: 0.9rem; color: var(--text-secondary); min-width: 100px; text-align: center;">
                        Page ${currentExpensesPage} of ${totalPages}
                    </span>
                    
                    <button 
                        class="btn btn-secondary" 
                        onclick="changeExpensesPage(${currentExpensesPage + 1})"
                        ${currentExpensesPage === totalPages ? 'disabled' : ''}
                        style="min-width: 80px; ${currentExpensesPage === totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                    >
                        Next <i class="ph ph-caret-right"></i>
                    </button>
                </div>
            `;
            expensesList.innerHTML += paginationHTML;
        }

    } catch (error) {
        console.error('Error loading expenses:', error);
        expensesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h3>Error loading expenses</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Submit expense
window.submitExpense = async function () {
    const amountEl = document.getElementById('expenseAmount');
    const reasonEl = document.getElementById('expenseReason');

    const amount = parseFloat(amountEl.value);
    const reason = reasonEl.value.trim();

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    if (!reason) {
        showToast('Please enter a reason/description', 'error');
        return;
    }

    try {
        const user = auth.getCurrentUser();
        if (!user) {
            showToast('Not logged in', 'error');
            return;
        }

        showLoading();

        await db.add('expenses', {
            amount: amount,
            reason: reason,
            cashier: user.username,
            storeId: user.storeId,
            date: new Date().toISOString()
        });

        hideLoading();
        showToast('Expense recorded successfully', 'success');

        // Reset form
        amountEl.value = '';
        reasonEl.value = '';

        // Reload expenses
        await loadExpenses(window.currentExpensesFilter);

    } catch (error) {
        hideLoading();
        console.error('Error submitting expense:', error);
        showToast('Error recording expense: ' + error.message, 'error');
    }
};

// Pagination function
window.changeExpensesPage = function (page) {
    currentExpensesPage = page;
    filterExpenses(window.currentExpensesFilter);

    // Scroll to top of expenses list
    const expensesList = document.getElementById('expensesList');
    if (expensesList) {
        expensesList.scrollTop = 0;
    }
};
