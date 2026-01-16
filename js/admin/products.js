// Products Management
let editingProductId = null;

// Load products
async function loadProducts() {
    const products = await db.getAll('products');
    const tbody = document.getElementById('productsTable');

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No products yet. Add your first product!</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(product => {
        const stockClass = product.stock <= product.lowStockThreshold ? 'low-stock-badge' : '';
        const stockText = product.stock <= product.lowStockThreshold
            ? `<span class="low-stock-badge">${product.stock}</span>`
            : product.stock;

        return `
      <tr>
        <td>${escapeHtml(product.sku)}</td>
        <td>${escapeHtml(product.name)}</td>
        <td>${escapeHtml(product.category || '-')}</td>
        <td>${formatCurrency(product.price)}</td>
        <td>${stockText}</td>
        <td>
          <div class="action-btns">
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

// Show add product modal
function showAddProductModal() {
    editingProductId = null;
    document.getElementById('productModalTitle').textContent = 'Add Product';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productModal').classList.add('active');
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
    document.getElementById('productLowStock').value = product.lowStockThreshold;
    document.getElementById('productDescription').value = product.description || '';

    document.getElementById('productModal').classList.add('active');
}

// Save product
async function saveProduct() {
    const sku = document.getElementById('productSku').value.trim();
    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const cost = parseFloat(document.getElementById('productCost').value);
    const stock = parseInt(document.getElementById('productStock').value);
    const lowStockThreshold = parseInt(document.getElementById('productLowStock').value);
    const description = document.getElementById('productDescription').value.trim();

    // Validation
    if (!sku || !name || !category || isNaN(price) || isNaN(cost) || isNaN(stock) || isNaN(lowStockThreshold)) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }

    if (price < 0 || cost < 0 || stock < 0 || lowStockThreshold < 0) {
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
            product.lowStockThreshold = lowStockThreshold;
            product.description = description;

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
                lowStockThreshold,
                description,
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
        await db.delete('products', id);

        // Also delete related stock movements
        const movements = await db.getAllByIndex('stockMovements', 'productId', id);
        for (const movement of movements) {
            await db.delete('stockMovements', movement.id);
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
});
