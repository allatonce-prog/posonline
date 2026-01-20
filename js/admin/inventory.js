// Inventory Management

// Load inventory
async function loadInventory() {
    await loadInventoryProducts();
    await loadStockMovements();
    await updateInventoryStats();
}

// Load inventory products table
async function loadInventoryProducts() {
    const products = await db.getAll('products');
    const tbody = document.getElementById('inventoryProductsTable');

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No products found</td></tr>';
        return;
    }

    const lowStockThreshold = getLowStockThreshold();

    tbody.innerHTML = products.map(product => {
        const totalValue = product.stock * product.price;
        const stockStatus = getStockStatus(product.stock, lowStockThreshold);
        const stockClass = getStockClass(product.stock, lowStockThreshold);

        return `
      <tr>
        <td class="product-image-cell">
          <div class="product-image-small">${product.image ? `<img src="${product.image}" alt="${escapeHtml(product.name)}">` : '📦'}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(product.name)}</div>
          <div style="font-size: 0.8rem; color: var(--gray-500);">${escapeHtml(product.description || '')}</div>
        </td>
        <td>${escapeHtml(product.sku)}</td>
        <td>${escapeHtml(product.category)}</td>
        <td>
          <span class="stock-quantity ${stockClass}">${product.stock}</span>
        </td>
        <td>${formatCurrency(product.price)}</td>
        <td>${formatCurrency(totalValue)}</td>
        <td>
          <span class="stock-status ${stockStatus}">${stockStatus.toUpperCase()}</span>
        </td>
        <td>
          <div class="inventory-actions">
            <button class="btn btn-success btn-sm" onclick="quickStockIn('${product.id}')">+</button>
            <button class="btn btn-warning btn-sm" onclick="quickStockOut('${product.id}')">-</button>
            <button class="btn btn-primary btn-sm" onclick="editProduct('${product.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

// Get stock status
function getStockStatus(stock, lowStockThreshold) {
    if (stock === 0) return 'out';
    if (stock <= lowStockThreshold) return 'low';
    return 'normal';
}

// Get stock class
function getStockClass(stock, lowStockThreshold) {
    if (stock === 0) return 'out';
    if (stock <= lowStockThreshold) return 'low';
    return '';
}

// Update inventory statistics
async function updateInventoryStats() {
    const products = await db.getAll('products');

    const totalProducts = products.length;
    const lowStockThreshold = getLowStockThreshold();
    const lowStockItems = products.filter(p => p.stock <= lowStockThreshold).length;
    const totalStockValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);

    document.getElementById('totalProductsInventory').textContent = totalProducts;
    document.getElementById('lowStockCount').textContent = lowStockItems;
    document.getElementById('totalStockValue').textContent = formatCurrency(totalStockValue);
}

// Load stock movements with enhanced features
async function loadStockMovements() {
    const movements = await db.getAll('stockMovements');
    const products = await db.getAll('products');

    // Create product lookup
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    const tbody = document.getElementById('stockMovementsTable');

    if (movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No stock movements yet</td></tr>';
        return;
    }

    // Sort by date (newest first)
    const sortedMovements = movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = sortedMovements.map(movement => {
        const product = productMap[movement.productId];
        const productName = product ? product.name : 'Unknown Product';
        const typeClass = movement.type === 'in' ? 'movement-type in' : 'movement-type out';
        const typeText = movement.type === 'in' ? 'Stock In' : 'Stock Out';

        // Calculate stock after movement
        let stockAfter = movement.stockAfter || 'N/A';
        if (!movement.stockAfter && product) {
            // For older records without stockAfter, we can't determine it accurately
            stockAfter = 'N/A';
        }

        return `
      <tr>
        <td>${formatDateTime(movement.date)}</td>
        <td>${escapeHtml(productName)}</td>
        <td><span class="${typeClass}">${typeText}</span></td>
        <td>${movement.quantity}</td>
        <td>${escapeHtml(movement.reason)}</td>
        <td>${escapeHtml(movement.user)}</td>
        <td>${stockAfter}</td>
      </tr>
    `;
    }).join('');
}

// Quick stock in
async function quickStockIn(productId) {
    const product = await db.get('products', productId);
    if (!product) {
        showToast('Product not found', 'error');
        return;
    }

    const quantity = prompt(`Add stock for ${product.name}\n\nCurrent stock: ${product.stock}\n\nEnter quantity to add:`);

    if (!quantity || isNaN(quantity) || parseInt(quantity) <= 0) {
        showToast('Invalid quantity', 'warning');
        return;
    }

    const reason = prompt('Reason for stock in:', 'Quick stock addition');
    if (!reason) return;

    await processStockOperation(productId, parseInt(quantity), 'in', reason);
}

// Quick stock out
async function quickStockOut(productId) {
    const product = await db.get('products', productId);
    if (!product) {
        showToast('Product not found', 'error');
        return;
    }

    const quantity = prompt(`Remove stock for ${product.name}\n\nCurrent stock: ${product.stock}\n\nEnter quantity to remove:`);

    if (!quantity || isNaN(quantity) || parseInt(quantity) <= 0) {
        showToast('Invalid quantity', 'warning');
        return;
    }

    if (product.stock < parseInt(quantity)) {
        showToast(`Insufficient stock. Available: ${product.stock}`, 'error');
        return;
    }

    const reason = prompt('Reason for stock out:', 'Quick stock removal');
    if (!reason) return;

    await processStockOperation(productId, parseInt(quantity), 'out', reason);
}

// Process stock operation (helper function)
async function processStockOperation(productId, quantity, type, reason) {
    showLoading(type === 'in' ? 'Adding stock...' : 'Removing stock...');

    try {
        const product = await db.get('products', productId);
        if (!product) {
            hideLoading();
            showToast('Product not found', 'error');
            return;
        }

        // Record stock before movement
        const stockBefore = product.stock;

        // Update stock
        if (type === 'in') {
            product.stock += quantity;
        } else {
            product.stock -= quantity;
        }

        await db.update('products', product);

        // Record movement
        await db.add('stockMovements', {
            productId: productId,
            type: type,
            quantity: quantity,
            reason: reason,
            date: new Date().toISOString(),
            user: auth.getCurrentUser().username,
            stockBefore: stockBefore,
            stockAfter: product.stock,
            unitPrice: product.price
        });

        hideLoading();
        showToast(`${type === 'in' ? 'Added' : 'Removed'} ${quantity} units to ${product.name}`, 'success');

        // Refresh inventory
        await loadInventory();

        // Reload dashboard if on dashboard tab
        if (currentTab === 'dashboard') {
            await loadDashboard();
        }

    } catch (error) {
        hideLoading();
        showToast(`Error processing stock ${type}: ` + error.message, 'error');
    }
}

// Export inventory
function exportInventory() {
    showToast('Export feature coming soon!', 'info');
}

// Setup inventory filters
function setupInventoryFilters() {
    const stockSearchInput = document.getElementById('stockSearchInput');
    const stockFilterSelect = document.getElementById('stockFilterSelect');
    const movementFilterSelect = document.getElementById('movementFilterSelect');
    const movementDateFilter = document.getElementById('movementDateFilter');

    if (stockSearchInput) {
        stockSearchInput.addEventListener('input', debounce(async (e) => {
            const query = e.target.value.toLowerCase().trim();
            await filterInventoryProducts(query, stockFilterSelect.value);
        }, 300));
    }

    if (stockFilterSelect) {
        stockFilterSelect.addEventListener('change', async () => {
            const query = stockSearchInput.value.toLowerCase().trim();
            await filterInventoryProducts(query, stockFilterSelect.value);
        });
    }

    if (movementFilterSelect) {
        movementFilterSelect.addEventListener('change', async () => {
            await filterStockMovements(movementFilterSelect.value, movementDateFilter.value);
        });
    }

    if (movementDateFilter) {
        movementDateFilter.addEventListener('change', async () => {
            await filterStockMovements(movementFilterSelect.value, movementDateFilter.value);
        });
    }
}

// Filter inventory products
async function filterInventoryProducts(query, filter) {
    const products = await db.getAll('products');
    const tbody = document.getElementById('inventoryProductsTable');

    let filteredProducts = products;

    // Apply text search
    if (query) {
        filteredProducts = filteredProducts.filter(product =>
            product.name.toLowerCase().includes(query) ||
            product.sku.toLowerCase().includes(query) ||
            (product.category && product.category.toLowerCase().includes(query))
        );
    }

    // Apply stock filter
    if (filter !== 'all') {
        const lowStockThreshold = getLowStockThreshold();
        filteredProducts = filteredProducts.filter(product => {
            if (filter === 'low') return product.stock <= lowStockThreshold && product.stock > 0;
            if (filter === 'out') return product.stock === 0;
            if (filter === 'normal') return product.stock > lowStockThreshold;
            return true;
        });
    }

    if (filteredProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No products found</td></tr>';
        return;
    }

    const lowStockThreshold = getLowStockThreshold();

    tbody.innerHTML = filteredProducts.map(product => {
        const totalValue = product.stock * product.price;
        const stockStatus = getStockStatus(product.stock, lowStockThreshold);
        const stockClass = getStockClass(product.stock, lowStockThreshold);

        return `
      <tr>
        <td class="product-image-cell">
          <div class="product-image-small">${product.image ? `<img src="${product.image}" alt="${escapeHtml(product.name)}">` : '📦'}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(product.name)}</div>
          <div style="font-size: 0.8rem; color: var(--gray-500);">${escapeHtml(product.description || '')}</div>
        </td>
        <td>${escapeHtml(product.sku)}</td>
        <td>${escapeHtml(product.category)}</td>
        <td>
          <span class="stock-quantity ${stockClass}">${product.stock}</span>
        </td>
        <td>${formatCurrency(product.price)}</td>
        <td>${formatCurrency(totalValue)}</td>
        <td>
          <span class="stock-status ${stockStatus}">${stockStatus.toUpperCase()}</span>
        </td>
        <td>
          <div class="inventory-actions">
            <button class="btn btn-success btn-sm" onclick="quickStockIn('${product.id}')">+</button>
            <button class="btn btn-warning btn-sm" onclick="quickStockOut('${product.id}')">-</button>
            <button class="btn btn-primary btn-sm" onclick="editProduct('${product.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

// Filter stock movements
async function filterStockMovements(filter, dateFilter) {
    const movements = await db.getAll('stockMovements');
    const products = await db.getAll('products');
    const tbody = document.getElementById('stockMovementsTable');

    // Create product lookup
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    let filteredMovements = movements;

    // Apply type filter
    if (filter !== 'all') {
        filteredMovements = filteredMovements.filter(m => m.type === filter);
    }

    // Apply date filter
    if (dateFilter) {
        const filterDate = new Date(dateFilter);
        filteredMovements = filteredMovements.filter(m => {
            const movementDate = new Date(m.date);
            return movementDate.toDateString() === filterDate.toDateString();
        });
    }

    if (filteredMovements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No stock movements found</td></tr>';
        return;
    }

    // Sort by date (newest first)
    const sortedMovements = filteredMovements.sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = sortedMovements.map(movement => {
        const product = productMap[movement.productId];
        const productName = product ? product.name : 'Unknown Product';
        const typeClass = movement.type === 'in' ? 'movement-type in' : 'movement-type out';
        const typeText = movement.type === 'in' ? 'Stock In' : 'Stock Out';

        let stockAfter = movement.stockAfter || 'N/A';
        if (!movement.stockAfter && product) {
            stockAfter = 'N/A';
        }

        return `
      <tr>
        <td>${formatDateTime(movement.date)}</td>
        <td>${escapeHtml(productName)}</td>
        <td><span class="${typeClass}">${typeText}</span></td>
        <td>${movement.quantity}</td>
        <td>${escapeHtml(movement.reason)}</td>
        <td>${escapeHtml(movement.user)}</td>
        <td>${stockAfter}</td>
      </tr>
    `;
    }).join('');
}

// Show stock in modal
async function showStockInModal() {
    const products = await db.getAll('products');
    const select = document.getElementById('stockInProduct');

    select.innerHTML = '<option value="">Select Product</option>' +
        products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku)}) - Stock: ${p.stock}</option>`).join('');

    document.getElementById('stockInQuantity').value = '';
    document.getElementById('stockInReason').value = '';
    document.getElementById('stockInModal').classList.add('active');
}

// Close stock in modal
function closeStockInModal() {
    document.getElementById('stockInModal').classList.remove('active');
}

// Process stock in
async function processStockIn() {
    const productId = document.getElementById('stockInProduct').value;
    const quantity = parseInt(document.getElementById('stockInQuantity').value);
    const reason = document.getElementById('stockInReason').value.trim();

    if (!productId || isNaN(quantity) || quantity <= 0 || !reason) {
        showToast('Please fill in all fields correctly', 'warning');
        return;
    }

    await processStockOperation(productId, quantity, 'in', reason);
    closeStockInModal();
}

// Show stock out modal
async function showStockOutModal() {
    const products = await db.getAll('products');
    const select = document.getElementById('stockOutProduct');

    select.innerHTML = '<option value="">Select Product</option>' +
        products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku)}) - Stock: ${p.stock}</option>`).join('');

    document.getElementById('stockOutQuantity').value = '';
    document.getElementById('stockOutReason').value = '';
    document.getElementById('stockOutModal').classList.add('active');
}

