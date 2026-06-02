// Inventory Management
const inventoryPaginator = new PaginationManager(5);
const movementsPaginator = new PaginationManager(5);
const alertPaginator = new PaginationManager(5);

let currentAlertQuery = '';
let currentAlertType = '';


// Load inventory
async function loadInventory() {
    await loadInventoryProducts();
    // Stock movements now on separate tab
    await updateInventoryStats();
}

// Load inventory products table
async function loadInventoryProducts() {
    // Delegate to filter function which now handles everything including pagination
    return filterInventoryProducts('', 'all');
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
    const lowStockThreshold = Number(getLowStockThreshold());

    // Use Number() for safe comparison in case stock is stored as string
    const lowStockItems = products.filter(p => {
        if (p.stockMode === 'availability') return false; // Availability items cannot be low stock
        const stock = Number(p.stock);
        return stock <= lowStockThreshold && stock > 0;
    }).length;

    const outOfStockItems = products.filter(p => {
        if (p.stockMode === 'availability') return p.isAvailable === false;
        return Number(p.stock) === 0;
    }).length;

    const totalStockValue = products.reduce((sum, p) => {
        if (p.stockMode === 'availability') return sum; // Availability mode has 0 stock value
        return sum + (Number(p.stock) * Number(p.price));
    }, 0);

    const totalProductsEl = document.getElementById('totalProductsInventory');
    const lowStockCountEl = document.getElementById('lowStockCount');
    const outOfStockCountEl = document.getElementById('outOfStockCount');
    const totalStockValueEl = document.getElementById('totalStockValue');

    if (totalProductsEl) totalProductsEl.textContent = totalProducts;
    if (lowStockCountEl) lowStockCountEl.textContent = lowStockItems;
    if (outOfStockCountEl) outOfStockCountEl.textContent = outOfStockItems;
    if (totalStockValueEl) totalStockValueEl.textContent = formatCurrency(totalStockValue);
}

