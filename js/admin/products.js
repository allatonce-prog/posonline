// Products Management
let editingProductId = null;
const productsPaginator = new PaginationManager(5);

// Cloudinary Configuration (Cloud Name and Upload Preset must be configured for unsigned uploads)
const CLOUDINARY_CLOUD_NAME = '';
const CLOUDINARY_UPLOAD_PRESET = '';
const CLOUDINARY_API_KEY = '881294228193848';
const CLOUDINARY_API_SECRET = 'Z2fnBZ15eDcmOvP9P_laQg43jOU';

// Image Upload Helpers
async function uploadToCloudinary(file) {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
        throw new Error('Cloudinary Cloud Name and Upload Preset are required for image uploads.');
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Cloudinary upload failed');
    }

    const data = await response.json();
    return data.secure_url;
}

function resizeAndCompressImage(file, maxWidth = 300, maxHeight = 300, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Export to base64 with jpeg compression
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedBase64);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

window.handleProductImageSelect = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showToast('Image size exceeds 2MB limit', 'warning');
        return;
    }

    showLoading('Uploading image...');

    try {
        let imageUrl = '';
        if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET) {
            // Upload to Cloudinary
            imageUrl = await uploadToCloudinary(file);
        } else {
            // Fallback to Base64 (Compressed jpeg to fit Firebase 1MB doc limit)
            imageUrl = await resizeAndCompressImage(file);
            showToast('Cloudinary not configured. Image compressed and saved locally.', 'info');
        }

        // Update UI
        document.getElementById('productImageUrl').value = imageUrl;
        const imgPreview = document.getElementById('productImagePreview');
        imgPreview.src = imageUrl;
        imgPreview.style.display = 'block';
        document.getElementById('productImagePlaceholderIcon').style.display = 'none';
        document.getElementById('btnRemoveProductImage').style.display = 'block';
        hideLoading();
        showToast('Image selected successfully', 'success');
    } catch (error) {
        hideLoading();
        console.error('Image upload error:', error);
        showToast('Error uploading image: ' + error.message, 'error');
    }
};

window.removeProductImage = function () {
    document.getElementById('productImageUrl').value = '';
    document.getElementById('productImageFile').value = '';
    const imgPreview = document.getElementById('productImagePreview');
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    document.getElementById('productImagePlaceholderIcon').style.display = 'block';
    document.getElementById('btnRemoveProductImage').style.display = 'none';
};

// -----------------------------------------------
// Stock Mode Toggle Helpers
// -----------------------------------------------
window.setStockMode = function (mode) {
    const modeInput = document.getElementById('productStockMode');
    const stockInput = document.getElementById('productStock');
    const panelStock = document.getElementById('panelStockBased');
    const panelAvail = document.getElementById('panelAvailabilityBased');
    const btnStock = document.getElementById('btnStockBased');
    const btnAvail = document.getElementById('btnAvailabilityBased');

    if (!modeInput) return;
    modeInput.value = mode;

    if (mode === 'stock') {
        // Active styles
        btnStock.style.background = 'var(--primary)';
        btnStock.style.color = 'white';
        btnStock.style.boxShadow = '0 2px 6px rgba(99,102,241,0.3)';
        btnAvail.style.background = 'transparent';
        btnAvail.style.color = 'var(--gray-600)';
        btnAvail.style.boxShadow = 'none';
        // Panels
        panelStock.style.display = 'block';
        panelAvail.style.display = 'none';
        // Re-enable required
        if (stockInput) { stockInput.required = true; stockInput.disabled = false; }
    } else {
        // Active styles
        btnAvail.style.background = 'var(--primary)';
        btnAvail.style.color = 'white';
        btnAvail.style.boxShadow = '0 2px 6px rgba(99,102,241,0.3)';
        btnStock.style.background = 'transparent';
        btnStock.style.color = 'var(--gray-600)';
        btnStock.style.boxShadow = 'none';
        // Panels
        panelStock.style.display = 'none';
        panelAvail.style.display = 'block';
        // Disable required so form can submit
        if (stockInput) { stockInput.required = false; stockInput.value = 0; stockInput.disabled = true; }
        updateAvailabilityLabel();
    }
};

