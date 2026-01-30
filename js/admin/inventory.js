// Inventory Management

// Load inventory
async function loadInventory() {
    await loadInventoryProducts();
    // Stock movements now on separate tab
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
        <td class="product-image-cell" data-label="Image">
          <div class="product-image-small">${product.image ? `<img src="${product.image}" alt="${escapeHtml(product.name)}">` : '📦'}</div>
        </td>
        <td data-label="Product">
          <div style="font-weight: 600;">${escapeHtml(product.name)}</div>
          <div style="font-size: 0.8rem; color: var(--gray-500);">${escapeHtml(product.description || '')}</div>
        </td>
        <td data-label="SKU">${escapeHtml(product.sku)}</td>
        <td data-label="Category">${escapeHtml(product.category)}</td>
        <td data-label="Current Stock">
          <span class="stock-quantity ${stockClass}">${product.stock}</span>
        </td>
        <td data-label="Unit Price">${formatCurrency(product.price)}</td>
        <td data-label="Total Value">${formatCurrency(totalValue)}</td>
        <td data-label="Status">
          <span class="stock-status ${stockStatus}">${stockStatus.toUpperCase()}</span>
        </td>
        <td data-label="Actions" class="action-cell-visible">
          <div class="inventory-actions">
            <button class="btn btn-success btn-sm" onclick="quickStockIn('${product.id}')" title="Stock In"><i class="ph ph-plus"></i></button>
            <button class="btn btn-warning btn-sm" onclick="quickStockOut('${product.id}')" title="Stock Out"><i class="ph ph-minus"></i></button>
            <button class="btn btn-primary btn-sm" onclick="editProduct('${product.id}')" title="Edit"><i class="ph ph-pencil"></i></button>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')" title="Delete"><i class="ph ph-trash"></i></button>
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
    if (!tbody) return;

    if (movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No stock movements yet</td></tr>';
        return;
    }

    // Sort by date (newest first)
    const sortedMovements = movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = sortedMovements.map(movement => renderStockMovementRow(movement, productMap)).join('');
}

// Helper function to render a single stock movement row
function renderStockMovementRow(movement, productMap) {
    const product = productMap[movement.productId];
    const productName = product ? product.name : 'Unknown Product';
    const typeClass = movement.type === 'in' ? 'movement-type in' : 'movement-type out';
    const typeText = movement.type === 'in' ? 'Stock In' : 'Stock Out';

    // Calculate stock after movement
    let stockAfter = movement.stockAfter !== undefined && movement.stockAfter !== null ? movement.stockAfter : 'N/A';


    return `
      <tr class="clickable-row" onclick="viewStockMovementDetails('${movement.id}')">
        <td data-label="Date">${formatDateTime(movement.date)}</td>
        <td data-label="Product" style="font-weight: 600; color: var(--dark);">${escapeHtml(productName)}</td>
        <td data-label="Type"><span class="${typeClass}">${typeText}</span></td>
        <td data-label="Quantity" style="font-weight: bold;">${movement.quantity}</td>
        <td data-label="Reason">${escapeHtml(movement.reason)}</td>
        <td data-label="User">${escapeHtml(movement.user)}</td>
        <td data-label="Stock After">${stockAfter}</td>
      </tr>
    `;
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
    const movementTimeFilter = document.getElementById('movementTimeFilter');
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
            await filterStockMovements(movementFilterSelect.value, movementDateFilter.value, movementTimeFilter.value);
        });
    }

    if (movementTimeFilter) {
        movementTimeFilter.addEventListener('change', async () => {
            if (movementTimeFilter.value !== 'all') {
                movementDateFilter.value = ''; // Clear specific date if quick filter used
            }
            await filterStockMovements(movementFilterSelect.value, movementDateFilter.value, movementTimeFilter.value);
        });
    }

    if (movementDateFilter) {
        movementDateFilter.addEventListener('change', async () => {
            if (movementDateFilter.value) {
                movementTimeFilter.value = 'all'; // Clear quick filter if specific date used
            }
            await filterStockMovements(movementFilterSelect.value, movementDateFilter.value, movementTimeFilter.value);
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
async function filterStockMovements(filter, dateFilter, timeFilter) {
    const movements = await db.getAll('stockMovements');
    const products = await db.getAll('products');
    const tbody = document.getElementById('stockMovementsTable');
    if (!tbody) return;

    // Create product lookup
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    let filteredMovements = movements;

    // Apply type filter
    if (filter !== 'all') {
        filteredMovements = filteredMovements.filter(m => m.type === filter);
    }

    // Apply time range filter (Today / Yesterday)
    if (timeFilter && timeFilter !== 'all') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (timeFilter === 'today') {
            filteredMovements = filteredMovements.filter(m => {
                const mDate = new Date(m.date);
                return mDate >= today;
            });
        } else if (timeFilter === 'yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            filteredMovements = filteredMovements.filter(m => {
                const mDate = new Date(m.date);
                return mDate >= yesterday && mDate < today;
            });
        }
    }

    // Apply specific date filter
    if (dateFilter) {
        const filterDateString = new Date(dateFilter).toDateString();
        filteredMovements = filteredMovements.filter(m => {
            return new Date(m.date).toDateString() === filterDateString;
        });
    }

    if (filteredMovements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No stock movements found</td></tr>';
        return;
    }

    // Sort by date (newest first)
    const sortedMovements = filteredMovements.sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = sortedMovements.map(movement => renderStockMovementRow(movement, productMap)).join('');
}

