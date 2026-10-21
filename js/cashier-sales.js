
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
                    <div class="empty-state-icon"><i class="ph ph-warning-circle"></i></div>
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

        let cashSales = 0;
        let gcashSales = 0;
        transactions.forEach(t => {
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
        const salesCashReceivedEl = document.getElementById('salesCashReceived');
        const salesGcashReceivedEl = document.getElementById('salesGcashReceived');
        const totalCountEl = document.getElementById('salesTotalCount');
        const netProfitEl = document.getElementById('salesNetProfit');

        if (totalAmountEl) totalAmountEl.textContent = formatCurrency(totalAmount);
        if (salesCashReceivedEl) salesCashReceivedEl.textContent = formatCurrency(cashSales);
        if (salesGcashReceivedEl) salesGcashReceivedEl.textContent = formatCurrency(gcashSales);
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
                    <div class="empty-state-icon"><i class="ph ph-clipboard-text" style="font-size: 3.5rem; color: var(--gray-300);"></i></div>
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
            
            const orderBadge = transaction.orderType === 'takeout'
                ? `<span class="badge" style="background:rgba(245, 158, 11, 0.1); color:#d97706; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;"><i class="ph ph-bag"></i> Take-out</span>`
                : `<span class="badge" style="background:rgba(99, 102, 241, 0.1); color:#6366f1; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;"><i class="ph ph-fork-knife"></i> Dine-in</span>`;

            let paymentBadge = `<span class="badge" style="background:rgba(16, 185, 129, 0.1); color:#059669; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;"><i class="ph ph-money"></i> Cash</span>`;
            if (transaction.paymentMethod === 'split') {
                paymentBadge = `<span class="badge" style="background:rgba(16, 185, 129, 0.1); color:#059669; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;"><i class="ph ph-arrows-split"></i> Split</span>`;
            } else if (transaction.paymentMethod?.toLowerCase() === 'gcash' || transaction.paymentMethod?.toLowerCase() === 'mobile') {
                paymentBadge = `<span class="badge" style="background:rgba(59, 130, 246, 0.1); color:#2563eb; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;"><i class="ph ph-device-mobile"></i> GCash</span>`;
            }

            return `
                <div class="sale-card" onclick="viewTransactionDetails('${transaction.id}')" style="cursor: pointer;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem;">
                        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="sale-id" style="font-family: monospace; font-weight: 700; font-size: 0.82rem; background: var(--gray-100); padding: 3px 8px; border-radius: 6px; color: var(--gray-800);">${formatTransactionId(transaction.id)}</span>
                                <span style="font-size: 0.8rem; color: var(--gray-500); display: inline-flex; align-items: center; gap: 4px;"><i class="ph ph-clock"></i> ${dateStr} • ${timeStr}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.35rem; flex-wrap: wrap;">
                                ${orderBadge}
                                ${paymentBadge}
                                <span style="font-size: 0.78rem; color: var(--gray-600); display: inline-flex; align-items: center; gap: 4px;"><i class="ph ph-package"></i> ${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
                                ${transaction.customerName ? `<span style="font-size: 0.78rem; color: var(--gray-600); display: inline-flex; align-items: center; gap: 4px;"><i class="ph ph-user"></i> ${escapeHtml(transaction.customerName)}</span>` : ''}
                            </div>
                        </div>
                        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                            <span style="font-weight: 800; font-size: 1.15rem; color: var(--primary); letter-spacing: -0.02em;">${formatCurrency(total)}</span>
                            <span style="font-size: 0.75rem; color: var(--gray-400); display: inline-flex; align-items: center; gap: 2px;">Details <i class="ph ph-caret-right"></i></span>
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
                <div class="empty-state-icon"><i class="ph ph-warning-circle" style="font-size:3rem;color:var(--danger);"></i></div>
                <h3>Error loading sales</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
};

// Helper function to format transaction ID
function formatTransactionId(id) {
    if (!id) return 'N/A';
    return 'TXN-' + id.slice(-8).toUpperCase();
}

// Pagination function
window.changeSalesPage = function (page) {
    currentSalesPage = page;
    filterSales(window.currentSalesFilter, true);

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
            from { opacity: 0; transform: translateY(20px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        #saleBreakdownModal { display: none; }
        #saleBreakdownModal.open { display: flex !important; }
        .sale-breakdown-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.65rem 0;
            border-bottom: 1px solid var(--gray-100, #f1f5f9);
            font-size: 0.88rem;
        }
        .sale-breakdown-item:last-child { border-bottom: none; }
        .sale-breakdown-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.35rem;
            font-size: 0.88rem;
        }
        .sale-breakdown-row.total {
            font-size: 1.25rem;
            font-weight: 800;
            margin-top: 0.5rem;
            padding-top: 0.5rem;
            border-top: 1px dashed rgba(0,0,0,0.1);
            color: var(--primary);
        }
        .sale-breakdown-row .label { color: var(--gray-500, #64748b); font-size: 0.84rem; }
        .sale-breakdown-row .value { font-weight: 600; color: var(--gray-800, #1e293b); }
    `;
    document.head.appendChild(style);
})();