window.updateAvailabilityLabel = function () {
    const cb = document.getElementById('productAvailability');
    const lbl = document.getElementById('availabilityLabel');
    if (!cb || !lbl) return;
    lbl.textContent = cb.checked ? 'Available' : 'Not Available';
    lbl.style.color = cb.checked ? 'var(--success)' : 'var(--danger)';
};

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
    // Fetch all necessary data in parallel
    const [allProducts, allRecipes, allIngredients] = await Promise.all([
        db.getAll('products'),
        db.getAll('recipes'),
        db.getAll('ingredients')
    ]);

    const tbody = document.getElementById('productsTable');

    // Populate category filter dropdown
    populateCategoryFilter(allProducts);

    // Get filter values
    const searchTerm = document.getElementById('productSearchInput')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('productCategoryFilter')?.value || 'all';

    // Filter products
    let products = allProducts;

    if (searchTerm) {
        products = products.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.sku.toLowerCase().includes(searchTerm) ||
            (product.genericName && product.genericName.toLowerCase().includes(searchTerm)) ||
            (product.category && product.category.toLowerCase().includes(searchTerm))
        );
    }

    if (categoryFilter !== 'all') {
        products = products.filter(product => product.category === categoryFilter);
    }

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No products found.</td></tr>';
        const container = document.getElementById('productsPaginationContainer');
        if (container) container.innerHTML = '';
        return;
    }

    const paginated = productsPaginator.paginate(products);
    const displayProducts = paginated.data;
    const lowStockThreshold = getLowStockThreshold();

    tbody.innerHTML = displayProducts.map(product => {
        let stockHtml = '';

        // AVAILABILITY MODE takes priority over recipe/stock
        if (product.stockMode === 'availability') {
            const avail = product.isAvailable !== false;
            stockHtml = avail
                ? `<span style="background-color: var(--success); color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">Available</span>`
                : `<span style="background-color: var(--danger); color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">Not Available</span>`;
        } else {
            // NORMAL STOCK-BASED
            const isLowStock = product.stock <= lowStockThreshold;
            const stockStyle = isLowStock
                ? 'background-color: var(--danger); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem;'
                : 'background-color: var(--success); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem;';
            stockHtml = `<span style="${stockStyle}">${product.stock}</span>`;
        }

        return `
      <tr onclick="editProduct('${product.id}')" style="cursor: pointer;">
        <td data-label="SKU">${escapeHtml(product.sku)}</td>
        <td data-label="Name" style="font-weight: 600; color: var(--dark);">
            ${escapeHtml(product.name)}
            ${product.hasRecipe ? '<span title="Recipe Product">🍔</span>' : ''}
        </td>
        <td data-label="Category">${escapeHtml(product.category || '-')}</td>
        <td data-label="Price" style="font-weight: 500;">${formatCurrency(product.price)}</td>
        <td data-label="Stock">${stockHtml}</td>
        <td data-label="Actions">
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button class="btn-icon" onclick="editProduct('${product.id}'); event.stopPropagation();" style="color: white; background: #f59e0b; width: 32px; height: 32px; border-radius: 6px;">
                    <i class="ph ph-pencil-simple"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteProduct('${product.id}'); event.stopPropagation();" style="color: var(--danger); background: var(--danger-light); width: 32px; height: 32px; border-radius: 6px;">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
        </td>
      </tr>
    `;
    }).join('');

    // Check for pagination container or create it
    const tableContainer = document.querySelector('#products-tab .table-container');
    let paginationContainer = document.getElementById('productsPaginationContainer');
    if (!paginationContainer && tableContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'productsPaginationContainer';
        tableContainer.appendChild(paginationContainer);
    }

    // Render pagination controls
    if (productsPaginator && typeof productsPaginator.renderControls === 'function') {
        productsPaginator.renderControls('productsPaginationContainer', paginated.totalPages, (page) => {
            productsPaginator.setPage(page);
            loadProducts();
        });
    } else if (typeof renderPagination === 'function') {
        // Fallback to old pagination if class not working as expected
        renderPagination(
            products.length,
            productsPaginator.currentPage,
            productsPaginator.itemsPerPage,
            'productsPaginationContainer',
            (page) => {
                productsPaginator.currentPage = page;
                loadProducts();
            }
        );
    }
}