// Close stock out modal
function closeStockOutModal() {
    document.getElementById('stockOutModal').classList.remove('active');
}

// Process stock out
async function processStockOut() {
    const productId = document.getElementById('stockOutProduct').value;
    const quantity = parseInt(document.getElementById('stockOutQuantity').value);
    const reason = document.getElementById('stockOutReason').value.trim();

    if (!productId || isNaN(quantity) || quantity <= 0 || !reason) {
        showToast('Please fill in all fields correctly', 'warning');
        return;
    }

    await processStockOperation(productId, quantity, 'out', reason);
    closeStockOutModal();
}

// Close modals on outside click
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stockInModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'stockInModal') {
            closeStockInModal();
        }
    });

    document.getElementById('stockOutModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'stockOutModal') {
            closeStockOutModal();
        }
    });

    // Setup inventory filters
    setupInventoryFilters();
});

// Delete product
async function deleteProduct(productId) {
    const product = await db.get('products', productId);
    if (!product) {
        showToast('Product not found', 'error');
        return;
    }

    // Confirm deletion
    const confirmMessage = `Are you sure you want to delete "${product.name}"?\n\nThis will permanently remove the product and all its data.\n\nCurrent stock: ${product.stock}`;

    if (!confirm(confirmMessage)) {
        return;
    }

    showLoading('Deleting product...');

    try {
        // Check if product has any sales transactions
        const transactions = await db.getAll('transactions');
        const hasSales = transactions.some(transaction =>
            transaction.items.some(item => item.productId === productId)
        );

        if (hasSales) {
            hideLoading();
            showToast('Cannot delete product with sales history. Consider making it inactive instead.', 'error');
            return;
        }

        // Delete the product
        await db.delete('products', productId);

        // Delete related stock movements
        const stockMovements = await db.getAll('stockMovements');
        const productMovements = stockMovements.filter(m => m.productId === productId);

        for (const movement of productMovements) {
            await db.delete('stockMovements', movement.id);
        }

        hideLoading();
        showToast(`Product "${product.name}" deleted successfully`, 'success');

        // Refresh inventory
        await loadInventory();

        // Reload dashboard if on dashboard tab
        if (currentTab === 'dashboard') {
            await loadDashboard();
        }

    } catch (error) {
        hideLoading();
        showToast('Error deleting product: ' + error.message, 'error');
    }
}
