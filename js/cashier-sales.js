
// Sales View Functions
if (!window.currentSalesFilter) {
    window.currentSalesFilter = 'today';
}

// Pagination
const SALES_PER_PAGE = 5;
let currentSalesPage = 1;

window.loadSales = async function () {
    currentSalesPage = 1; // Reset to first page
    await filterSales(window.currentSalesFilter);
};

window.filterSales = async function (filter, keepPage = false) {
    console.log('filterSales called with filter:', filter);
    window.currentSalesFilter = filter;

    if (!keepPage) {
        currentSalesPage = 1; // Reset to first page only if not paginating
    }

    // Update filter button states
    const filterBtns = document.querySelectorAll('.sales-filter-btn');
    filterBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(filter)) {
            btn.classList.add('active');
        }
    });

    const salesList = document.getElementById('salesList');
    if (!salesList) {
        console.error('salesList element not found');
        return;
    }

    salesList.innerHTML = '<div class="loading-spinner">Loading sales...</div>';

    try {
        const user = auth.getCurrentUser();
        console.log('Current user:', user);

        if (!user) {
            salesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <h3>Not logged in</h3>
                    <p>Please log in to view sales</p>
                </div>
            `;
            return;
        }

        // Get all transactions for this cashier
        console.log('Fetching transactions...');
        const allTransactions = await db.getAll('transactions');
        console.log('All transactions:', allTransactions.length);

        // Filter by cashier and storeId
        let transactions = allTransactions.filter(t =>
            t.cashier === user.username &&
            t.storeId === user.storeId &&
            !t.voided
        );
        console.log('Filtered transactions for cashier:', transactions.length);

        // Apply date filter
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (filter === 'today') {
            transactions = transactions.filter(t => new Date(t.date) >= today);
        } else if (filter === 'yesterday') {
            transactions = transactions.filter(t => {
                const txDate = new Date(t.date);
                return txDate >= yesterday && txDate < today;
            });
        } else if (filter === 'recent') {
            // Last 20 transactions
            transactions = transactions.slice(0, 20);
        }

        // Sort by date descending
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        console.log('Final transactions after filter:', transactions.length);

        // Calculate total sales
        const totalAmount = transactions.reduce((sum, t) => sum + (t.total || t.amount || 0), 0);
        const totalCount = transactions.length;

        // Fetch expenses for this cashier
        const allExpenses = await db.getAll('expenses');
        let expenses = allExpenses.filter(exp =>
            exp.storeId === user.storeId &&
            exp.cashier === user.username
        );

        // Fetch collectibles for this cashier
        const allCollectibles = await db.getAll('collectibles');
        let collectibles = allCollectibles.filter(col => {
            const totalAmt = parseFloat(col.totalAmount) || 0;
            const paidAmt = parseFloat(col.paidAmount) || 0;
            const balance = totalAmt - paidAmt;

            return col.storeId === user.storeId &&
                col.cashier === user.username &&
                balance > 0; // Only count outstanding balances
        });

        // Apply same date filter to expenses and collectibles
        if (filter === 'today') {
            expenses = expenses.filter(e => new Date(e.date) >= today);
            collectibles = collectibles.filter(c => new Date(c.createdAt || c.date) >= today);
        } else if (filter === 'yesterday') {
            expenses = expenses.filter(e => {
                const expDate = new Date(e.date);
                return expDate >= yesterday && expDate < today;
            });
            collectibles = collectibles.filter(c => {
                const colDate = new Date(c.createdAt || c.date);
                return colDate >= yesterday && colDate < today;
            });
        } else if (filter === 'recent') {
            // For recent, use today's expenses and collectibles
            expenses = expenses.filter(e => new Date(e.date) >= today);
            collectibles = collectibles.filter(c => new Date(c.createdAt || c.date) >= today);
        }

        // Calculate totals
        const totalExpenses = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
        const totalCollectibles = collectibles.reduce((sum, col) => {
            const totalAmt = parseFloat(col.totalAmount) || 0;
            const paidAmt = parseFloat(col.paidAmount) || 0;
            return sum + (totalAmt - paidAmt);
        }, 0);

        // Net Profit = Total Sales - Expenses - Collectibles
        const netProfit = totalAmount - totalExpenses - totalCollectibles;

        console.log('📊 Sales Stats (cashier-sales.js):');
        console.log('  Total Sales:', formatCurrency(totalAmount));
        console.log('  Expenses:', formatCurrency(totalExpenses));
        console.log('  Collectibles:', formatCurrency(totalCollectibles));
        console.log('  Net Profit:', formatCurrency(netProfit));

        // Update stats
        const totalAmountEl = document.getElementById('salesTotalAmount');
        const totalCountEl = document.getElementById('salesTotalCount');
        const netProfitEl = document.getElementById('salesNetProfit');

        if (totalAmountEl) totalAmountEl.textContent = formatCurrency(totalAmount);
        if (totalCountEl) totalCountEl.textContent = totalCount;
        if (netProfitEl) {
            netProfitEl.textContent = formatCurrency(netProfit);
            if (netProfit < 0) {
                netProfitEl.style.color = 'var(--danger)';
            } else {
                netProfitEl.style.color = 'var(--success-dark)';
            }
        }

        // Render sales list with pagination
        if (transactions.length === 0) {
            salesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h3>No sales found</h3>
                    <p>No transactions for this period</p>
                </div>
            `;
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(transactions.length / SALES_PER_PAGE);
        const startIndex = (currentSalesPage - 1) * SALES_PER_PAGE;
        const endIndex = startIndex + SALES_PER_PAGE;
        const paginatedTransactions = transactions.slice(startIndex, endIndex);

        // Render paginated sales
        salesList.innerHTML = paginatedTransactions.map(transaction => {
            const date = new Date(transaction.date);
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            // Handle both new (total) and legacy (amount) fields
            const total = transaction.total || transaction.amount || 0;
            const items = transaction.items || [];
            const itemCount = items.length;

            return `
                <div class="sale-card" onclick="viewTransactionDetails('${transaction.id}')">
                    <div class="sale-header">
                        <div>
                            <div class="sale-id">${formatTransactionId(transaction.id)}</div>
                            <div class="sale-date">${dateStr} at ${timeStr}</div>
                        </div>
                        <div class="sale-amount">${formatCurrency(total)}</div>
                    </div>
                    <div class="sale-details">
                        <span>${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span>${transaction.paymentMethod || 'Cash'}</span>
                        ${transaction.customerName ? `<span>•</span><span>${escapeHtml(transaction.customerName)}</span>` : ''}
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
                        onclick="changeSalesPage(${currentSalesPage - 1})"
                        ${currentSalesPage === 1 ? 'disabled' : ''}
                        style="min-width: 80px; ${currentSalesPage === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                    >
                        <i class="ph ph-caret-left"></i> Previous
                    </button>
                    
                    <span style="font-size: 0.9rem; color: var(--text-secondary); min-width: 100px; text-align: center;">
                        Page ${currentSalesPage} of ${totalPages}
                    </span>
                    
                    <button 
                        class="btn btn-secondary" 
                        onclick="changeSalesPage(${currentSalesPage + 1})"
                        ${currentSalesPage === totalPages ? 'disabled' : ''}
                        style="min-width: 80px; ${currentSalesPage === totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                    >
                        Next <i class="ph ph-caret-right"></i>
                    </button>
                </div>
            `;
            salesList.innerHTML += paginationHTML;
        }

        console.log('Sales loaded successfully');

    } catch (error) {
        console.error('Error loading sales:', error);
        salesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h3>Error loading sales</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
};

// Helper function to format transaction ID
function formatTransactionId(id) {
    if (!id) return 'N/A';
    // Show last 8 characters
    return 'TXN-' + id.slice(-8).toUpperCase();
}

// Pagination function
window.changeSalesPage = function (page) {
    currentSalesPage = page;
    filterSales(window.currentSalesFilter, true);

    // Scroll to top of sales list
    const salesView = document.getElementById('salesView');
    if (salesView) {
        salesView.scrollTop = 0;
    }
};

// -------------------------------------------------------
// Sale Breakdown Modal (My Sales tab)
// -------------------------------------------------------

// Inject slideUpModal keyframe animation once
(function injectSaleModalStyles() {
    if (document.getElementById('saleBreakdownStyles')) return;
    const style = document.createElement('style');
    style.id = 'saleBreakdownStyles';
    style.textContent = `
        @keyframes slideUpModal {
            from { opacity: 0; transform: translateY(40px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        #saleBreakdownModal { display: none; }
        #saleBreakdownModal.open { display: flex !important; }
        .sale-breakdown-item {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 0.55rem 0;
            border-bottom: 1px dashed rgba(0,0,0,0.07);
            font-size: 0.9rem;
        }
        .sale-breakdown-item:last-child { border-bottom: none; }
        .sale-breakdown-item-name { font-weight: 500; color: var(--gray-800, #1f2937); }
        .sale-breakdown-item-qty  { font-size: 0.8rem; color: var(--gray-500, #6b7280); margin-top: 0.1rem; }
        .sale-breakdown-item-subtotal { font-weight: 700; color: var(--gray-800, #1f2937); white-space: nowrap; }
        .sale-breakdown-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.4rem;
            font-size: 0.9rem;
        }
        .sale-breakdown-row.total {
            font-size: 1.15rem;
            font-weight: 800;
            margin-top: 0.5rem;
            padding-top: 0.5rem;
            border-top: 2px solid rgba(99,102,241,0.2);
            color: #6366f1;
        }
        .sale-breakdown-row .label { color: var(--gray-600, #4b5563); }
        .sale-breakdown-row .value { font-weight: 600; }
    `;
    document.head.appendChild(style);
})();

window.viewTransactionDetails = async function (transactionId) {
    const modal = document.getElementById('saleBreakdownModal');
    if (!modal) return;

    // Show loading state
    modal.classList.add('open');
    document.getElementById('saleBreakdownId').textContent = 'Loading...';
    document.getElementById('saleBreakdownDate').textContent = '';
    document.getElementById('saleBreakdownItems').innerHTML = '<div style="text-align:center;padding:1rem;color:#9ca3af;">Loading...</div>';
    document.getElementById('saleBreakdownTotals').innerHTML = '';
    document.getElementById('saleBreakdownPaymentInfo').innerHTML = '';
    document.getElementById('saleBreakdownVoidedBadge').style.display = 'none';
    document.getElementById('saleBreakdownVoidReason').style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
        // Fetch transaction from DB
        const transaction = await db.get('transactions', transactionId);
        if (!transaction) {
            document.getElementById('saleBreakdownItems').innerHTML = '<div style="text-align:center;padding:1rem;color:#ef4444;">Transaction not found.</div>';
            return;
        }

        const isVoided = transaction.status === 'voided';
        const total = transaction.total || transaction.amount || 0;
        const items = transaction.items || [];
        const date = new Date(transaction.date);
        const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        // Header info
        document.getElementById('saleBreakdownId').textContent = '#' + formatTransactionId(transaction.id);
        document.getElementById('saleBreakdownDate').textContent = dateStr + ' at ' + timeStr;

        // Voided badge
        if (isVoided) {
            document.getElementById('saleBreakdownVoidedBadge').style.display = 'block';
            document.getElementById('saleBreakdownHeader').style.background = 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)';
        } else {
            document.getElementById('saleBreakdownHeader').style.background = 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)';
        }

        // Void reason
        if (isVoided && transaction.voidReason) {
            const voidDiv = document.getElementById('saleBreakdownVoidReason');
            voidDiv.style.display = 'block';
            voidDiv.innerHTML = `<strong>⚠️ Void Reason:</strong> ${escapeHtml(transaction.voidReason)}`;
        }

        // Items list
        if (items.length === 0) {
            document.getElementById('saleBreakdownItems').innerHTML = '<div style="color:#9ca3af;font-size:0.9rem;text-align:center;padding:0.5rem;">No items recorded</div>';
        } else {
            document.getElementById('saleBreakdownItems').innerHTML = items.map(item => {
                const itemSubtotal = item.subtotal || (item.price * item.quantity) || 0;
                const modifiers = item.modifiers && item.modifiers.length > 0
                    ? `<div style="font-size:0.75rem;color:#9ca3af;margin-top:0.15rem;">${item.modifiers.map(m => `+ ${escapeHtml(m.name || m)}`).join(', ')}</div>`
                    : '';
                return `
                    <div class="sale-breakdown-item">
                        <div>
                            <div class="sale-breakdown-item-name">${escapeHtml(item.name)}</div>
                            <div class="sale-breakdown-item-qty">${item.quantity} × ${formatCurrency(item.price)}</div>
                            ${modifiers}
                        </div>
                        <div class="sale-breakdown-item-subtotal">${formatCurrency(itemSubtotal)}</div>
                    </div>
                `;
            }).join('');
        }

        // Totals section
        const subtotal = items.reduce((sum, item) => sum + (item.subtotal || (item.price * item.quantity) || 0), 0);
        const discount = transaction.discount || 0;
        const tax = transaction.tax || 0;
        let totalsHtml = '';
        if (discount > 0) {
            totalsHtml += `
                <div class="sale-breakdown-row">
                    <span class="label">Subtotal</span>
                    <span class="value">${formatCurrency(subtotal)}</span>
                </div>
                <div class="sale-breakdown-row">
                    <span class="label" style="color:#10b981;">Discount</span>
                    <span class="value" style="color:#10b981;">- ${formatCurrency(discount)}</span>
                </div>`;
        }
        if (tax > 0) {
            totalsHtml += `
                <div class="sale-breakdown-row">
                    <span class="label">Tax</span>
                    <span class="value">${formatCurrency(tax)}</span>
                </div>`;
        }
        totalsHtml += `
            <div class="sale-breakdown-row total">
                <span>Total</span>
                <span>${formatCurrency(total)}</span>
            </div>`;
        document.getElementById('saleBreakdownTotals').innerHTML = totalsHtml;

        // Payment info
        const amountPaid = transaction.amountPaid || total;
        const change = transaction.change || Math.max(0, amountPaid - total);
        document.getElementById('saleBreakdownPaymentInfo').innerHTML = `
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.6rem;">
                <i class="ph ph-credit-card" style="font-size:1.1rem;color:#6366f1;"></i>
                <span style="font-weight:700;font-size:0.95rem;color:#6366f1;">Payment Info</span>
            </div>
            <div class="sale-breakdown-row" style="margin-bottom:0.25rem;">
                <span class="label">Method</span>
                <span class="value">${escapeHtml(transaction.paymentMethod || 'Cash')}</span>
            </div>
            ${amountPaid > 0 && amountPaid !== total ? `
            <div class="sale-breakdown-row" style="margin-bottom:0.25rem;">
                <span class="label">Amount Paid</span>
                <span class="value">${formatCurrency(amountPaid)}</span>
            </div>
            <div class="sale-breakdown-row" style="margin-bottom:0.25rem;">
                <span class="label">Change</span>
                <span class="value" style="color:#10b981;">${formatCurrency(change)}</span>
            </div>` : ''}
            ${transaction.customerName ? `
            <div class="sale-breakdown-row" style="margin-bottom:0;">
                <span class="label"><i class="ph ph-user" style="font-size:0.9rem;"></i> Customer</span>
                <span class="value">${escapeHtml(transaction.customerName)}</span>
            </div>` : ''}
        `;

        // Reprint button
        const reprintBtn = document.getElementById('saleBreakdownReprintBtn');
        if (reprintBtn) {
            if (typeof printTransactionReceipt === 'function') {
                reprintBtn.style.display = '';
                reprintBtn.onclick = () => printTransactionReceipt(transaction, transaction.id);
            } else {
                reprintBtn.style.display = 'none';
            }
        }

    } catch (error) {
        console.error('Error loading transaction details:', error);
        document.getElementById('saleBreakdownItems').innerHTML = `<div style="text-align:center;padding:1rem;color:#ef4444;">Error: ${error.message}</div>`;
    }
};

window.closeSaleBreakdownModal = function () {
    const modal = document.getElementById('saleBreakdownModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
};

// Close modal on backdrop click
document.addEventListener('click', function (e) {
    const modal = document.getElementById('saleBreakdownModal');
    if (e.target === modal) closeSaleBreakdownModal();
});
