// Reports and Analytics

// Load reports
async function loadReports() {
    const transactions = await db.getAll('transactions');
    const products = await db.getAll('products');
    const stockMovements = await db.getAll('stockMovements');

    if (transactions.length === 0) {
        document.getElementById('weekSales').textContent = '₱0.00';
        document.getElementById('monthSales').textContent = '₱0.00';
        document.getElementById('avgSale').textContent = '₱0.00';
        document.getElementById('bestDay').textContent = '-';
        document.getElementById('topProductsTable').innerHTML = '<tr><td colspan="5" class="table-empty">No sales data yet</td></tr>';
        return;
    }

    // Calculate date ranges
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Filter transactions
    const weekTransactions = transactions.filter(t => new Date(t.date) >= weekAgo);
    const monthTransactions = transactions.filter(t => new Date(t.date) >= monthAgo);

    // Calculate sales
    const weekSales = weekTransactions.reduce((sum, t) => sum + (Number(t.total) || Number(t.amount) || 0), 0);
    const monthSales = monthTransactions.reduce((sum, t) => sum + (Number(t.total) || Number(t.amount) || 0), 0);
    const avgSale = transactions.reduce((sum, t) => sum + (Number(t.total) || Number(t.amount) || 0), 0) / (transactions.length || 1);

    // Find best day
    const salesByDay = {};
    transactions.forEach(t => {
        const date = new Date(t.date).toDateString();
        const amount = Number(t.total) || Number(t.amount) || 0;
        salesByDay[date] = (salesByDay[date] || 0) + amount;
    });

    let bestDay = '-';
    let bestDaySales = 0;
    Object.entries(salesByDay).forEach(([day, sales]) => {
        if (sales > bestDaySales) {
            bestDaySales = sales;
            bestDay = formatDate(new Date(day));
        }
    });

    // Update stats
    document.getElementById('weekSales').textContent = formatCurrency(weekSales);
    document.getElementById('monthSales').textContent = formatCurrency(monthSales);
    document.getElementById('avgSale').textContent = formatCurrency(avgSale);
    document.getElementById('bestDay').textContent = bestDay;

    // Calculate top products
    const productSales = {};
    transactions.forEach(transaction => {
        transaction.items.forEach(item => {
            if (!productSales[item.productId]) {
                productSales[item.productId] = {
                    name: item.name,
                    quantity: 0,
                    revenue: 0
                };
            }
            productSales[item.productId].quantity += item.quantity;
            productSales[item.productId].revenue += item.subtotal;
        });
    });

    // Create product lookup for categories
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    // Sort by quantity sold
    const lowStockThreshold = getLowStockThreshold();
    const topProducts = Object.entries(productSales)
        .map(([productId, data]) => ({
            productId: productId,
            ...data,
            category: productMap[productId]?.category || 'Unknown',
            currentStock: productMap[productId]?.stock || 0,
            price: productMap[productId]?.price || 0
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

    // Render top products with inventory data
    const tbody = document.getElementById('topProductsTable');
    if (topProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No sales data yet</td></tr>';
    } else {
        tbody.innerHTML = topProducts.map((product, index) => {
            const stockStatus = getStockStatus(product.currentStock, lowStockThreshold);
            const stockClass = getStockClass(product.currentStock, lowStockThreshold);

            return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(product.name)}</div>
          <div style="font-size: 0.8rem; color: var(--gray-500);">SKU: ${productMap[product.productId]?.sku || 'N/A'}</div>
        </td>
        <td>${escapeHtml(product.category)}</td>
        <td>${product.quantity}</td>
        <td>${formatCurrency(product.revenue)}</td>
      </tr>
    `;
        }).join('');
    }

    // Load inventory analytics
    await loadInventoryAnalytics(products, stockMovements);
}

// Load inventory analytics
async function loadInventoryAnalytics(products, stockMovements) {
    // Calculate inventory value
    const totalInventoryValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
    const lowStockThreshold = getLowStockThreshold();
    const lowStockItems = products.filter(p => p.stock <= lowStockThreshold).length;
    const outOfStockItems = products.filter(p => p.stock === 0).length;
    const totalStock = products.reduce((sum, p) => sum + p.stock, 0);

    // Add inventory stats to reports section
    const reportsTab = document.getElementById('reports-tab');
    const existingStats = reportsTab.querySelector('.stats-grid');

    if (existingStats) {
        // Update existing stats
        existingStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon primary">📅</div>
                <div class="stat-info">
                    <h3>This Week</h3>
                    <div class="stat-value" id="weekSales">₱0.00</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon success">📆</div>
                <div class="stat-info">
                    <h3>This Month</h3>
                    <div class="stat-value" id="monthSales">₱0.00</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon warning">💵</div>
                <div class="stat-info">
                    <h3>Average Sale</h3>
                    <div class="stat-value" id="avgSale">₱0.00</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon danger">🏆</div>
                <div class="stat-info">
                    <h3>Best Day</h3>
                    <div class="stat-value" id="bestDay">-</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon info">📦</div>
                <div class="stat-info">
                    <h3>Inventory Value</h3>
                    <div class="stat-value" id="inventoryValue">${formatCurrency(totalInventoryValue)}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon warning">⚠️</div>
                <div class="stat-info">
                    <h3>Low Stock Items</h3>
                    <div class="stat-value" id="lowStockCount">${lowStockItems}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon danger">🚫</div>
                <div class="stat-info">
                    <h3>Out of Stock</h3>
                    <div class="stat-value" id="outOfStockCount">${outOfStockItems}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon success">📊</div>
                <div class="stat-info">
                    <h3>Total Stock</h3>
                    <div class="stat-value" id="totalStockCount">${totalStock}</div>
                </div>
            </div>
        `;
    }

    // Add inventory movement analytics
    await loadStockMovementAnalytics(stockMovements);
}

// Load stock movement analytics
async function loadStockMovementAnalytics(stockMovements) {
    const reportsTab = document.getElementById('reports-tab');

    // Create or update stock movement section
    let stockSection = reportsTab.querySelector('.stock-movement-analytics');
    if (!stockSection) {
        stockSection = document.createElement('div');
        stockSection.className = 'stock-movement-analytics';
        stockSection.innerHTML = `
            <div class="table-container" style="margin-top: 2rem;">
                <div class="table-header">
                    <h3>Stock Movement Analytics</h3>
                    <div class="filter-controls">
                        <select id="reportMovementFilter" class="form-control" style="max-width: 200px;">
                            <option value="all">All Time</option>
                            <option value="week">Last 7 Days</option>
                            <option value="month">Last 30 Days</option>
                        </select>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Stock In</th>
                                <th>Stock Out</th>
                                <th>Net Change</th>
                                <th>Value In</th>
                                <th>Value Out</th>
                            </tr>
                        </thead>
                        <tbody id="stockMovementTable">
                            <tr><td colspan="6" class="table-empty">Loading stock analytics...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Insert before the existing top products table
        const topProductsContainer = reportsTab.querySelector('.table-container:last-child');
        reportsTab.insertBefore(stockSection, topProductsContainer);
    }

    await updateStockMovementTable(stockMovements);
}

// Update stock movement table
async function updateStockMovementTable(stockMovements) {
    const tbody = document.getElementById('stockMovementTable');
    const filterSelect = document.getElementById('reportMovementFilter');

    if (!tbody || !filterSelect) return;

    const filter = filterSelect.value;
    const now = new Date();

    let filteredMovements = stockMovements;

    // Apply date filter
    if (filter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredMovements = stockMovements.filter(m => new Date(m.date) >= weekAgo);
    } else if (filter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredMovements = stockMovements.filter(m => new Date(m.date) >= monthAgo);
    }

    // Group by period
    const movementsByPeriod = {};
    filteredMovements.forEach(movement => {
        const date = new Date(movement.date);
        const period = filter === 'all' ?
            date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) :
            date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });

        if (!movementsByPeriod[period]) {
            movementsByPeriod[period] = {
                stockIn: 0,
                stockOut: 0,
                valueIn: 0,
                valueOut: 0
            };
        }

        if (movement.type === 'in') {
            movementsByPeriod[period].stockIn += movement.quantity;
            movementsByPeriod[period].valueIn += movement.quantity * (movement.unitPrice || 0);
        } else {
            movementsByPeriod[period].stockOut += movement.quantity;
            movementsByPeriod[period].valueOut += movement.quantity * (movement.unitPrice || 0);
        }
    });

    // Render table
    if (Object.keys(movementsByPeriod).length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No stock movements found</td></tr>';
        return;
    }

    tbody.innerHTML = Object.entries(movementsByPeriod)
        .sort(([a, b]) => new Date(b) - new Date(a))
        .map(([period, data]) => {
            const netChange = data.stockIn - data.stockOut;
            const netValue = data.valueIn - data.valueOut;

            return `
        <tr>
            <td data-label="Period" style="font-weight: 600;">${period}</td>
            <td data-label="Stock In" class="text-success">${data.stockIn}</td>
            <td data-label="Stock Out" class="text-danger">${data.stockOut}</td>
            <td data-label="Net Change" class="${netChange >= 0 ? 'text-success' : 'text-danger'}" style="font-weight: bold;">${netChange > 0 ? '+' : ''}${netChange}</td>
            <td data-label="Value In">${formatCurrency(data.valueIn)}</td>
            <td data-label="Value Out">${formatCurrency(data.valueOut)}</td>
        </tr>
    `;
        }).join('');

    // Setup filter change listener
    filterSelect.removeEventListener('change', handleReportFilterChange);
    filterSelect.addEventListener('change', handleReportFilterChange);
}

// Handle report filter change
function handleReportFilterChange() {
    // Reload reports with new filter
    loadReports();
}

// Get stock status (helper function)
function getStockStatus(stock, lowStockThreshold) {
    if (stock === 0) return 'out';
    if (stock <= lowStockThreshold) return 'low';
    return 'normal';
}

// Get stock class (helper function)
function getStockClass(stock, lowStockThreshold) {
    if (stock === 0) return 'out';
    if (stock <= lowStockThreshold) return 'low';
    return '';
}
