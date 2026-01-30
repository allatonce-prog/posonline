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

    // Sort by quantity sold and filter out deleted products
    const lowStockThreshold = getLowStockThreshold();
    const topProducts = Object.entries(productSales)
        .filter(([productId]) => productMap[productId]) // ONLY show active products
        .map(([productId, data]) => ({
            productId: productId,
            ...data,
            category: productMap[productId]?.category || 'Unknown',
            currentStock: productMap[productId]?.stock || 0,
            price: productMap[productId]?.price || 0
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

    // Render top products with modern UI
    const tbody = document.getElementById('topProductsTable');
    if (!tbody) return;

    if (topProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No sales data yet</td></tr>';
    } else {
        // Find max quantity for the progress bar
        const maxQuantity = Math.max(...topProducts.map(p => p.quantity));

        tbody.innerHTML = topProducts.map((product, index) => {
            const percentage = (product.quantity / maxQuantity) * 100;
            const productImage = productMap[product.productId]?.image;

            return `
                <tr>
                    <td>
                        <div class="rank-badge">${index + 1}</div>
                    </td>
                    <td>
                        <div class="product-info-modern">
                            <div class="product-img-mini">
                                ${productImage ? `<img src="${productImage}" alt="">` : '📦'}
                            </div>
                            <div class="product-details-modern">
                                <span class="product-name-modern">${escapeHtml(product.name)}</span>
                                <span class="product-sku-modern">SKU: ${productMap[product.productId]?.sku || 'N/A'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="category-tag-modern">${escapeHtml(product.category)}</span>
                    </td>
                    <td>
                        <div class="sales-progress-container">
                            <div class="sales-count-modern">${product.quantity} units</div>
                            <div class="progress-bar-modern">
                                <div class="progress-fill-modern" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="revenue-modern">${formatCurrency(product.revenue)}</div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Load inventory analytics
    await loadInventoryAnalytics(products);
}

// Load inventory analytics
async function loadInventoryAnalytics(products) {
    // Calculate inventory value
    const totalInventoryValue = products.reduce((sum, p) => sum + (p.stock * (p.price || 0)), 0);
    const lowStockThreshold = getLowStockThreshold();
    const lowStockItems = products.filter(p => p.stock <= lowStockThreshold).length;
    const outOfStockItems = products.filter(p => p.stock === 0).length;
    const totalStock = products.reduce((sum, p) => sum + p.stock, 0);

    // Update existing stats grid with modern icons
    const reportsTab = document.getElementById('reports-tab');
    const existingStats = reportsTab.querySelector('.stats-grid');

    if (existingStats) {
        existingStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon primary"><i class="ph ph-calendar-blank"></i></div>
                <div class="stat-info">
                    <h3>This Week</h3>
                    <div class="stat-value" id="weekSales">₱0.00</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon success"><i class="ph ph-calendar"></i></div>
                <div class="stat-info">
                    <h3>This Month</h3>
                    <div class="stat-value" id="monthSales">₱0.00</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon warning"><i class="ph ph-money"></i></div>
                <div class="stat-info">
                    <h3>Average Sale</h3>
                    <div class="stat-value" id="avgSale">₱0.00</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon danger"><i class="ph ph-trophy"></i></div>
                <div class="stat-info">
                    <h3>Best Day</h3>
                    <div class="stat-value" id="bestDay">-</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon info" style="background: rgba(14, 165, 233, 0.1); color: #0ea5e9;">
                    <i class="ph ph-package"></i>
                </div>
                <div class="stat-info">
                    <h3>Inventory Value</h3>
                    <div class="stat-value" id="inventoryValue">${formatCurrency(totalInventoryValue)}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon warning"><i class="ph ph-warning-circle"></i></div>
                <div class="stat-info">
                    <h3>Low Stock</h3>
                    <div class="stat-value" id="lowStockCount">${lowStockItems}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon danger"><i class="ph ph-prohibit"></i></div>
                <div class="stat-info">
                    <h3>Out of Stock</h3>
                    <div class="stat-value" id="outOfStockCount">${outOfStockItems}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon success"><i class="ph ph-chart-line"></i></div>
                <div class="stat-info">
                    <h3>Total Units</h3>
                    <div class="stat-value" id="totalStockCount">${totalStock}</div>
                </div>
            </div>
        `;
    }
}

function getStockStatus(stock, lowStockThreshold) {
    if (stock === 0) return 'out';
    if (stock <= lowStockThreshold) return 'low';
    return 'normal';
}

function getStockClass(stock, lowStockThreshold) {
    if (stock === 0) return 'out';
    if (stock <= lowStockThreshold) return 'low';
    return '';
}
