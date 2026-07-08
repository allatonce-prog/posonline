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

// Helper for slot machine rolling number animation with CSS blur effect
function animateStatValue(element, targetValue, isCurrency = false) {
    if (!element) return;
    
    const target = parseFloat(targetValue) || 0;
    const currentText = element.textContent || '';
    
    // Parse current numeric value from element text (removing currency symbol and commas)
    let currentVal = parseFloat(element.dataset.currentVal);
    if (isNaN(currentVal)) {
        const cleanText = currentText.replace(/[₱,]/g, '').trim();
        currentVal = parseFloat(cleanText) || 0;
    }
    
    // Save new value in dataset
    element.dataset.currentVal = target;
    
    // Add animation class (which applies the blur and scaling keyframe effect)
    element.classList.remove('num-animating');
    // Force DOM reflow to restart CSS animation
    void element.offsetWidth;
    element.classList.add('num-animating');
    
    // Animation configuration
    const duration = 850; // ms
    const startTime = performance.now();
    const startVal = currentVal;
    
    function updateNumber(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-out cubic easing function
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const currentNum = startVal + (target - startVal) * easedProgress;
        
        if (isCurrency) {
            element.textContent = formatCurrency(currentNum);
        } else {
            element.textContent = Math.round(currentNum).toLocaleString('en-US');
        }
        
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        } else {
            // Animation finished: set exact target and clean up classes
            if (isCurrency) {
                element.textContent = formatCurrency(target);
            } else {
                element.textContent = Math.round(target).toLocaleString('en-US');
            }
            setTimeout(() => {
                element.classList.remove('num-animating');
            }, 100);
        }
    }
    
    requestAnimationFrame(updateNumber);
}

