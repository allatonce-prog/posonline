
// Sales View Functions
let currentSalesFilter = 'recent';

window.loadSales = async function () {
    await filterSales(currentSalesFilter);
};

window.filterSales = async function (filter) {
    console.log('filterSales called with filter:', filter);
    currentSalesFilter = filter;

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

        // Calculate stats
        const totalAmount = transactions.reduce((sum, t) => sum + (t.total || t.amount || 0), 0);
        const totalCount = transactions.length;

        // Calculate net profit (total - cost)
        let netProfit = 0;
        for (const transaction of transactions) {
            if (transaction.items && transaction.items.length > 0) {
                for (const item of transaction.items) {
                    const product = await db.get('products', item.productId);
                    const cost = Number(product?.cost) || 0;
                    const price = Number(item.price) || 0;
                    const quantity = Number(item.quantity) || 0;

                    const profit = (price - cost) * quantity;
                    if (!isNaN(profit)) {
                        netProfit += profit;
                    }
                }
            }
        }

        // Update stats
        const totalAmountEl = document.getElementById('salesTotalAmount');
        const totalCountEl = document.getElementById('salesTotalCount');
        const netProfitEl = document.getElementById('salesNetProfit');

        if (totalAmountEl) totalAmountEl.textContent = formatCurrency(totalAmount);
        if (totalCountEl) totalCountEl.textContent = totalCount;
        if (netProfitEl) netProfitEl.textContent = formatCurrency(netProfit);

        // Render sales list
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

        salesList.innerHTML = transactions.map(transaction => {
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