// Smart Pricing Calculator Logic
let isCalculating = false; // Prevent circular updates

function setupPricingCalculator() {
    const costInput = document.getElementById('productCost');
    const markupInput = document.getElementById('productMarkup');
    const priceInput = document.getElementById('productPrice');
    const profitDisplay = document.getElementById('profitDisplay');
    const profitAmount = document.getElementById('profitAmount');
    const warningDiv = document.getElementById('pricingWarning');
    const warningText = document.getElementById('warningText');

    if (!costInput || !markupInput || !priceInput) return;

    // Remove existing event listeners by cloning and replacing
    const newCostInput = costInput.cloneNode(true);
    const newMarkupInput = markupInput.cloneNode(true);
    const newPriceInput = priceInput.cloneNode(true);

    costInput.parentNode.replaceChild(newCostInput, costInput);
    markupInput.parentNode.replaceChild(newMarkupInput, markupInput);
    priceInput.parentNode.replaceChild(newPriceInput, priceInput);

    // Add visual feedback class
    const addCalculatedEffect = (element) => {
        element.style.background = '#dbeafe';
        element.style.borderColor = '#3b82f6';
        element.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            element.style.background = '';
            element.style.borderColor = '';
        }, 1000);
    };

    // Calculate and update profit display
    const updateProfitDisplay = () => {
        const cost = parseFloat(newCostInput.value) || 0;
        const price = parseFloat(newPriceInput.value) || 0;
        const markup = parseFloat(newMarkupInput.value) || 0;

        if (cost > 0 && price > 0) {
            const profit = price - cost;
            profitAmount.textContent = formatCurrency(profit);
            profitDisplay.style.display = 'block';

            // Update profit color based on value
            if (profit < 0) {
                profitAmount.style.color = 'var(--danger)';
            } else if (profit === 0) {
                profitAmount.style.color = 'var(--warning)';
            } else {
                profitAmount.style.color = 'var(--success)';
            }

            // Show warnings
            if (profit < 0) {
                warningText.textContent = '⚠️ Warning: Selling price is lower than cost! You\'re losing money.';
                warningDiv.style.display = 'block';
                warningDiv.style.background = '#fee2e2';
                warningDiv.style.borderColor = '#ef4444';
            } else if (markup > 200) {
                warningText.textContent = '💡 Notice: Markup is very high (>200%). Make sure this is intentional.';
                warningDiv.style.display = 'block';
                warningDiv.style.background = '#fef3c7';
                warningDiv.style.borderColor = '#fbbf24';
            } else {
                warningDiv.style.display = 'none';
            }
        } else {
            profitDisplay.style.display = 'none';
            warningDiv.style.display = 'none';
        }
    };

    // Cost input handler
    newCostInput.addEventListener('input', () => {
        if (isCalculating) return;
        isCalculating = true;

        const cost = parseFloat(newCostInput.value) || 0;
        const markup = parseFloat(newMarkupInput.value);
        const price = parseFloat(newPriceInput.value);

        if (cost > 0) {
            if (!isNaN(markup) && markup >= 0) {
                // Calculate price from cost + markup
                const calculatedPrice = cost * (1 + markup / 100);
                newPriceInput.value = calculatedPrice.toFixed(2);
                addCalculatedEffect(newPriceInput);
            } else if (!isNaN(price) && price > 0) {
                // Calculate markup from cost + price
                const calculatedMarkup = ((price - cost) / cost) * 100;
                newMarkupInput.value = calculatedMarkup.toFixed(2);
                addCalculatedEffect(newMarkupInput);
            }
        }

        updateProfitDisplay();
        isCalculating = false;
    });

    // Markup input handler
    newMarkupInput.addEventListener('input', () => {
        if (isCalculating) return;
        isCalculating = true;

        const markup = parseFloat(newMarkupInput.value) || 0;
        const cost = parseFloat(newCostInput.value);
        const price = parseFloat(newPriceInput.value);

        if (markup >= 0) {
            if (!isNaN(cost) && cost > 0) {
                // Calculate price from cost + markup
                const calculatedPrice = cost * (1 + markup / 100);
                newPriceInput.value = calculatedPrice.toFixed(2);
                addCalculatedEffect(newPriceInput);
            } else if (!isNaN(price) && price > 0) {
                // Calculate cost from markup + price
                const calculatedCost = price / (1 + markup / 100);
                newCostInput.value = calculatedCost.toFixed(2);
                addCalculatedEffect(newCostInput);
            }
        }

        updateProfitDisplay();
        isCalculating = false;
    });

    // Price input handler
    newPriceInput.addEventListener('input', () => {
        if (isCalculating) return;
        isCalculating = true;

        const price = parseFloat(newPriceInput.value) || 0;
        const cost = parseFloat(newCostInput.value);
        const markup = parseFloat(newMarkupInput.value);

        if (price > 0) {
            if (!isNaN(cost) && cost > 0) {
                // Calculate markup from cost + price
                const calculatedMarkup = ((price - cost) / cost) * 100;
                newMarkupInput.value = calculatedMarkup.toFixed(2);
                addCalculatedEffect(newMarkupInput);
            } else if (!isNaN(markup) && markup >= 0) {
                // Calculate cost from markup + price
                const calculatedCost = price / (1 + markup / 100);
                newCostInput.value = calculatedCost.toFixed(2);
                addCalculatedEffect(newCostInput);
            }
        }

        updateProfitDisplay();
        isCalculating = false;
    });
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

    // Reset image
    if (typeof removeProductImage === 'function') {
        removeProductImage();
    }

    // Reset alternative prices
    currentAlternativePrices = [];
    renderAlternativePrices();

    // Reset Recipe Data (Default OFF)
    currentRecipeIngredients = [];
    recipeOriginalId = null;

    // Reset Toggle
    const toggle = document.getElementById('enableRecipeToggle');
    if (toggle) {
        toggle.checked = false;
        toggleRecipeConfig(); // Hide section
    }

    // Reset stock mode to 'stock' (default)
    setStockMode('stock');
    const availCb = document.getElementById('productAvailability');
    if (availCb) availCb.checked = true;

    loadIngredients().then(() => {
        renderRecipeIngredientRows();
    });
    // Reset totals display
    if (document.getElementById('recipeTotalCost')) document.getElementById('recipeTotalCost').textContent = '₱0.00';
    if (document.getElementById('recipeProfit')) document.getElementById('recipeProfit').textContent = '₱0.00';

    // Hide delete button for new products
    const deleteBtn = document.getElementById('btnDeleteProduct');
    if (deleteBtn) deleteBtn.style.display = 'none';

    document.getElementById('productModal').classList.add('active');
    document.body.classList.add('modal-open');

    // Populate category dropdown
    populateCategoryList();

    // Auto-focus SKU field for barcode scanner
    setTimeout(() => {
        const skuField = document.getElementById('productSku');
        if (skuField) {
            skuField.focus();
            skuField.select();
        }
        // Setup pricing calculator
        setupPricingCalculator();
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
    document.getElementById('productGenericName').value = product.genericName || '';
    document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productCost').value = product.cost;
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productExpiry').value = product.expiryDate || '';
    document.getElementById('productBatch').value = product.batchNumber || '';
    document.getElementById('productDescription').value = product.description || '';

    // Load image
    if (product.image) {
        document.getElementById('productImageUrl').value = product.image;
        const imgPreview = document.getElementById('productImagePreview');
        if (imgPreview) {
            imgPreview.src = product.image;
            imgPreview.style.display = 'block';
        }
        const placeholderIcon = document.getElementById('productImagePlaceholderIcon');
        if (placeholderIcon) placeholderIcon.style.display = 'none';
        const removeBtn = document.getElementById('btnRemoveProductImage');
        if (removeBtn) removeBtn.style.display = 'block';
    } else {
        if (typeof removeProductImage === 'function') {
            removeProductImage();
        }
    }

    // Load alternative prices
    currentAlternativePrices = product.alternativePrices || [];
    renderAlternativePrices();

    // Load Recipe Data
    currentRecipeIngredients = [];
    recipeOriginalId = null;

    // Load ingredients and THEN load recipe (async)
    loadIngredients().then(async () => {
        const toggle = document.getElementById('enableRecipeToggle');

        if (product.hasRecipe) {
            try {
                // Fetch all recipes (optimize with index later if needed)
                const allRecipes = await db.getAll('recipes');
                const recipe = allRecipes.find(r => r.productId === product.id);

                if (recipe) {
                    currentRecipeIngredients = recipe.ingredients || [];
                    recipeOriginalId = recipe.id;
                    if (toggle) toggle.checked = true;
                } else {
                    if (toggle) toggle.checked = false; // Has flag but no data case
                }
            } catch (err) {
                console.error('Error fetching recipe for product:', err);
                if (toggle) toggle.checked = false;
            }
        } else {
            if (toggle) toggle.checked = false;
        }

        // Update UI visibility
        toggleRecipeConfig();
        renderRecipeIngredientRows();
    });

    // Restore stock mode
    const savedMode = product.stockMode || 'stock';
    setStockMode(savedMode);
    if (savedMode === 'availability') {
        const availCb = document.getElementById('productAvailability');
        if (availCb) {
            availCb.checked = product.isAvailable !== false; // default true
            updateAvailabilityLabel();
        }
    }

    // Show delete button for existing products
    const deleteBtn = document.getElementById('btnDeleteProduct');
    if (deleteBtn) deleteBtn.style.display = 'block';

    // Populate category dropdown
    populateCategoryList();

    document.getElementById('productModal').classList.add('active');
    document.body.classList.add('modal-open');

    // Setup pricing calculator and calculate markup from existing values
    setTimeout(() => {
        setupPricingCalculator();
        // Calculate markup from existing cost and price
        const cost = parseFloat(document.getElementById('productCost').value) || 0;
        const price = parseFloat(document.getElementById('productPrice').value) || 0;
        if (cost > 0 && price > 0) {
            const markup = ((price - cost) / cost) * 100;
            document.getElementById('productMarkup').value = markup.toFixed(2);
        }
    }, 100);
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
    const image = document.getElementById('productImageUrl').value || null;
    const sku = document.getElementById('productSku').value.trim();
    const name = document.getElementById('productName').value.trim();
    const genericName = document.getElementById('productGenericName').value.trim();
    const category = document.getElementById('productCategory').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const cost = parseFloat(document.getElementById('productCost').value);
    const markup = parseFloat(document.getElementById('productMarkup').value) || 0;
    const expiryDate = document.getElementById('productExpiry').value;
    const batchNumber = document.getElementById('productBatch').value.trim();
    const description = document.getElementById('productDescription').value.trim();
    // NOTE: stock is read AFTER stockMode is determined (below)

    // Read stock mode FIRST (before reading stock value)
    const stockMode = document.getElementById('productStockMode')?.value || 'stock';
    const availCbEl = document.getElementById('productAvailability');
    const isAvailable = stockMode === 'availability'
        ? (availCbEl ? availCbEl.checked : true)
        : true;

    // Read stock — when field is disabled (availability mode) value is '', default to 0
    const stockRaw = document.getElementById('productStock').value;
    const stock = stockMode === 'availability' ? 0 : (parseInt(stockRaw) || 0);

    console.log('[saveProduct] stockMode:', stockMode, '| isAvailable:', isAvailable, '| stock:', stock);

    // Validation (relax stock requirement in availability mode)
    if (!sku || !name || !category || isNaN(price) || isNaN(cost) || (stockMode === 'stock' && isNaN(stock))) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }

    if (price < 0 || cost < 0 || (stockMode === 'stock' && stock < 0)) {
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
            product.genericName = genericName;
            product.category = category;
            product.price = price;
            product.cost = cost;
            product.markup = markup;
            product.stock = stockMode === 'stock' ? stock : 0;
            product.stockMode = stockMode;
            product.isAvailable = isAvailable;
            product.expiryDate = expiryDate;
            product.batchNumber = batchNumber;
            product.description = description;
            product.alternativePrices = currentAlternativePrices;
            product.image = image;

            // Process Recipe Data
            let hasRecipe = false;
            let totalRecipeCost = 0;
            const toggle = document.getElementById('enableRecipeToggle');
            const isRecipeEnabled = toggle ? toggle.checked : false;

            let validIngredients = [];
            if (isRecipeEnabled) {
                validIngredients = currentRecipeIngredients.filter(item => item.ingredientId && parseFloat(item.quantity) > 0);

                if (validIngredients.length > 0) {
                    hasRecipe = true;
                    // Calculate total cost
                    validIngredients.forEach(item => {
                        const ing = allIngredients.find(i => i.id === item.ingredientId);
                        if (ing) totalRecipeCost += (ing.cost * parseFloat(item.quantity));
                    });
                }
            } else {
                // If disabled, force clear (user turned it off)
                hasRecipe = false;
                validIngredients = [];
            }

            product.hasRecipe = hasRecipe;

            await db.update('products', product);

            // Save/Update Recipe Record
            if (hasRecipe) {
                const recipeData = {
                    productId: product.id,
                    ingredients: validIngredients,
                    totalCost: totalRecipeCost,
                    updatedAt: new Date().toISOString()
                };

                if (recipeOriginalId) {
                    await db.update('recipes', { id: recipeOriginalId, ...recipeData });
                } else {
                    // Check if one exists anyway to be safe (though removed UI prevents accidental overwrite usually)
                    const allRecipes = await db.getAll('recipes');
                    const existing = allRecipes.find(r => r.productId === product.id);
                    if (existing) {
                        await db.update('recipes', { id: existing.id, ...recipeData });
                    } else {
                        recipeData.createdAt = new Date().toISOString();
                        await db.add('recipes', recipeData);
                    }
                }
            } else {
                // If disabled, force clear (user turned it off or empty ingredients)

                // 1. Check valid ID
                if (recipeOriginalId) {
                    await db.delete('recipes', recipeOriginalId);
                } else {
                    // 2. Extra safety: Check if a recipe exists for this product and delete it
                    try {
                        const allRecipes = await db.getAll('recipes');
                        const existing = allRecipes.find(r => r.productId === product.id);
                        if (existing) {
                            await db.delete('recipes', existing.id);
                        }
                    } catch (err) {
                        console.error('Error ensuring recipe deletion:', err);
                    }
                }
            }

            // Record stock movement if stock changed (skip for availability-mode)
            if (stockMode === 'stock' && oldStock !== stock) {
                const diff = stock - oldStock;
                await db.add('stockMovements', {
                    productId: product.id,
                    type: diff > 0 ? 'in' : 'out',
                    quantity: Math.abs(diff),
                    reason: 'Product update - stock adjustment',
                    date: new Date().toISOString(),
                    user: auth.getCurrentUser().username,
                    stockBefore: oldStock,
                    stockAfter: stock,
                    unitPrice: product.price
                });
            }

            // Real-time notification to other admins
            const adminName = auth.getCurrentUser().name || auth.getCurrentUser().username;
            await db.notify(
                'product_update',
                'Product Updated',
                `${adminName} updated product "${name}"`,
                { productId: product.id, user: adminName, action: 'update' }
            );

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
            // Process Recipe Data for NEW Product
            let hasRecipe = false;
            let totalRecipeCost = 0;
            const toggle = document.getElementById('enableRecipeToggle');
            const isRecipeEnabled = toggle ? toggle.checked : false;

            let validIngredients = [];
            if (isRecipeEnabled) {
                validIngredients = currentRecipeIngredients.filter(item => item.ingredientId && parseFloat(item.quantity) > 0);

                if (validIngredients.length > 0) {
                    hasRecipe = true;
                    // Calculate total cost
                    validIngredients.forEach(item => {
                        const ing = allIngredients.find(i => i.id === item.ingredientId);
                        if (ing) totalRecipeCost += (ing.cost * parseFloat(item.quantity));
                    });
                }
            }

            // Add new product
            const productId = await db.add('products', {
                sku,
                name,
                genericName,
                category,
                price,
                cost,
                markup,
                stock: stockMode === 'stock' ? stock : 0,
                stockMode,
                isAvailable,
                expiryDate,
                batchNumber,
                description,
                alternativePrices: currentAlternativePrices,
                image: image,
                hasRecipe: hasRecipe,
                createdAt: new Date().toISOString()
            });

            // Save Recipe Record for NEW Product
            if (hasRecipe) {
                const recipeData = {
                    productId: productId,
                    ingredients: validIngredients,
                    totalCost: totalRecipeCost,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                await db.add('recipes', recipeData);
            }


            // Record initial stock
            if (stock > 0) {
                await db.add('stockMovements', {
                    productId: productId,
                    type: 'in',
                    quantity: stock,
                    reason: 'Initial stock',
                    date: new Date().toISOString(),
                    user: auth.getCurrentUser().username,
                    stockBefore: 0,
                    stockAfter: stock,
                    unitPrice: price
                });
            }

            // Real-time notification
            const adminName = auth.getCurrentUser().name || auth.getCurrentUser().username;
            await db.notify(
                'product_update',
                'New Product Added',
                `${adminName} added new product "${name}"`,
                { productId: productId, user: adminName, action: 'add' }
            );

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
    document.body.classList.remove('modal-open');
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

// ---------------------------------------------------------
// RECIPE MANAGEMENT Logic (Integrated into Product Modal)
// ---------------------------------------------------------

// Load ingredients for the dropdown
async function loadIngredients() {
    try {
        const ingredients = await db.getAll('ingredients');
        // Filter out deleted ingredients or check valid state
        if (ingredients) {
            allIngredients = ingredients.sort((a, b) => a.name.localeCompare(b.name));
        }
    } catch (error) {
        console.error('Error loading ingredients:', error);
    }
}

// Toggle Recipe Configuration visibility
window.toggleRecipeConfig = function () {
    const toggle = document.getElementById('enableRecipeToggle');
    const container = document.getElementById('recipeConfigContainer');
    const addBtn = document.getElementById('btnAddIngredient');

    if (toggle && toggle.checked) {
        if (container) container.style.display = 'block';
        if (addBtn) addBtn.style.display = 'block';
        // Add first row if empty and just enabled
        if (!currentRecipeIngredients || currentRecipeIngredients.length === 0) {
            addIngredientRow();
        }
    } else {
        if (container) container.style.display = 'none';
        if (addBtn) addBtn.style.display = 'none';
    }
}

// Rendering Dynamic Recipe Rows
function renderRecipeIngredientRows() {
    const listContainer = document.getElementById('recipeIngredientsList');
    const emptyState = document.getElementById('recipeEmptyState');

    if (!listContainer) return;

    if (!currentRecipeIngredients || currentRecipeIngredients.length === 0) {
        listContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        updateRecipeTotals();
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    listContainer.innerHTML = '';

    currentRecipeIngredients.forEach((item, index) => {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex; 
            gap: 0.5rem; 
            align-items: center; 
            background: white; 
            padding: 0.4rem; 
            border-radius: var(--radius-sm); 
            border: 1px solid var(--gray-200); 
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        `;

        // Ensure item has valid properties
        item.ingredientId = item.ingredientId || '';
        item.quantity = item.quantity || 1;

        // Ingredient Options
        let optionsHtml = '<option value="">Select Ingredient...</option>';
        allIngredients.forEach(ing => {
            const selected = ing.id === item.ingredientId ? 'selected' : '';
            optionsHtml += `<option value="${ing.id}" ${selected}>${escapeHtml(ing.name)}</option>`;
        });

        const selectedIng = allIngredients.find(i => i.id === item.ingredientId);
        const unitLabel = selectedIng ? selectedIng.unit : '';
        const costPerUnit = selectedIng ? selectedIng.cost : 0;
        const totalCostCost = (costPerUnit * (parseFloat(item.quantity) || 0)).toFixed(2);

        row.innerHTML = `
            <div style="flex: 1; min-width: 120px;">
                <select class="form-control form-control-sm" onchange="updateRecipeIngredient(${index}, 'ingredientId', this.value)" style="font-size: 0.85rem; height: auto; padding: 0.25rem 0.5rem; border: none; background: transparent; font-weight: 500;">
                    ${optionsHtml}
                </select>
            </div>
            
            <div style="width: 70px; display: flex; align-items: center; gap: 4px; border-left: 1px solid var(--gray-200); padding-left: 8px;">
                <input type="number" value="${item.quantity}" min="0.01" step="0.01"
                    onchange="updateRecipeIngredient(${index}, 'quantity', this.value)"
                    style="width: 100%; border: none; font-size: 0.85rem; text-align: center; padding: 2px; background: transparent; font-weight: 600;">
            </div>

            <div style="width: 40px; font-size: 0.75rem; color: var(--gray-500); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${unitLabel}
            </div>

            <div style="width: 60px; font-size: 0.8rem; font-weight: 600; text-align: right; color: var(--dark);">
                ₱${totalCostCost}
            </div>

            <button type="button" class="btn-icon delete" onclick="removeRecipeIngredient(${index})" style="color: var(--danger); width: 24px; height: 24px; padding: 0; min-width: 24px; margin-left: 4px;">
                <i class="ph ph-x"></i>
            </button>
        `;
        listContainer.appendChild(row);
    });

    updateRecipeTotals();
}

window.addIngredientRow = function () {
    if (!currentRecipeIngredients) currentRecipeIngredients = [];
    currentRecipeIngredients.push({
        ingredientId: '',
        quantity: 1
    });
    renderRecipeIngredientRows();
}

window.removeRecipeIngredient = function (index) {
    if (currentRecipeIngredients) {
        currentRecipeIngredients.splice(index, 1);
        renderRecipeIngredientRows();
    }
}

window.updateRecipeIngredient = function (index, field, value) {
    if (currentRecipeIngredients && currentRecipeIngredients[index]) {
        currentRecipeIngredients[index][field] = value;
        renderRecipeIngredientRows();
    }
}

function updateRecipeTotals() {
    let totalCost = 0;

    if (currentRecipeIngredients) {
        currentRecipeIngredients.forEach(item => {
            const ing = allIngredients.find(i => i.id === item.ingredientId);
            if (ing) {
                const qty = parseFloat(item.quantity) || 0;
                totalCost += (ing.cost * qty);
            }
        });
    }

    // Update DOM
    const costEl = document.getElementById('recipeTotalCost');
    const profitEl = document.getElementById('recipeProfit');
    const priceInput = document.getElementById('productPrice');

    if (costEl) costEl.textContent = formatCurrency(totalCost);

    if (profitEl && priceInput) {
        const sellingPrice = parseFloat(priceInput.value) || 0;
        const profit = sellingPrice - totalCost;

        profitEl.textContent = formatCurrency(profit);
        profitEl.style.color = profit > 0 ? '#166534' : (profit < 0 ? '#dc2626' : '#ca8a04');
    }

    // Attach listener if not already attached (one-time setup per modal open effectively)
    const pInput = document.getElementById('productPrice');
    if (pInput && !pInput.dataset.recipeListener) {
        pInput.addEventListener('input', updateRecipeTotals);
        pInput.dataset.recipeListener = 'true';
    }
}

