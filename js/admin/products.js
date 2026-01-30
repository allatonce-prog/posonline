// Products Management
let editingProductId = null;

// Populate category dropdown with existing categories
async function populateCategoryList() {
    try {
        const products = await db.getAll('products');
        const categoryList = document.getElementById('categoryList');

        if (!categoryList) return;

        // Extract unique categories and sort by most recent
        const categoryMap = new Map();

        products.forEach(product => {
            if (product.category && product.category.trim()) {
                const category = product.category.trim();
                // Store the most recent timestamp for each category
                if (!categoryMap.has(category) ||
                    new Date(product.createdAt) > new Date(categoryMap.get(category))) {
                    categoryMap.set(category, product.createdAt);
                }
            }
        });

        // Sort categories by most recently used
        const sortedCategories = Array.from(categoryMap.entries())
            .sort((a, b) => new Date(b[1]) - new Date(a[1]))
            .map(entry => entry[0]);

        // Populate datalist
        categoryList.innerHTML = sortedCategories
            .map(category => `<option value="${escapeHtml(category)}">`)
            .join('');

    } catch (error) {
        console.error('Error populating category list:', error);
    }
}


// Load products
async function loadProducts() {
    const allProducts = await db.getAll('products');
    const tbody = document.getElementById('productsTable');

    // Populate category filter dropdown
    populateCategoryFilter(allProducts);

    // Get filter values
    const searchTerm = document.getElementById('productSearchInput')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('productCategoryFilter')?.value || 'all';

    // Filter products
    let products = allProducts;

    // Apply search filter
    if (searchTerm) {
        products = products.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.sku.toLowerCase().includes(searchTerm) ||
            (product.category && product.category.toLowerCase().includes(searchTerm))
        );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
        products = products.filter(product => product.category === categoryFilter);
    }

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No products found.</td></tr>';
        return;
    }

    // Get global low stock threshold
    const lowStockThreshold = getLowStockThreshold();

    tbody.innerHTML = products.map(product => {
        const isLowStock = product.stock <= lowStockThreshold;
        // Use inline styles or utility classes if available
        const stockStyle = isLowStock
            ? 'background-color: var(--danger); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem;'
            : 'background-color: var(--success); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem;';

        const stockText = `<span style="${stockStyle}">${product.stock}</span>`;

        return `
      <tr onclick="editProduct('${product.id}')" style="cursor: pointer;">
        <td data-label="SKU">${escapeHtml(product.sku)}</td>
        <td data-label="Name" style="font-weight: 600; color: var(--dark);">${escapeHtml(product.name)}</td>
        <td data-label="Category">${escapeHtml(product.category || '-')}</td>
        <td data-label="Price" style="color: var(--success); font-weight: bold; font-size: 1.1rem;">${formatCurrency(product.price)}</td>
        <td data-label="Stock" style="text-align: right;">${stockText}</td>
        <td class="action-cell text-right" onclick="event.stopPropagation()">
            <!-- Actions visible mainly on desktop or as needed -->
          <div class="action-btns justify-content-end">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="editProduct('${product.id}')" title="Edit">
              ✏️
            </button>
            <button class="btn btn-sm btn-danger btn-icon" onclick="deleteProduct('${product.id}')" title="Delete">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

// Populate category filter dropdown
function populateCategoryFilter(products) {
    const categoryFilter = document.getElementById('productCategoryFilter');
    if (!categoryFilter) return;

    // Get unique categories
    const categories = [...new Set(products
        .map(p => p.category)
        .filter(c => c && c.trim())
    )].sort();

    // Keep the current selection
    const currentValue = categoryFilter.value;

    // Populate dropdown
    categoryFilter.innerHTML = '<option value="all">All Categories</option>' +
        categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');

    // Restore selection if it still exists
    if (currentValue && categories.includes(currentValue)) {
        categoryFilter.value = currentValue;
    }
}


// Show add product modal
function showAddProductModal() {
    editingProductId = null;
    document.getElementById('productModalTitle').textContent = 'Add Product';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';

    // Reset alternative prices
    currentAlternativePrices = [];
    renderAlternativePrices();

    // Hide delete button for new products
    const deleteBtn = document.getElementById('btnDeleteProduct');
    if (deleteBtn) deleteBtn.style.display = 'none';

    document.getElementById('productModal').classList.add('active');

    // Populate category dropdown
    populateCategoryList();

    // Auto-focus SKU field for barcode scanner
    setTimeout(() => {
        const skuField = document.getElementById('productSku');
        if (skuField) {
            skuField.focus();
            skuField.select();
        }
    }, 100);
}

// Edit product
async function editProduct(id) {
    editingProductId = id;
    const product = await db.get('products', id);

    if (!product) {
        showToast('Product not found', 'error');
        return;
    }

    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = product.id;
    document.getElementById('productSku').value = product.sku;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productCost').value = product.cost;
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productDescription').value = product.description || '';

    // Load alternative prices
    currentAlternativePrices = product.alternativePrices || [];
    renderAlternativePrices();

    // Show delete button for existing products
    const deleteBtn = document.getElementById('btnDeleteProduct');
    if (deleteBtn) deleteBtn.style.display = 'block';

    // Populate category dropdown
    populateCategoryList();

    document.getElementById('productModal').classList.add('active');
}

// Delete current product from modal
async function deleteCurrentProduct() {
    if (editingProductId) {
        // Close modal first or after? Interactive confirm is in deleteProduct
        // We'll call deleteProduct. If it succeeds, we close the modal.
        // But deleteProduct asks for confirmation.

        // Let's use deleteProduct logic directly but handle the modal part
        if (!confirmDialog('Are you sure you want to delete this product? This action cannot be undone.')) {
            return;
        }

        showLoading('Deleting product...');

        try {
            await db.remove('products', editingProductId);

            // Also delete related stock movements
            const movements = await db.getAllByIndex('stockMovements', 'productId', editingProductId);
            for (const movement of movements) {
                await db.remove('stockMovements', movement.id);
            }

            hideLoading();
            showToast('Product deleted successfully', 'success');
            closeProductModal();
            await loadProducts();
        } catch (error) {
            hideLoading();
            showToast('Error deleting product: ' + error.message, 'error');
        }
    }
}

// Save product
async function saveProduct() {
    const sku = document.getElementById('productSku').value.trim();
    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const cost = parseFloat(document.getElementById('productCost').value);
    const stock = parseInt(document.getElementById('productStock').value);
    const description = document.getElementById('productDescription').value.trim();

    // Validation
    if (!sku || !name || !category || isNaN(price) || isNaN(cost) || isNaN(stock)) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }

    if (price < 0 || cost < 0 || stock < 0) {
        showToast('Values cannot be negative', 'warning');
        return;
    }

    showLoading('Saving product...');

    try {
        if (editingProductId) {
            // Update existing product
            const product = await db.get('products', editingProductId);
            const oldStock = product.stock;

            product.sku = sku;
            product.name = name;
            product.category = category;
            product.price = price;
            product.cost = cost;
            product.stock = stock;
            product.description = description;
            product.alternativePrices = currentAlternativePrices;

            await db.update('products', product);

            // Record stock movement if stock changed
            if (oldStock !== stock) {
                const diff = stock - oldStock;
                await db.add('stockMovements', {
                    productId: product.id,
                    type: diff > 0 ? 'in' : 'out',
                    quantity: Math.abs(diff),
                    reason: 'Product update - stock adjustment',
                    date: new Date().toISOString(),
                    user: auth.getCurrentUser().username
                });
            }

            showToast('Product updated successfully', 'success');
        } else {
            // Check for duplicate SKU
            const existing = await db.getByIndex('products', 'sku', sku);
            if (existing) {
                hideLoading();
                showToast('SKU already exists', 'error');
                return;
            }

            // Add new product
            const productId = await db.add('products', {
                sku,
                name,
                category,
                price,
                cost,
                stock,
                description,
                alternativePrices: currentAlternativePrices,
                image: null,
                createdAt: new Date().toISOString()
            });

            // Record initial stock
            if (stock > 0) {
                await db.add('stockMovements', {
                    productId: productId,
                    type: 'in',
                    quantity: stock,
                    reason: 'Initial stock',
                    date: new Date().toISOString(),
                    user: auth.getCurrentUser().username
                });
            }

            showToast('Product added successfully', 'success');
        }

        hideLoading();
        closeProductModal();
        await loadProducts();

    } catch (error) {
        hideLoading();
        showToast('Error saving product: ' + error.message, 'error');
    }
}

// Delete product
async function deleteProduct(id) {
    if (!confirmDialog('Are you sure you want to delete this product? This action cannot be undone.')) {
        return;
    }

    showLoading('Deleting product...');

    try {
        await db.remove('products', id);

        // Also delete related stock movements
        const movements = await db.getAllByIndex('stockMovements', 'productId', id);
        for (const movement of movements) {
            await db.remove('stockMovements', movement.id);
        }

        hideLoading();
        showToast('Product deleted successfully', 'success');
        await loadProducts();
    } catch (error) {
        hideLoading();
        showToast('Error deleting product: ' + error.message, 'error');
    }
}

// Close product modal
function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    editingProductId = null;
}

// Close modal on outside click
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('productModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'productModal') {
            closeProductModal();
        }
    });

    // Barcode scanner support for SKU field
    const skuField = document.getElementById('productSku');
    if (skuField) {
        skuField.addEventListener('keydown', (e) => {
            // When Enter is pressed (barcode scanner sends Enter after scanning)
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission

                // Move to next field (Product Name)
                const productNameField = document.getElementById('productName');
                if (productNameField) {
                    productNameField.focus();
                    productNameField.select();
                }

                // Visual feedback
                skuField.style.borderColor = '#10b981'; // Green border
                setTimeout(() => {
                    skuField.style.borderColor = '';
                }, 500);
            }
        });

        // Add visual indicator when SKU field is focused
        skuField.addEventListener('focus', () => {
            skuField.setAttribute('placeholder', '📷 Scan barcode or type SKU...');
        });

        skuField.addEventListener('blur', () => {
            skuField.setAttribute('placeholder', '');
        });
    }

    // Product search and filter event listeners
    const productSearchInput = document.getElementById('productSearchInput');
    if (productSearchInput) {
        productSearchInput.addEventListener('input', () => {
            loadProducts();
        });
    }

    const productCategoryFilter = document.getElementById('productCategoryFilter');
    if (productCategoryFilter) {
        productCategoryFilter.addEventListener('change', () => {
            loadProducts();
        });
    }
});

// Alternative Prices Logic
let currentAlternativePrices = [];

function renderAlternativePrices() {
    const list = document.getElementById('alternativePricesList');
    if (!list) return;

    list.innerHTML = currentAlternativePrices.map((p, index) => `
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; background: var(--light); padding: 0.5rem; border-radius: var(--radius-sm);">
            <div style="flex: 1; font-weight: 500;">${escapeHtml(p.name)}</div>
            <div style="flex: 1;">${formatCurrency(p.price)}</div>
            <button type="button" class="btn btn-sm btn-danger btn-icon" onclick="removeAlternativePrice(${index})" style="width: 24px; height: 24px; padding: 0;">×</button>
        </div>
    `).join('');
}

function addAlternativePrice() {
    const labelInput = document.getElementById('newPriceLabel');
    const valueInput = document.getElementById('newPriceValue');

    const name = labelInput.value.trim();
    const price = parseFloat(valueInput.value);

    if (!name || isNaN(price) || price < 0) {
        showToast('Please enter a valid name and price', 'warning');
        return;
    }

    currentAlternativePrices.push({ name, price });
    renderAlternativePrices();

    // Clear inputs
    labelInput.value = '';
    valueInput.value = '';
    labelInput.focus();
}

function removeAlternativePrice(index) {
    currentAlternativePrices.splice(index, 1);
    renderAlternativePrices();
}
