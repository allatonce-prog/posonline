// Time Range Management for Admin Dashboard

let currentTimeRange = 'today';
let customDateRange = { start: null, end: null };

// Switch time range
window.switchTimeRange = function (range) {
    currentTimeRange = range;

    // Update button states
    document.querySelectorAll('.time-range-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'white';
        btn.style.color = 'var(--gray-700)';
        btn.style.borderColor = 'var(--gray-300)';
    });

    const activeBtn = document.querySelector(`.time-range-btn[data-range="${range}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = 'var(--primary)';
        activeBtn.style.color = 'white';
        activeBtn.style.borderColor = 'var(--primary)';
    }

    // Update display
    updateRangeDisplay(range);

    // Reload dashboard with new range
    loadDashboardWithRange(range);
};

// Show custom range modal
window.showCustomRangeModal = function () {
    const modal = document.getElementById('customRangeModal');
    const today = new Date().toISOString().split('T')[0];

    // Set default values
    document.getElementById('customStartDate').value = customDateRange.start || today;
    document.getElementById('customEndDate').value = customDateRange.end || today;

    modal.style.display = 'flex';
};

// Close custom range modal
window.closeCustomRangeModal = function () {
    document.getElementById('customRangeModal').style.display = 'none';
};

// Apply custom range
window.applyCustomRange = function () {
    const startDate = document.getElementById('customStartDate').value;
    const endDate = document.getElementById('customEndDate').value;

    if (!startDate || !endDate) {
        showToast('Please select both start and end dates', 'warning');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        showToast('Start date cannot be after end date', 'warning');
        return;
    }

    customDateRange = { start: startDate, end: endDate };
    closeCustomRangeModal();
    switchTimeRange('custom');
};

// Update range display
function updateRangeDisplay(range) {
    const display = document.getElementById('selectedRangeDisplay');
    if (!display) return;

    const now = new Date();
    let text = '';

    switch (range) {
        case 'today':
            text = formatDate(now);
            break;
        case 'week':
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
            text = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
            break;
        case 'month':
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            text = `${formatDate(monthStart)} - ${formatDate(monthEnd)}`;
            break;
        case 'custom':
            if (customDateRange.start && customDateRange.end) {
                text = `${formatDate(new Date(customDateRange.start))} - ${formatDate(new Date(customDateRange.end))}`;
            }
            break;
    }

    display.textContent = text;
}

// Load dashboard with selected time range
async function loadDashboardWithRange(range) {
    showLoading('Loading data...');

    try {
        // Get date range
        const { startDate, endDate } = getDateRange(range);

        // Fetch all data
        const transactions = await db.getAll('transactions');
        const products = await db.getAll('products');
        const expenses = await db.getAll('expenses');
        const collectibles = await db.getAll('collectibles');

        // Filter by current user's store
        const user = auth.getCurrentUser();
        const storeTransactions = transactions.filter(t => t.storeId === user.storeId);
        const storeExpenses = expenses.filter(e => e.storeId === user.storeId);
        const storeCollectibles = collectibles.filter(c => c.storeId === user.storeId);

        // Filter by date range
        const rangeTransactions = storeTransactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate >= startDate && tDate <= endDate;
        });

        const rangeExpenses = storeExpenses.filter(e => {
            const eDate = new Date(e.date);
            return eDate >= startDate && eDate <= endDate;
        });

        const rangeCollectibles = storeCollectibles.filter(c => {
            const cDate = new Date(c.createdAt || c.date);
            return cDate >= startDate && cDate <= endDate;
        });

        // Calculate stats (exclude voided transactions from sales)
        const sales = rangeTransactions
            .filter(t => t.status !== 'voided')
            .reduce((sum, t) => sum + (Number(t.total) || Number(t.amount) || 0), 0);
        const expensesTotal = rangeExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

        // Calculate deliveries for selected range
        const allDeliveries = await db.getAll('deliveries');
        const rangeDeliveries = allDeliveries.filter(d => {
            const dDate = new Date(d.date);
            return dDate >= startDate && dDate <= endDate;
        });
        const deliveriesTotal = rangeDeliveries.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        // Calculate collectibles (new debt created in range)
        // We sum up ITEMS added in the range for precision, or fall back to document creation date
        const collectiblesTotal = storeCollectibles.reduce((sum, c) => {
            let amountInPeriod = 0;
            const cDate = new Date(c.createdAt || c.date);

            // Validate date
            if (isNaN(cDate.getTime())) {
                return sum;
            }

            const isDocCreatedInRange = cDate >= startDate && cDate < endDate;

            // Scenario 1: Document itself created in range
            if (isDocCreatedInRange) {
                const total = Number(c.totalAmount) || 0;
                const paid = Number(c.paidAmount) || 0;
                amountInPeriod = total - paid;
            }
            // Scenario 2: Old document, but check for new items added in range
            else if (c.items && c.items.length > 0) {
                amountInPeriod = c.items.reduce((isum, i) => {
                    if (i.dateAdded) {
                        const iDate = new Date(i.dateAdded);
                        if (!isNaN(iDate.getTime()) && iDate >= startDate && iDate < endDate) {
                            return isum + (Number(i.total) || 0);
                        }
                    }
                    return isum;
                }, 0);
            }

            return sum + amountInPeriod;
        }, 0);

        // Calculate collected (payments received in range)
        const collectedPayments = rangeTransactions.filter(t => t.type === 'collectible_payment');
        const collectedTotal = collectedPayments.reduce((sum, t) => sum + (Number(t.total) || 0), 0);

        const netProfit = sales - expensesTotal;

        // Update stats (with null checks)
        const todaySalesEl = document.getElementById('todaySales');
        const todayExpensesDashEl = document.getElementById('todayExpensesDash');
        const todayCollectiblesEl = document.getElementById('todayCollectibles');
        const todayCollectedEl = document.getElementById('todayCollected');
        const totalTransactionsEl = document.getElementById('totalTransactions');
        const todayNetProfitEl = document.getElementById('todayNetProfit');
        const monthDeliveriesEl = document.getElementById('monthDeliveries');

        // Update Labels based on range
        updateStatLabels(range);

        if (todaySalesEl) todaySalesEl.textContent = formatCurrency(sales);
        if (todayExpensesDashEl) todayExpensesDashEl.textContent = formatCurrency(expensesTotal);
        if (todayCollectiblesEl) todayCollectiblesEl.textContent = formatCurrency(collectiblesTotal);
        if (todayCollectedEl) todayCollectedEl.textContent = formatCurrency(collectedTotal);
        if (monthDeliveriesEl) monthDeliveriesEl.textContent = formatCurrency(deliveriesTotal);

        const salesTransactionsCount = rangeTransactions.filter(t => t.type !== 'collectible_payment' && t.status !== 'voided').length;
        if (totalTransactionsEl) totalTransactionsEl.textContent = salesTransactionsCount;
        if (todayNetProfitEl) todayNetProfitEl.textContent = formatCurrency(netProfit);

        // Calculate total items (units) sold in range
        const totalItemsSold = rangeTransactions
            .filter(t => t.status !== 'voided' && t.type !== 'collectible_payment')
            .reduce((sum, t) => {
                if (!t.items || !Array.isArray(t.items)) return sum;
                return sum + t.items.reduce((s, item) => s + (Number(item.quantity) || 0), 0);
            }, 0);
        const totalItemsSoldEl = document.getElementById('totalItemsSold');
        if (totalItemsSoldEl) totalItemsSoldEl.textContent = totalItemsSold;

        // Update net profit color
        const netProfitEl = document.getElementById('todayNetProfit');
        const netProfitIcon = document.getElementById('netProfitIcon');
        if (netProfit < 0) {
            netProfitEl.style.color = 'var(--danger)';
            if (netProfitIcon) {
                netProfitIcon.className = 'stat-icon danger';
                netProfitIcon.innerHTML = '<i class="ph ph-trend-down"></i>';
            }
        } else {
            netProfitEl.style.color = 'var(--success-dark)';
            if (netProfitIcon) {
                netProfitIcon.className = 'stat-icon success';
                netProfitIcon.innerHTML = '<i class="ph ph-trend-up"></i>';
            }
        }

        // Update charts if available
        if (typeof updateDashboardCharts === 'function') {
            updateDashboardCharts(rangeTransactions, products);
        }

        hideLoading();
    } catch (error) {
        console.error('Error loading dashboard with range:', error);
        hideLoading();
        showToast('Error loading data: ' + error.message, 'error');
    }
}

// Get date range based on selection
function getDateRange(range) {
    const now = new Date();
    let startDate, endDate;

    switch (range) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            break;
        case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 7);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        case 'custom':
            if (customDateRange.start && customDateRange.end) {
                startDate = new Date(customDateRange.start);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(customDateRange.end);
                endDate.setHours(23, 59, 59, 999);
            } else {
                // Default to today if custom range not set
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
            }
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
    }

    return { startDate, endDate };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Set initial display
    updateRangeDisplay('today');
});

// Auto-refresh functionality
let dashboardRefreshInterval = null;

// Start auto-refresh for dashboard
function startDashboardAutoRefresh() {
    // Clear any existing interval
    stopDashboardAutoRefresh();

    // Refresh every 30 seconds
    dashboardRefreshInterval = setInterval(() => {
        if (currentTimeRange && document.getElementById('dashboard-tab')?.classList.contains('active')) {
            console.log('Auto-refreshing dashboard data...');
            loadDashboardWithRange(currentTimeRange);
        }
    }, 30000); // 30 seconds
}

// Stop auto-refresh
function stopDashboardAutoRefresh() {
    if (dashboardRefreshInterval) {
        clearInterval(dashboardRefreshInterval);
        dashboardRefreshInterval = null;
    }
}

// Update stats labels dynamic
function updateStatLabels(range) {
    const labels = {
        today: {
            sales: "Today's Sales",
            expenses: "Today's Expenses",
            collectibles: "Today's Collectibles",
            collected: "Collections Today",
            transactions: "Sales Transactions Today",
            netProfit: "Net Profit (Today)",
            deliveries: "Today's Deliveries",
            items: "Items Sold Today"
        },
        week: {
            sales: "This Week's Sales",
            expenses: "This Week's Expenses",
            collectibles: "This Week's Collectibles",
            collected: "Collections This Week",
            transactions: "Sales Transactions This Week",
            netProfit: "Net Profit (This Week)",
            deliveries: "This Week's Deliveries",
            items: "Items Sold This Week"
        },
        month: {
            sales: "This Month's Sales",
            expenses: "This Month's Expenses",
            collectibles: "This Month's Collectibles",
            collected: "Collections This Month",
            transactions: "Sales Transactions This Month",
            netProfit: "Net Profit (This Month)",
            deliveries: "This Month's Deliveries",
            items: "Items Sold This Month"
        },
        custom: {
            sales: "Period Sales",
            expenses: "Period Expenses",
            collectibles: "Period Collectibles",
            collected: "Collections (Period)",
            transactions: "Sales Transactions (Period)",
            netProfit: "Net Profit (Period)",
            deliveries: "Period Deliveries",
            items: "Items Sold (Period)"
        }
    };

    const text = labels[range] || labels.custom;

    const setLabel = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setLabel('todaySalesLabel', text.sales);
    setLabel('todayExpensesLabel', text.expenses);
    setLabel('todayCollectiblesLabel', text.collectibles);
    setLabel('todayCollectedLabel', text.collected);
    setLabel('totalTransactionsLabel', text.transactions);
    setLabel('todayNetProfitLabel', text.netProfit);
    setLabel('monthDeliveriesLabel', text.deliveries);
    setLabel('totalItemsSoldLabel', text.items);
}

// Export functions for external use
window.startDashboardAutoRefresh = startDashboardAutoRefresh;
window.stopDashboardAutoRefresh = stopDashboardAutoRefresh;
window.loadDashboardWithRange = loadDashboardWithRange;