// Load dashboard with selected time range
async function loadDashboardWithRange(range, isSilent = false) {
    if (!isSilent) {
        showLoading('Loading data...');
    }

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

        let cashSales = 0;
        let gcashSales = 0;

        rangeTransactions
            .filter(t => t.status !== 'voided')
            .forEach(t => {
                const total = Number(t.total) || Number(t.amount) || 0;
                const method = t.paymentMethod || 'cash';
                const methodLower = method.toLowerCase();
                if (methodLower === 'split') {
                    cashSales += Number(t.cashAmount) || 0;
                    gcashSales += Number(t.gcashAmount) || 0;
                } else if (methodLower === 'mobile' || methodLower === 'gcash') {
                    gcashSales += total;
                } else {
                    cashSales += total;
                }
            });

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
        const todayCashSalesEl = document.getElementById('todayCashSales');
        const todayGcashSalesEl = document.getElementById('todayGcashSales');
        const todayExpensesDashEl = document.getElementById('todayExpensesDash');
        const todayCollectiblesEl = document.getElementById('todayCollectibles');
        const todayCollectedEl = document.getElementById('todayCollected');
        const totalTransactionsEl = document.getElementById('totalTransactions');
        const todayNetProfitEl = document.getElementById('todayNetProfit');
        const monthDeliveriesEl = document.getElementById('monthDeliveries');

        // Update Labels based on range
        updateStatLabels(range);
        if (todaySalesEl) animateStatValue(todaySalesEl, sales, true);
        if (todayCashSalesEl) animateStatValue(todayCashSalesEl, cashSales, true);
        if (todayGcashSalesEl) animateStatValue(todayGcashSalesEl, gcashSales, true);
        if (todayExpensesDashEl) animateStatValue(todayExpensesDashEl, expensesTotal, true);
        if (todayCollectiblesEl) animateStatValue(todayCollectiblesEl, collectiblesTotal, true);
        if (todayCollectedEl) animateStatValue(todayCollectedEl, collectedTotal, true);
        if (monthDeliveriesEl) animateStatValue(monthDeliveriesEl, deliveriesTotal, true);
 
        const salesTransactionsCount = rangeTransactions.filter(t => t.type !== 'collectible_payment' && t.status !== 'voided').length;
        if (totalTransactionsEl) animateStatValue(totalTransactionsEl, salesTransactionsCount, false);
        if (todayNetProfitEl) animateStatValue(todayNetProfitEl, netProfit, true);
 
        // Calculate total items (units) sold in range
        const totalItemsSold = rangeTransactions
            .filter(t => t.status !== 'voided' && t.type !== 'collectible_payment')
            .reduce((sum, t) => {
                if (!t.items || !Array.isArray(t.items)) return sum;
                return sum + t.items.reduce((s, item) => s + (Number(item.quantity) || 0), 0);
            }, 0);
        const totalItemsSoldEl = document.getElementById('totalItemsSold');
        if (totalItemsSoldEl) animateStatValue(totalItemsSoldEl, totalItemsSold, false);

        // Aggregate items sold
        const itemSalesMap = {};
        rangeTransactions
            .filter(t => t.status !== 'voided' && t.type !== 'collectible_payment')
            .forEach(t => {
                if (!t.items || !Array.isArray(t.items)) return;
                t.items.forEach(item => {
                    const pid = item.productId || item.id;
                    if (!pid) return;
                    if (!itemSalesMap[pid]) {
                        itemSalesMap[pid] = {
                            productId: pid,
                            name: item.name,
                            price: Number(item.price) || 0,
                            quantity: 0,
                        };
                    }
                    itemSalesMap[pid].quantity += (Number(item.quantity) || 0);
                });
            });

        const productMap = {};
        if (Array.isArray(products)) {
            products.forEach(p => {
                productMap[p.id] = p;
            });
        }

        const sortedSoldItems = Object.values(itemSalesMap)
            .sort((a, b) => b.quantity - a.quantity);

        const soldItemsListContainer = document.getElementById('soldItemsListContainer');
        if (soldItemsListContainer) {
            if (sortedSoldItems.length === 0) {
                soldItemsListContainer.innerHTML = `
                    <div style="text-align: center; color: var(--gray-400); padding: 1.5rem 0; font-size: 0.85rem; font-weight: 500; width: 100%;">
                        No items sold in this range
                    </div>`;
            } else {
                soldItemsListContainer.innerHTML = sortedSoldItems.map(item => {
                    const productImage = productMap[item.productId]?.image || null;
                    return `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; background: var(--gray-50); border-radius: 12px; border: 1px solid var(--gray-100); transition: all 0.2s;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 40px; height: 40px; border-radius: 8px; overflow: hidden; background: var(--gray-100); display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid var(--gray-200);">
                                    ${productImage ? `<img src="${productImage}" style="width: 100%; height: 100%; object-fit: cover;">` : '<span style="font-size: 1.2rem;">📦</span>'}
                                </div>
                                <div style="display: flex; flex-direction: column;">
                                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--gray-800); text-align: left;">${item.name}</span>
                                    <span style="font-size: 0.75rem; color: var(--gray-500); font-weight: 500; text-align: left;">₱${item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
                                <span style="font-size: 0.85rem; font-weight: 750; color: var(--success-dark);">${item.quantity} sold</span>
                                <span style="font-size: 0.75rem; color: var(--gray-400); font-weight: 500;">₱${(item.quantity * item.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

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

        if (!isSilent) {
            hideLoading();
        }
    } catch (error) {
        console.error('Error loading dashboard with range:', error);
        if (!isSilent) {
            hideLoading();
        }
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
            loadDashboardWithRange(currentTimeRange, true);
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
            cashSales: "Cash Payments (Today)",
            gcashSales: "GCash Payments (Today)",
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
            cashSales: "Cash Payments (This Week)",
            gcashSales: "GCash Payments (This Week)",
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
            cashSales: "Cash Payments (This Month)",
            gcashSales: "GCash Payments (This Month)",
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
            cashSales: "Cash Payments (Period)",
            gcashSales: "GCash Payments (Period)",
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
    setLabel('todayCashSalesLabel', text.cashSales);
    setLabel('todayGcashSalesLabel', text.gcashSales);
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