// Load stock movements with enhanced features
async function loadStockMovements() {
    return filterStockMovements('all');
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
    const isIngredient = productId.startsWith('ingredient_');
    const dbId = productId.replace('product_', '').replace('ingredient_', '');
    const collection = isIngredient ? 'ingredients' : 'products';

    const item = await db.get(collection, dbId);
    if (!item) {
        showToast(`${isIngredient ? 'Ingredient' : 'Product'} not found`, 'error');
        return;
    }

    const quantity = prompt(`Add stock for ${isIngredient ? '[Ingredient] ' : ''}${item.name}\n\nCurrent stock: ${item.stock}\n\nEnter quantity to add:`);

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
    const isIngredient = productId.startsWith('ingredient_');
    const dbId = productId.replace('product_', '').replace('ingredient_', '');
    const collection = isIngredient ? 'ingredients' : 'products';

    const item = await db.get(collection, dbId);
    if (!item) {
        showToast(`${isIngredient ? 'Ingredient' : 'Product'} not found`, 'error');
        return;
    }

    const quantity = prompt(`Remove stock for ${isIngredient ? '[Ingredient] ' : ''}${item.name}\n\nCurrent stock: ${item.stock}\n\nEnter quantity to remove:`);

    if (!quantity || isNaN(quantity) || parseInt(quantity) <= 0) {
        showToast('Invalid quantity', 'warning');
        return;
    }

    if (item.stock < parseInt(quantity)) {
        showToast(`Insufficient stock. Available: ${item.stock}`, 'error');
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
        const isIngredient = productId.startsWith('ingredient_');
        const dbId = productId.replace('product_', '').replace('ingredient_', '');
        const collection = isIngredient ? 'ingredients' : 'products';

        const item = await db.get(collection, dbId);
        if (!item) {
            hideLoading();
            showToast(`${isIngredient ? 'Ingredient' : 'Product'} not found`, 'error');
            return;
        }

        // Record stock before movement
        const stockBefore = item.stock;

        // Update stock
        if (type === 'in') {
            item.stock += quantity;
        } else {
            if (quantity > item.stock) {
                hideLoading();
                showToast(`Cannot remove ${quantity} units. Only ${item.stock} in stock.`, 'error');
                return;
            }
            item.stock -= quantity;
        }

        await db.update(collection, item);

        // Record movement
        await db.add('stockMovements', {
            productId: dbId,
            itemType: isIngredient ? 'ingredient' : 'product',
            type: type,
            quantity: quantity,
            reason: reason,
            date: new Date().toISOString(),
            user: auth.getCurrentUser().username,
            stockBefore: stockBefore,
            stockAfter: item.stock,
            unitPrice: isIngredient ? (item.cost || 0) : (item.price || 0)
        });

        hideLoading();
        showToast(`${type === 'in' ? 'Added' : 'Removed'} ${quantity} units to ${item.name}`, 'success');

        // Send notification to Admin
        db.notify(
            type === 'in' ? 'stock_in' : 'stock_out',
            type === 'in' ? `Manual Stock In (${isIngredient ? 'Ingredient' : 'Product'})` : `Manual Stock Out (${isIngredient ? 'Ingredient' : 'Product'})`,
            `${auth.getCurrentUser().name || auth.getCurrentUser().username} ${type === 'in' ? 'added' : 'removed'} ${quantity} units for ${item.name}. New total: ${item.stock}`,
            { productId: dbId, itemType: isIngredient ? 'ingredient' : 'product', quantity: quantity, type: type }
        );

        // Check for low stock after removal
        if (type === 'out') {
            const settings = typeof getSettings === 'function' ? getSettings() : { lowStockThreshold: 10 };
            if (!isIngredient && item.stock <= (settings.lowStockThreshold || 10)) {
                db.notify(
                    'low_stock',
                    'Low Stock Alert',
                    `${item.name} is running low on stock after removal (${item.stock} left)`,
                    { productId: item.id, currentStock: item.stock }
                );
            }
        }

        // Refresh inventory table if loadInventory exists
        if (typeof loadInventory === 'function') {
            await loadInventory();
        }

        // Reload dashboard if on dashboard tab
        if (currentTab === 'dashboard' && typeof loadDashboard === 'function') {
            await loadDashboard();
        }

    } catch (error) {
        hideLoading();
        showToast('Error processing stock operation: ' + error.message, 'error');
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
    // If no args provided (e.g. from event listener properly or reload), get from DOM
    if (query === undefined) query = document.getElementById('stockSearchInput')?.value.toLowerCase().trim() || '';
    if (filter === undefined) filter = document.getElementById('stockFilterSelect')?.value || 'all';

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
            if (product.stockMode === 'availability') {
                if (filter === 'out') return product.isAvailable === false;
                if (filter === 'normal') return product.isAvailable !== false;
                if (filter === 'low') return false; // Not applicable
                return true;
            } else {
                if (filter === 'low') return product.stock <= lowStockThreshold && product.stock > 0;
                if (filter === 'out') return product.stock === 0;
                if (filter === 'normal') return product.stock > lowStockThreshold;
                return true;
            }
        });
    }

    if (filteredProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No products found</td></tr>';
        const container = document.getElementById('inventoryPaginationContainer');
        if (container) container.innerHTML = '';
        return;
    }

    // Pagination
    const paginated = inventoryPaginator.paginate(filteredProducts);
    const displayProducts = paginated.data;

    const lowStockThreshold = getLowStockThreshold();

    tbody.innerHTML = displayProducts.map(product => {
        let quantityHtml, totalValueHtml, stockStatus, stockClass, actionsHtml;

        if (product.stockMode === 'availability') {
            const avail = product.isAvailable !== false;
            stockStatus = avail ? 'AVAILABLE' : 'OUT_OF_STOCK';
            stockClass = avail ? 'normal' : 'out';
            quantityHtml = `<span style="background-color: var(--${avail ? 'success' : 'danger'}); color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">${avail ? 'Available' : 'N/A'}</span>`;
            totalValueHtml = '-';

            // Availability mode: Hide manual stock buttons
            actionsHtml = `
            <div class="inventory-actions">
              <button class="btn btn-primary btn-sm" onclick="editProduct('${product.id}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')">🗑️</button>
            </div>
            `;
        } else {
            const totalValue = product.stock * product.price;
            totalValueHtml = formatCurrency(totalValue);
            stockStatus = getStockStatus(product.stock, lowStockThreshold).toUpperCase();
            stockClass = getStockClass(product.stock, lowStockThreshold);
            quantityHtml = `<span class="stock-quantity ${stockClass}">${product.stock}</span>`;

            // Stock-based: Show regular action buttons
            actionsHtml = `
            <div class="inventory-actions">
              <button class="btn btn-success btn-sm" onclick="quickStockIn('${product.id}')">+</button>
              <button class="btn btn-warning btn-sm" onclick="quickStockOut('${product.id}')">-</button>
              <button class="btn btn-primary btn-sm" onclick="editProduct('${product.id}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')">🗑️</button>
            </div>
            `;
        }

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
        <td>${quantityHtml}</td>
        <td>${formatCurrency(product.price)}</td>
        <td>${totalValueHtml}</td>
        <td>
          <span class="stock-status ${stockClass}">${stockStatus.replace('_', ' ')}</span>
        </td>
        <td>${actionsHtml}</td>
      </tr>
    `;
    }).join('');

    // Render Controls
    let paginationContainer = document.getElementById('inventoryPaginationContainer');
    // We need to find where to append it. The inventory table container is harder to select specifically as it shares class.
    // We can rely on the fact that loadInventoryProducts is called when tab is active.
    // Or we can find the parent of tbody
    if (!paginationContainer && tbody) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'inventoryPaginationContainer';
        // Append after the table-responsive div
        tbody.closest('.table-container').appendChild(paginationContainer);
    }

    inventoryPaginator.renderControls('inventoryPaginationContainer', paginated.totalPages, (page) => {
        inventoryPaginator.setPage(page);
        filterInventoryProducts(query, filter);
    });
}

// Filter stock movements
async function filterStockMovements(filter, dateFilter, timeFilter) {
    // If called with just page change, we might need current filters.
    // Better to grab from DOM if undefined
    if (filter === undefined) filter = document.getElementById('movementFilterSelect')?.value || 'all';
    if (dateFilter === undefined) dateFilter = document.getElementById('movementDateFilter')?.value || '';
    if (timeFilter === undefined) timeFilter = document.getElementById('movementTimeFilter')?.value || 'all';


    const movements = await db.getAll('stockMovements');
    const products = await db.getAll('products');
    const ingredients = await db.getAll('ingredients');
    const tbody = document.getElementById('stockMovementsTable');
    if (!tbody) return;

    // Create lookup tables
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    const ingredientMap = {};
    ingredients.forEach(i => ingredientMap[i.id] = i);

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
        const container = document.getElementById('movementsPaginationContainer');
        if (container) container.innerHTML = '';
        return;
    }

    // Sort by date (newest first)
    const sortedMovements = filteredMovements.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Pagination
    const paginated = movementsPaginator.paginate(sortedMovements);
    const displayMovements = paginated.data;

    tbody.innerHTML = displayMovements.map(movement => {
        const isIngredient = movement.itemType === 'ingredient';
        const item = isIngredient ? ingredientMap[movement.productId] : productMap[movement.productId];
        const itemName = item ? (isIngredient ? `[Ingredient] ${item.name}` : item.name) : 'Unknown Item (Deleted)';
        const itemSku = isIngredient ? `Unit: ${item?.unit || 'pcs'}` : (item?.sku || 'N/A');
        
        const isStockIn = movement.type === 'in';
        const typeColor = isStockIn ? 'var(--success)' : 'var(--warning)';
        const typeIcon = isStockIn ? 'ph-arrow-down' : 'ph-arrow-up';

        return `
        <tr>
            <td colspan="7" style="padding: 0; border: none;">
                <div class="movement-card clickable-row" onclick="viewStockMovementDetails('${movement.id}')" style="cursor: pointer; border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.75rem; background: var(--white); display: flex; flex-direction: column; gap: 0.75rem; transition: all 0.2s;">
                    
                    <!-- Header: Date & Type -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                             <div style="font-weight: 700; color: var(--dark); font-size: 1rem; margin-bottom: 2px;">
                                ${escapeHtml(itemName)}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--gray-500);">
                                ${formatDateTime(movement.date)}
                            </div>
                        </div>
                        <div style="text-align: right;">
                             <span class="badge" style="background-color: ${isStockIn ? '#dcfce7' : '#fef9c3'}; color: ${isStockIn ? '#166534' : '#854d0e'}; font-size: 0.75rem; padding: 4px 8px; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="ph ${typeIcon}"></i> ${isStockIn ? 'Stock In' : 'Stock Out'}
                             </span>
                        </div>
                    </div>

                    <!-- Divider -->
                    <div style="height: 1px; background: var(--gray-100); width: 100%;"></div>

                    <!-- Details: SKU, Quantity, User -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.85rem;">
                         <div>
                            <span style="color: var(--gray-500); display: block; font-size: 0.75rem; font-weight: 600;">Quantity</span>
                            <span style="color: ${typeColor}; font-weight: 700; font-size: 1.1rem;">
                                ${isStockIn ? '+' : '-'}${movement.quantity}
                            </span>
                        </div>
                        <div>
                            <span style="color: var(--gray-500); display: block; font-size: 0.75rem; font-weight: 600;">SKU/Unit</span>
                            <span style="color: var(--dark); font-weight: 500;">
                                ${escapeHtml(itemSku)}
                            </span>
                        </div>
                         <div style="text-align: right;">
                            <span style="color: var(--gray-500); display: block; font-size: 0.75rem; font-weight: 600;">By</span>
                            <span style="color: var(--dark); font-weight: 500;">
                                <i class="ph ph-user" style="vertical-align: middle;"></i> ${escapeHtml(movement.user || 'Admin')}
                            </span>
                        </div>
                    </div>

                    <!-- Reason Footer -->
                    <div style="background: var(--light); padding: 0.5rem; border-radius: 4px; font-size: 0.8rem; color: var(--gray-600); display: flex; align-items: flex-start; gap: 0.5rem;">
                        <i class="ph ph-info" style="margin-top: 2px;"></i>
                        <span style="font-style: italic;">"${escapeHtml(movement.reason || 'No reason provided')}"</span>
                    </div>
                </div>
            </td>
        </tr>
        `;
    }).join('');

    // Pagination Controls
    let paginationContainer = document.getElementById('movementsPaginationContainer');
    if (!paginationContainer && tbody) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'movementsPaginationContainer';
        tbody.closest('.table-container').appendChild(paginationContainer);
    }

    movementsPaginator.renderControls('movementsPaginationContainer', paginated.totalPages, (page) => {
        movementsPaginator.setPage(page);
        filterStockMovements(filter, dateFilter, timeFilter);
    });
}

let _stockModalProducts = [];

// Helper to render searchable select options
function renderSearchableOptions(containerId, items) {
    const optionsContainer = document.querySelector(`#${containerId} .select-options`);
    if (!optionsContainer) return;

    if (items.length === 0) {
        optionsContainer.innerHTML = '<div class="select-no-results">No items found</div>';
        return;
    }

    optionsContainer.innerHTML = items.map(p => `
        <div class="select-option" onclick="selectSearchableOption('${containerId}', '${p.id}', '${escapeHtml(p.name)} (${escapeHtml(p.meta)})', ${p.stock})">
            <span class="option-title">${escapeHtml(p.name)}</span>
            <span class="option-meta">${escapeHtml(p.meta)} | Stock: ${p.stock}</span>
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
            if (containerId === 'stockInSelect' || containerId === 'stockOutSelect') {
                const threshold = Number(getLowStockThreshold());
                let statusClass = 'normal';
                let statusLabel = 'Normal Stock';
                if (stock === 0) {
                    statusClass = 'out';
                    statusLabel = 'Out of Stock';
                } else if (stock <= threshold) {
                    statusClass = 'low';
                    statusLabel = 'Low Stock';
                }
                const badgePrefix = containerId === 'stockInSelect' ? 'stock-in' : 'stock-out';
                infoDiv.innerHTML = `
                    <div class="${badgePrefix}-card ${statusClass}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-size: 0.75rem; color: var(--gray-500); font-weight: 600; display: block; letter-spacing: 0.5px;">CURRENT STOCK</span>
                                <span style="font-size: 1.35rem; font-weight: 800; color: var(--dark);">${stock} units</span>
                            </div>
                            <span class="${badgePrefix}-badge ${statusClass}">
                                <i class="ph ph-info"></i> ${statusLabel}
                            </span>
                        </div>
                    </div>
                `;
            } else {
                infoDiv.innerHTML = `Current Stock: <span style="font-size: 1.1rem;">${stock}</span>`;
            }
            infoDiv.style.display = 'block';
        }
    }

    container.classList.remove('active');
};

// Redesigned Stock In Helpers
window.adjustStockInQty = function (amount) {
    const input = document.getElementById('stockInQuantity');
    if (!input) return;
    let val = parseInt(input.value);
    if (isNaN(val)) val = 1;
    val += amount;
    if (val < 1) val = 1;
    input.value = val;
};

window.addStockInQtyPreset = function (amount) {
    const input = document.getElementById('stockInQuantity');
    if (!input) return;
    let val = parseInt(input.value);
    if (isNaN(val)) val = 0;
    val += amount;
    if (val < 1) val = 1;
    input.value = val;
};

window.setStockInReason = function (reason, btnEl) {
    const input = document.getElementById('stockInReason');
    if (!input) return;
    input.value = reason;

    const pills = document.querySelectorAll('#stockInModal .preset-reason-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
};

// Redesigned Stock Out Helpers
window.adjustStockOutQty = function (amount) {
    const input = document.getElementById('stockOutQuantity');
    if (!input) return;
    let val = parseInt(input.value);
    if (isNaN(val)) val = 1;
    val += amount;
    if (val < 1) val = 1;
    input.value = val;
};

window.addStockOutQtyPreset = function (amount) {
    const input = document.getElementById('stockOutQuantity');
    if (!input) return;
    let val = parseInt(input.value);
    if (isNaN(val)) val = 0;
    val += amount;
    if (val < 1) val = 1;
    input.value = val;
};

window.setStockOutReason = function (reason, btnEl) {
    const input = document.getElementById('stockOutReason');
    if (!input) return;
    input.value = reason;

    const pills = document.querySelectorAll('#stockOutModal .preset-reason-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
};

// --- Stock Modal Type Filters ---
let _stockInTypeFilter = 'all';
let _stockOutTypeFilter = 'all';

window.setStockInFilter = function (type, btnEl) {
    _stockInTypeFilter = type;

    // Update active pill state
    document.querySelectorAll('#stockInFilterPills .stock-filter-pill').forEach(p => {
        p.classList.remove('active', 'active-ingredient');
    });
    if (btnEl) {
        btnEl.classList.add(type === 'ingredient' ? 'active-ingredient' : 'active');
    }

    // Filter and re-render
    const query = document.getElementById('stockInSearch')?.value.toLowerCase().trim() || '';
    const filtered = _stockModalProducts.filter(p => {
        const typeMatch = type === 'all' || p.type === type;
        const queryMatch = !query || p.name.toLowerCase().includes(query) || p.meta.toLowerCase().includes(query);
        return typeMatch && queryMatch;
    });
    renderSearchableOptions('stockInSelect', filtered);
};

window.setStockOutFilter = function (type, btnEl) {
    _stockOutTypeFilter = type;

    // Update active pill state
    document.querySelectorAll('#stockOutFilterPills .stock-filter-pill').forEach(p => {
        p.classList.remove('active', 'active-ingredient');
    });
    if (btnEl) {
        btnEl.classList.add(type === 'ingredient' ? 'active-ingredient' : 'active');
    }

    // Filter and re-render
    const query = document.getElementById('stockOutSearch')?.value.toLowerCase().trim() || '';
    const filtered = _stockModalProducts.filter(p => {
        const typeMatch = type === 'all' || p.type === type;
        const queryMatch = !query || p.name.toLowerCase().includes(query) || p.meta.toLowerCase().includes(query);
        return typeMatch && queryMatch;
    });
    renderSearchableOptions('stockOutSelect', filtered);
};

// Show stock in modal
async function showStockInModal() {
    const products = await db.getAll('products');
    const ingredients = await db.getAll('ingredients');

    _stockModalProducts = [
        ...products.map(p => ({
            id: `product_${p.id}`,
            name: p.name,
            stock: p.stock,
            meta: `SKU: ${p.sku}`,
            type: 'product',
            dbId: p.id
        })),
        ...ingredients.map(i => ({
            id: `ingredient_${i.id}`,
            name: `[Ingredient] ${i.name}`,
            stock: i.stock,
            meta: `Unit: ${i.unit || 'pcs'}`,
            type: 'ingredient',
            dbId: i.id
        }))
    ];

    const searchInput = document.getElementById('stockInSearch');
    const hiddenInput = document.getElementById('stockInProduct');

    if (searchInput) searchInput.value = '';
    if (hiddenInput) hiddenInput.value = '';

    _stockInTypeFilter = 'all';
    document.querySelectorAll('#stockInFilterPills .stock-filter-pill').forEach((p, i) => {
        p.classList.remove('active', 'active-ingredient');
        if (i === 0) p.classList.add('active');
    });

    renderSearchableOptions('stockInSelect', _stockModalProducts);

    // Hide stock info
    const infoDiv = document.getElementById('stockInCurrentInfo');
    if (infoDiv) {
        infoDiv.style.display = 'none';
        infoDiv.innerHTML = '';
    }

    document.getElementById('stockInQuantity').value = '1';
    document.getElementById('stockInReason').value = '';
    
    // Clear preset button active states
    const pills = document.querySelectorAll('#stockInModal .preset-reason-pill');
    pills.forEach(p => p.classList.remove('active'));

    document.getElementById('stockInModal').classList.add('active');
    document.body.classList.add('modal-open');
}

// Close stock in modal
function closeStockInModal() {
    document.getElementById('stockInModal').classList.remove('active');
    document.body.classList.remove('modal-open');
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
    const ingredients = await db.getAll('ingredients');

    _stockModalProducts = [
        ...products.map(p => ({
            id: `product_${p.id}`,
            name: p.name,
            stock: p.stock,
            meta: `SKU: ${p.sku}`,
            type: 'product',
            dbId: p.id
        })),
        ...ingredients.map(i => ({
            id: `ingredient_${i.id}`,
            name: `[Ingredient] ${i.name}`,
            stock: i.stock,
            meta: `Unit: ${i.unit || 'pcs'}`,
            type: 'ingredient',
            dbId: i.id
        }))
    ];

    const searchInput = document.getElementById('stockOutSearch');
    const hiddenInput = document.getElementById('stockOutProduct');

    if (searchInput) searchInput.value = '';
    if (hiddenInput) hiddenInput.value = '';

    _stockOutTypeFilter = 'all';
    document.querySelectorAll('#stockOutFilterPills .stock-filter-pill').forEach((p, i) => {
        p.classList.remove('active', 'active-ingredient');
        if (i === 0) p.classList.add('active');
    });

    renderSearchableOptions('stockOutSelect', _stockModalProducts);

    // Hide stock info
    const infoDiv = document.getElementById('stockOutCurrentInfo');
    if (infoDiv) {
        infoDiv.style.display = 'none';
        infoDiv.innerHTML = '';
    }

    document.getElementById('stockOutQuantity').value = '1';
    document.getElementById('stockOutReason').value = '';
    
    // Clear preset button active states
    const pills = document.querySelectorAll('#stockOutModal .preset-reason-pill');
    pills.forEach(p => p.classList.remove('active'));

    document.getElementById('stockOutModal').classList.add('active');
    document.body.classList.add('modal-open');
}

// Close stock out modal
function closeStockOutModal() {
    document.getElementById('stockOutModal').classList.remove('active');
    document.body.classList.remove('modal-open');
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
        const filtered = _stockModalProducts.filter(p => {
            const typeMatch = _stockInTypeFilter === 'all' || p.type === _stockInTypeFilter;
            const queryMatch = !query || p.name.toLowerCase().includes(query) || p.meta.toLowerCase().includes(query);
            return typeMatch && queryMatch;
        });
        renderSearchableOptions('stockInSelect', filtered);
    });

    document.getElementById('stockOutSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = _stockModalProducts.filter(p => {
            const typeMatch = _stockOutTypeFilter === 'all' || p.type === _stockOutTypeFilter;
            const queryMatch = !query || p.name.toLowerCase().includes(query) || p.meta.toLowerCase().includes(query);
            return typeMatch && queryMatch;
        });
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

        const isIngredient = movement.itemType === 'ingredient';
        const item = isIngredient ? await db.get('ingredients', movement.productId) : await db.get('products', movement.productId);
        const itemName = item ? (isIngredient ? `[Ingredient] ${item.name}` : item.name) : 'Unknown Item (Deleted)';
        const itemSku = isIngredient ? `Unit: ${item?.unit || 'pcs'}` : (item?.sku || 'N/A');
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
                    <p style="font-weight: 800; color: var(--dark);">${isIngredient ? 'Ingredient' : 'Product'}</p>
                    <p>${escapeHtml(itemName)}</p>
                </div>
                 <div class="detail-item">
                    <p style="font-weight: 800; color: var(--dark);">${isIngredient ? 'Unit' : 'SKU'}</p>
                    <p>${escapeHtml(itemSku)}</p>
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
            document.body.classList.add('modal-open');

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

// Show modal with list of products (low stock or out of stock)
async function showInventoryListModal(type) {
    if (type) {
        currentAlertType = type;
        currentAlertQuery = '';
        alertPaginator.setPage(1);
    }

    showLoading('Loading list...');
    try {
        const products = await db.getAll('products');
        const threshold = Number(getLowStockThreshold());

        let filtered;
        let title;
        let iconClass;

        if (currentAlertType === 'low') {
            filtered = products.filter(p => {
                const stock = Number(p.stock);
                return stock <= threshold && stock > 0;
            });
            title = 'Low Stock Items';
            iconClass = 'ph-warning';
        } else {
            filtered = products.filter(p => Number(p.stock) === 0);
            title = 'Out of Stock Items';
            iconClass = 'ph-warning-octagon';
        }

        // Apply Search
        if (currentAlertQuery) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(currentAlertQuery) ||
                p.sku.toLowerCase().includes(currentAlertQuery)
            );
        }

        const detailsHtml = `
            <div class="transaction-header" style="flex-direction: column; align-items: stretch; gap: 1rem;">
                <div class="transaction-title" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <i class="ph ${iconClass}" style="color: ${currentAlertType === 'low' ? 'var(--warning)' : 'var(--danger)'}; font-size: 1.5rem;"></i>
                        <h3 style="margin: 0;">${title}</h3>
                    </div>
                    <span style="color: var(--gray-500); font-size: 0.85rem;">${filtered.length} products</span>
                </div>
                
                <div class="search-container">
                    <input type="text" id="alertSearchInput" class="form-control" 
                        placeholder="Search by name or SKU..." 
                        value="${currentAlertQuery}"
                        oninput="debounceAlertSearch(this.value)">
                </div>
            </div>

            <div class="table-responsive" style="margin-top: 1rem; min-height: 300px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Stock</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="alertProductsTable">
                        ${renderAlertTableRows(filtered)}
                    </tbody>
                </table>
            </div>
            <div id="alertPaginationContainer" style="margin-top: 1rem;"></div>
        `;

        const modalBody = document.getElementById('transactionDetails');
        if (modalBody) {
            modalBody.innerHTML = detailsHtml;
            const modalTitle = document.querySelector('#transactionModal h2');
            if (modalTitle) modalTitle.textContent = 'Inventory Alert';
            document.getElementById('transactionModal').classList.add('active');
            document.body.classList.add('modal-open');

            // Focus search input on first load
            if (type) {
                setTimeout(() => document.getElementById('alertSearchInput')?.focus(), 100);
            }
        }

        // Handle Pagination Controls
        const paginated = alertPaginator.paginate(filtered);
        alertPaginator.renderControls('alertPaginationContainer', paginated.totalPages, (page) => {
            alertPaginator.setPage(page);
            showInventoryListModal(); // Re-render with new page
        });

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error showing inventory list:', error);
        showToast('Error loading inventory list', 'error');
    }
}

// Helper to render rows for pagination
function renderAlertTableRows(products) {
    if (products.length === 0) {
        return '<tr><td colspan="3" class="table-empty">No products found</td></tr>';
    }

    const paginated = alertPaginator.paginate(products);
    return paginated.data.map(p => `
        <tr>
            <td>
                <div style="font-weight: 600;">${escapeHtml(p.name)}</div>
                <div style="font-size: 0.75rem; color: var(--gray-500); font-family: monospace;">SKU: ${escapeHtml(p.sku)}</div>
            </td>
            <td style="font-weight: bold; color: ${Number(p.stock) === 0 ? 'var(--danger)' : 'var(--warning)'}">
                ${p.stock}
            </td>
            <td>
                <div class="inventory-actions">
                    <button class="btn btn-success btn-sm" onclick="quickStockIn('${p.id}'); showInventoryListModal();" title="Stock In">
                        <i class="ph ph-plus"></i>
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="quickStockOut('${p.id}'); showInventoryListModal();" title="Stock Out">
                        <i class="ph ph-minus"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Debounced search for alert modal
let alertSearchTimeout;
function debounceAlertSearch(query) {
    clearTimeout(alertSearchTimeout);
    alertSearchTimeout = setTimeout(() => {
        currentAlertQuery = query.toLowerCase().trim();
        alertPaginator.setPage(1);
        showInventoryListModal();
    }, 300);
}