let _stockModalProducts = [];

// Helper to render searchable select options
function renderSearchableOptions(containerId, products) {
    const optionsContainer = document.querySelector(`#${containerId} .select-options`);
    if (!optionsContainer) return;

    if (products.length === 0) {
        optionsContainer.innerHTML = '<div class="select-no-results">No products found</div>';
        return;
    }

    optionsContainer.innerHTML = products.map(p => `
        <div class="select-option" onclick="selectSearchableOption('${containerId}', '${p.id}', '${escapeHtml(p.name)} (${escapeHtml(p.sku)})', ${p.stock})">
            <span class="option-title">${escapeHtml(p.name)}</span>
            <span class="option-meta">SKU: ${escapeHtml(p.sku)} | Stock: ${p.stock}</span>
        </div>
    `).join('');
}

window.toggleSearchableSelect = function (id) {
    const el = document.getElementById(id);
    if (!el) return;

    const wasActive = el.classList.contains('active');

    // Close all other searchable selects
    document.querySelectorAll('.searchable-select').forEach(s => s.classList.remove('active'));

    if (!wasActive) {
        el.classList.add('active');
        const input = el.querySelector('.select-search-input');
        if (input) {
            input.focus();
            input.select();
        }
    }
};

window.selectSearchableOption = function (containerId, value, label, stock) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const hiddenInput = container.querySelector('input[type="hidden"]');
    const searchInput = container.querySelector('.select-search-input');

    if (hiddenInput) hiddenInput.value = value;
    if (searchInput) searchInput.value = label;

    // Show current stock info if applicable
    const infoDivId = containerId === 'stockInSelect' ? 'stockInCurrentInfo' :
        containerId === 'stockOutSelect' ? 'stockOutCurrentInfo' : null;

    if (infoDivId) {
        const infoDiv = document.getElementById(infoDivId);
        if (infoDiv) {
            infoDiv.innerHTML = `Current Stock: <span style="font-size: 1.1rem;">${stock}</span>`;
            infoDiv.style.display = 'block';
        }
    }

    container.classList.remove('active');
};