window.viewTransactionDetails = async function (transactionId) {
    const modal = document.getElementById('saleBreakdownModal');
    if (!modal) return;

    // Show loading state
    modal.classList.add('open');
    document.getElementById('saleBreakdownId').textContent = 'Loading...';
    document.getElementById('saleBreakdownDate').innerHTML = '';
    document.getElementById('saleBreakdownItems').innerHTML = '<div style="text-align:center;padding:1rem;color:#9ca3af;">Loading details...</div>';
    document.getElementById('saleBreakdownTotals').innerHTML = '';
    document.getElementById('saleBreakdownPaymentInfo').innerHTML = '';
    document.getElementById('saleBreakdownVoidedBadge').style.display = 'none';
    document.getElementById('saleBreakdownVoidReason').style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
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
        document.getElementById('saleBreakdownDate').innerHTML = `<i class="ph ph-calendar-blank"></i> <span>${dateStr} at ${timeStr}</span>`;

        // Voided badge
        if (isVoided) {
            document.getElementById('saleBreakdownVoidedBadge').style.display = 'block';
        }

        // Void reason
        if (isVoided && transaction.voidReason) {
            const voidDiv = document.getElementById('saleBreakdownVoidReason');
            voidDiv.style.display = 'block';
            voidDiv.innerHTML = `<strong>Void Reason:</strong> ${escapeHtml(transaction.voidReason)}`;
        }

        // Items list
        if (items.length === 0) {
            document.getElementById('saleBreakdownItems').innerHTML = '<div style="color:#9ca3af;font-size:0.85rem;text-align:center;padding:0.75rem;">No items recorded</div>';
        } else {
            document.getElementById('saleBreakdownItems').innerHTML = items.map(item => {
                const itemSubtotal = item.subtotal || (item.price * item.quantity) || 0;
                const modifiers = item.modifiers && item.modifiers.length > 0
                    ? `<div style="font-size:0.75rem;color:var(--primary);margin-top:0.15rem;">${item.modifiers.map(m => `+ ${escapeHtml(m.name || m)}`).join(', ')}</div>`
                    : '';
                return `
                    <div class="sale-breakdown-item">
                        <div>
                            <div style="font-weight:600; color:var(--gray-900, #0f172a); font-size:0.88rem;">${escapeHtml(item.name)}</div>
                            <div style="font-size:0.78rem; color:var(--gray-500, #64748b); margin-top:2px;">
                                <span style="font-weight:700; color:var(--primary);">${item.quantity}×</span> ${formatCurrency(item.price)}
                            </div>
                            ${modifiers}
                        </div>
                        <div style="font-weight:700; font-size:0.92rem; color:var(--gray-900, #0f172a);">${formatCurrency(itemSubtotal)}</div>
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
                <span class="label" style="font-size: 1rem; font-weight: 700; color: var(--gray-700);">Total</span>
                <span class="value" style="font-size: 1.3rem; font-weight: 800; color: var(--primary);">${formatCurrency(total)}</span>
            </div>`;
        document.getElementById('saleBreakdownTotals').innerHTML = totalsHtml;

        // Payment info with Phosphor icons
        const amountPaid = transaction.amountPaid || total;
        const change = transaction.change || Math.max(0, amountPaid - total);
        
        const orderTypeLabel = transaction.orderType === 'takeout'
            ? `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i class="ph ph-bag" style="color:#d97706;"></i> Take-out</span>`
            : `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i class="ph ph-fork-knife" style="color:#6366f1;"></i> Dine-in</span>`;

        let paymentMethodLabel = `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i class="ph ph-money" style="color:#059669;"></i> Cash</span>`;
        if (transaction.paymentMethod === 'split') {
            paymentMethodLabel = `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i class="ph ph-arrows-split" style="color:#059669;"></i> Split (Cash + GCash)</span>`;
        } else if (transaction.paymentMethod?.toLowerCase() === 'gcash' || transaction.paymentMethod?.toLowerCase() === 'mobile') {
            paymentMethodLabel = `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i class="ph ph-device-mobile" style="color:#2563eb;"></i> GCash</span>`;
        }

        document.getElementById('saleBreakdownPaymentInfo').innerHTML = `
            <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.6rem;color:var(--primary);font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em;">
                <i class="ph-bold ph-credit-card"></i> Payment Summary
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; font-size:0.84rem;">
                <div>
                    <span style="color:var(--gray-500); display:block; font-size:0.74rem;">Payment Method</span>
                    <span style="display:block; margin-top:2px;">${paymentMethodLabel}</span>
                </div>
                <div>
                    <span style="color:var(--gray-500); display:block; font-size:0.74rem;">Order Type</span>
                    <span style="display:block; margin-top:2px;">${orderTypeLabel}</span>
                </div>
                ${amountPaid > 0 && amountPaid !== total ? `
                <div>
                    <span style="color:var(--gray-500); display:block; font-size:0.74rem;">Amount Tendered</span>
                    <span style="font-weight:600; color:var(--gray-800); display:block; margin-top:2px;">${formatCurrency(amountPaid)}</span>
                </div>
                <div>
                    <span style="color:var(--gray-500); display:block; font-size:0.74rem;">Change</span>
                    <span style="font-weight:700; color:var(--primary); display:block; margin-top:2px;">${formatCurrency(change)}</span>
                </div>` : ''}
                ${transaction.customerName ? `
                <div style="grid-column: 1 / -1; margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(0,0,0,0.06);">
                    <span style="color:var(--gray-500); font-size:0.74rem;">Customer: </span>
                    <span style="font-weight:600; color:var(--gray-800);">${escapeHtml(transaction.customerName)}</span>
                </div>` : ''}
            </div>
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