// Show stock in modal
async function showStockInModal() {
    _stockModalProducts = await db.getAll('products');

    const searchInput = document.getElementById('stockInSearch');
    const hiddenInput = document.getElementById('stockInProduct');

    if (searchInput) searchInput.value = '';
    if (hiddenInput) hiddenInput.value = '';

    renderSearchableOptions('stockInSelect', _stockModalProducts);

    // Hide stock info
    const infoDiv = document.getElementById('stockInCurrentInfo');
    if (infoDiv) infoDiv.style.display = 'none';

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
    _stockModalProducts = await db.getAll('products');

    const searchInput = document.getElementById('stockOutSearch');
    const hiddenInput = document.getElementById('stockOutProduct');

    if (searchInput) searchInput.value = '';
    if (hiddenInput) hiddenInput.value = '';

    renderSearchableOptions('stockOutSelect', _stockModalProducts);

    // Hide stock info
    const infoDiv = document.getElementById('stockOutCurrentInfo');
    if (infoDiv) infoDiv.style.display = 'none';

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

    // Add search listeners for modals
    document.getElementById('stockInSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = _stockModalProducts.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query)
        );
        renderSearchableOptions('stockInSelect', filtered);
    });

    document.getElementById('stockOutSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = _stockModalProducts.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query)
        );
        renderSearchableOptions('stockOutSelect', filtered);
    });

    // Close searchable selects on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.searchable-select')) {
            document.querySelectorAll('.searchable-select').forEach(s => s.classList.remove('active'));
        }
    });
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
            const forceDelete = confirm('This product has sales history. Deleting it will not remove past transactions, but it may cause issues in historical reports. \n\nDo you still want to PERMANENTLY delete it from Firebase and local storage?');
            if (!forceDelete) {
                hideLoading();
                return;
            }
        }

        // Delete the product
        await db.remove('products', productId);

        // Delete related stock movements
        const stockMovements = await db.getAll('stockMovements');
        const productMovements = stockMovements.filter(m => m.productId === productId);

        for (const movement of productMovements) {
            await db.remove('stockMovements', movement.id);
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

// View stock movement details
async function viewStockMovementDetails(id) {
    showLoading('Loading details...');
    try {
        const movement = await db.get('stockMovements', id);
        if (!movement) throw new Error('Movement record not found');

        const product = await db.get('products', movement.productId);
        const productName = product ? product.name : 'Unknown Product (Deleted)';
        const productSku = product ? product.sku : 'N/A';
        const typeText = movement.type === 'in' ? 'Stock In' : 'Stock Out';
        const typeColor = movement.type === 'in' ? 'var(--success)' : 'var(--warning)';

        const detailsHtml = `
            <div class="transaction-header">
                <div class="transaction-title">
                    <h3>Movement Details</h3>
                    <span style="font-family: monospace; font-size: 0.85rem; color: var(--gray-500);">${id}</span>
                </div>
            </div>

            <div class="detail-grid" style="grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 1rem;">
                 <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">Date</p>
                    <p>${formatDateTime(movement.date)}</p>
                </div>
                <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">Type</p>
                    <p style="color: ${typeColor}; font-weight: bold;">${typeText}</p>
                </div>
                <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">Product</p>
                    <p>${escapeHtml(productName)}</p>
                </div>
                 <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">SKU</p>
                    <p>${escapeHtml(productSku)}</p>
                </div>
                <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">Quantity</p>
                    <p style="font-size: 1.25rem; font-weight: bold;">${movement.quantity}</p>
                </div>
                <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">User</p>
                    <p>${escapeHtml(movement.user)}</p>
                </div>
                 <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">Stock Before</p>
                    <p>${movement.stockBefore !== undefined ? movement.stockBefore : 'N/A'}</p>
                </div>
                 <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">Stock After</p>
                    <p>${movement.stockAfter !== undefined ? movement.stockAfter : 'N/A'}</p>
                </div>
            </div>

            <div style="margin-top: 1.5rem; padding: 1rem; background: var(--light); border-radius: var(--radius-md);">
                <p style="font-weight: 800; color: var(--dark); margin-bottom: 0.5rem;">Reason</p>
                <p>${escapeHtml(movement.reason)}</p>
            </div>
        `;

        // Reuse transaction modal for simplicity
        const modalBody = document.getElementById('transactionDetails');
        if (modalBody) {
            modalBody.innerHTML = detailsHtml;
            document.getElementById('transactionModal').classList.add('active');

            // Update modal title temporarily
            const modalTitle = document.querySelector('#transactionModal h2');
            if (modalTitle) modalTitle.textContent = 'Stock Movement';
        }

        hideLoading();

    } catch (error) {
        hideLoading();
        showToast('Error loading details: ' + error.message, 'error');
    }
}
