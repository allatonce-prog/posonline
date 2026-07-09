// Cashier functionality
let products = [];
let cart = [];
let modifiers = []; // Global modifiers list
let categories = new Set(['all']);
let currentEditingCartItemIndex = null; // Track which item is being modified
let currentOrderType = 'dinein'; // 'dinein' or 'takeout' — controls whether takeoutOnly ingredients are deducted

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!auth.requireAuth()) return;

    // Display user name and store name
    const user = auth.getCurrentUser();
    const cashierNameElement = document.getElementById('cashierName');
    const storeNameElement = document.getElementById('cashierStoreName');

    // Set cashier name with fallback
    if (cashierNameElement) {
        cashierNameElement.textContent = user?.name || user?.username || 'Cashier';
    }

    // Initialize database first
    showLoading('Loading...');
    try {
        await db.init();

        // Fetch and display store name from Firebase based on storeId
        if (storeNameElement && user?.storeId) {
            try {
                const store = await db.get('stores', user.storeId);
                if (store && store.name) {
                    storeNameElement.textContent = `📍 ${store.name}`;
                    storeNameElement.style.display = 'block';

                    // Update session with store name for future use
                    user.storeName = store.name;
                    auth.saveSession(user);
                } else {
                    storeNameElement.style.display = 'none';
                }
            } catch (error) {
                console.warn('Could not fetch store name:', error);
                storeNameElement.style.display = 'none';
            }
        } else {
            if (storeNameElement) {
                storeNameElement.style.display = 'none';
            }
        }

        // Load products
        showLoading('Loading products...');
        await loadProducts();
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error loading products: ' + error.message, 'error');
    }

    // Setup event listeners
    setupEventListeners();

    // Setup mobile cart toggle
    setupMobileCart();

    // Initialize grid layout from storage
    const savedLayout = JSON.parse(localStorage.getItem('cashierGridLayout') || '{"cols": "auto-fill", "minWidth": "150px"}');
    updateGridLayout(savedLayout.cols, savedLayout.minWidth, false);

    // Initialize held orders counter
    updateHeldOrdersCount();
});

// ---------------------------------------------------------
// Grid Layout Switcher
// ---------------------------------------------------------
window.updateGridLayout = function (cols, minWidth, save = true) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    // Smooth transition using View Transitions API if available
    if (document.startViewTransition) {
        document.startViewTransition(() => {
            applyGridSettings(grid, cols, minWidth, save);
        });
    } else {
        // Fallback for older browsers
        applyGridSettings(grid, cols, minWidth, save);
    }
};

function applyGridSettings(grid, cols, minWidth, save) {
    // Apply CSS variables
    grid.style.setProperty('--grid-cols', cols);
    grid.style.setProperty('--grid-min-width', minWidth);

    // Update UI active state
    document.querySelectorAll('.grid-btn').forEach(btn => {
        const btnCols = btn.getAttribute('data-cols');

        const isStandard = (cols === 'auto-fill' || cols === 'auto') && minWidth === '180px' && btnCols === 'standard';
        const isCompact = (cols === 'auto-fill' || cols === 'auto') && minWidth === '150px' && btnCols === 'compact';
        const is3 = String(cols) === '3' && btnCols === '3';
        const is4 = String(cols) === '4' && btnCols === '4';

        btn.classList.toggle('active', isStandard || isCompact || is3 || is4);
    });

    // Save preference
    if (save) {
        localStorage.setItem('cashierGridLayout', JSON.stringify({ cols: cols, minWidth: minWidth }));
    }
}

window.toggleLayoutMenu = function (e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('layoutMenu');
    const trigger = document.querySelector('.btn-layout-trigger');
    if (!menu || !trigger) return;

    const isActive = menu.classList.contains('active');

    // Close all other menus if any
    menu.classList.toggle('active');
    trigger.classList.toggle('active');
};

// Close layout menu on outside click
document.addEventListener('click', (e) => {
    const menu = document.getElementById('layoutMenu');
    const trigger = document.querySelector('.btn-layout-trigger');
    if (menu && menu.classList.contains('active') && !menu.contains(e.target) && !trigger.contains(e.target)) {
        menu.classList.remove('active');
        trigger.classList.remove('active');
    }
});

// ---------------------------------------------------------
// Order Type Toggle (Dine-in / Take-out)
// ---------------------------------------------------------
window.setOrderType = function (type) {
    currentOrderType = type;
    const dineBtn    = document.getElementById('btnDineIn');
    const takeoutBtn = document.getElementById('btnTakeOut');
    if (!dineBtn || !takeoutBtn) return;

    const activeStyle   = 'flex:1; padding:0.45rem 0.5rem; border-radius:8px; border:none; font-size:0.82rem; font-weight:700; cursor:pointer; transition:all 0.2s; box-shadow:0 1px 4px rgba(0,0,0,0.12);';
    const inactiveStyle = 'flex:1; padding:0.45rem 0.5rem; border-radius:8px; border:none; font-size:0.82rem; font-weight:700; cursor:pointer; transition:all 0.2s; background:transparent; color:var(--gray-500);';

    if (type === 'dinein') {
        dineBtn.style.cssText    = activeStyle + ' background:var(--primary); color:white;';
        takeoutBtn.style.cssText = inactiveStyle;
    } else {
        takeoutBtn.style.cssText = activeStyle + ' background:#0891b2; color:white;';
        dineBtn.style.cssText    = inactiveStyle;
    }
};

// ---------------------------------------------------------
// Hold / Park Order Functionality
// ---------------------------------------------------------
let heldOrders = JSON.parse(localStorage.getItem('heldOrders') || '[]');

function holdOrder() {
    if (cart.length === 0) {
        showToast('Cart is empty', 'warning');
        return;
    }

    const orderName = prompt('Enter a name/reference for this held order:', 'Customer ' + (heldOrders.length + 1));
    if (orderName === null) return; // Cancelled

    const order = {
        id: Date.now().toString(),
        name: orderName || 'Unnamed Order',
        items: [...cart],
        date: new Date().toISOString(),
        total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    };

    heldOrders.push(order);
    localStorage.setItem('heldOrders', JSON.stringify(heldOrders));

    cart = [];
    updateCart();
    updateHeldOrdersCount();
    showToast('Order held successfully', 'success');
}

function updateHeldOrdersCount() {
    const countSpan = document.getElementById('heldOrdersCount');
    if (!countSpan) return;

    const count = heldOrders.length;
    countSpan.textContent = count;
    countSpan.style.display = count > 0 ? 'inline-flex' : 'none';
}

window.showHeldOrders = function () {
    const modal = document.getElementById('heldOrdersModal');
    const list = document.getElementById('heldOrdersList');

    if (heldOrders.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 2rem;">📂</div>
                <p>No held orders</p>
            </div>`;
    } else {
        list.innerHTML = heldOrders.map(order => `
            <div class="held-order-card" style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${escapeHtml(order.name)}</strong>
                    <div style="font-size: 0.85rem; color: #666;">
                        ${new Date(order.date).toLocaleTimeString()} • ${order.items.length} items • ${formatCurrency(order.total)}
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteHeldOrder('${order.id}')">🗑️</button>
                    <button class="btn btn-sm btn-primary" onclick="restoreHeldOrder('${order.id}')">Restore</button>
                </div>
            </div>
        `).join('');
    }

    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

window.closeHeldOrdersModal = function () {
    document.getElementById('heldOrdersModal').classList.remove('active');
    document.body.classList.remove('modal-open');
}

window.restoreHeldOrder = function (id) {
    const index = heldOrders.findIndex(o => o.id === id);
    if (index === -1) return;

    if (cart.length > 0) {
        if (!confirm('Current cart is not empty. Overwrite it with held order?')) return;
    }

    cart = [...heldOrders[index].items];
    heldOrders.splice(index, 1);
    localStorage.setItem('heldOrders', JSON.stringify(heldOrders));

    updateCart();
    updateHeldOrdersCount();
    closeHeldOrdersModal();
    showToast('Order restored', 'success');
}

window.deleteHeldOrder = function (id) {
    if (!confirm('Delete this held order permanently?')) return;

    heldOrders = heldOrders.filter(o => o.id !== id);
    localStorage.setItem('heldOrders', JSON.stringify(heldOrders));

    showHeldOrders(); // Refresh list
    updateHeldOrdersCount();
    showToast('Held order deleted', 'info');
}

// Load products types with recipe support
async function loadProducts() {
    // Fetch all necessary data
    const [allProducts, allRecipes, allIngredients, allModifiers] = await Promise.all([
        db.getAll('products'),
        db.getAll('recipes'),
        db.getAll('ingredients'),
        db.getAll('modifiers')
    ]);

    modifiers = allModifiers || [];
    console.log('Loaded modifiers:', modifiers.length);

    // Recipe-based auto-calculation has been removed per request.
    // We now just use the base product stock or availability mode logic.
    products = allProducts;
    
    // Pre-calculate search tags for high-speed query execution
    products.forEach(product => {
        product._searchTag = `${product.name.toLowerCase()} ${product.sku ? product.sku.toLowerCase() : ''} ${product.category ? product.category.toLowerCase() : ''}`;
    });

    // Extract categories
    categories = new Set(['all']);
    products.forEach(product => {
        if (product.category) {
            categories.add(product.category);
        }
    });

    renderCategoryFilters();
    renderProducts(products);
}

// Helper — is a product currently orderable?
function isProductAvailable(product) {
    if (product.stockMode === 'availability') {
        return product.isAvailable !== false; // true by default
    }
    return product.stock > 0; // stock-based
}

// Render category filters
function renderCategoryFilters() {
    const filterContainer = document.getElementById('categoryFilter');
    if (!filterContainer) return;
    filterContainer.innerHTML = '';

    const fragment = document.createDocumentFragment();
    categories.forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn' + (category === 'all' ? ' active' : '');
        btn.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        btn.dataset.category = category;
        btn.addEventListener('click', () => filterByCategory(category));
        fragment.appendChild(btn);
    });
    filterContainer.appendChild(fragment);
}

// Filter by category
function filterByCategory(category) {
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });

    // Filter products
    const filtered = category === 'all'
        ? products
        : products.filter(p => p.category === category);

    renderProducts(filtered);
}

// Render products
function renderProducts(productsToRender) {
    const grid = document.getElementById('productsGrid');
    const emptyState = document.getElementById('emptyState');
    if (!grid) return;

    if (productsToRender.length === 0) {
        grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    const lowStockThreshold = getLowStockThreshold();

    const html = productsToRender.map(product => {
        const available = isProductAvailable(product);

        // Stock label
        let stockText, stockClass;
        if (product.stockMode === 'availability') {
            stockText = available ? 'Available' : 'Not Available';
            stockClass = available ? '' : 'low';
        } else {
            stockClass = product.stock <= lowStockThreshold ? 'low' : '';
            stockText = product.stock > 0 ? `${product.stock} in stock` : 'Out of stock';
        }

        const opacityStyle = available ? '' : 'style="opacity: 0.5; cursor: not-allowed;"';

        return `
        <div class="product-card" data-product-id="${product.id}" ${opacityStyle}>
          <div class="product-image">
            ${product.image ? `<img src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy">` : '📦'}
          </div>
          <div class="product-info">
            <div class="product-name">${escapeHtml(product.name)}</div>
            <div class="product-category">${escapeHtml(product.category || 'Uncategorized')}</div>
            <div class="product-price">${formatCurrency(product.price)}</div>
            <div class="product-stock ${stockClass}">${stockText}</div>
          </div>
        </div>
        `;
    }).join('');

    grid.innerHTML = html;
}

// Add to cart
function addToCart(product) {
    if (!isProductAvailable(product)) {
        showToast(
            product.stockMode === 'availability' ? 'Item is not available' : 'Product out of stock',
            'warning'
        );
        return;
    }

    // Check if product already in cart
    const existingItem = cart.find(item => item.id === product.id);

    if (existingItem) {
        // For stock-based items cap at available stock; availability-based items have no cap
        if (product.stockMode !== 'availability' && existingItem.quantity >= product.stock) {
            showToast('Cannot add more than available stock', 'warning');
            return;
        }
        existingItem.quantity++;
    } else {
        cart.push({
            ...product,
            quantity: 1,
            modifiers: [] // Initialize empty modifiers
        });
    }

    updateCart();
    showToast(`${product.name} added to cart`, 'success');
}

// Update cart quantity
function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;

    const newQuantity = item.quantity + change;

    if (newQuantity <= 0) {
        removeFromCart(productId);
        return;
    }

    // Only cap by stock for stock-based items
    if (item.stockMode !== 'availability' && newQuantity > item.stock) {
        showToast('Cannot exceed available stock', 'warning');
        return;
    }

    item.quantity = newQuantity;
    updateCart();
}

// Set quantity directly
function setQuantity(productId, quantity) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;

    const qty = parseInt(quantity);

    if (isNaN(qty) || qty <= 0) {
        removeFromCart(productId);
        return;
    }

    // Only cap by stock for stock-based items
    if (item.stockMode !== 'availability' && qty > item.stock) {
        showToast('Cannot exceed available stock', 'warning');
        item.quantity = item.stock;
    } else {
        item.quantity = qty;
    }

    updateCart();
}

// Remove from cart
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCart();
    showToast('Item removed from cart', 'info');
}

// Clear cart
function clearCart() {
    if (cart.length === 0) return;

    if (confirmDialog('Clear all items from cart?')) {
        cart = [];
        updateCart();
        showToast('Cart cleared', 'info');
    }
}

// Update cart display
function updateCart() {
    const cartItemsContainer = document.getElementById('cartItems');
    const cartCount = document.getElementById('cartCount');

    // Update count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;

    // Render cart items
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p>Your cart is empty</p>
      </div>
    `;
    } else {
        cartItemsContainer.innerHTML = cart.map((item, index) => `
      <div class="cart-item-wrapper" data-product-id="${item.id}">
        <div class="cart-item-delete-bg">
          <i class="ph ph-trash"></i>
          <span>Delete</span>
        </div>
        <div class="cart-item" data-product-id="${item.id}">
          <div class="cart-item-image">
            ${item.image ? `<img src="${item.image}" alt="${item.name}">` : '📦'}
          </div>
          <div class="cart-item-info">
              <div class="cart-item-name">
                  ${escapeHtml(item.name)}
                  ${item.modifiers && item.modifiers.length > 0 ?
                `<div class="cart-item-modifiers" style="font-size: 0.75rem; color: var(--primary); margin-top: 2px;">
                          ${item.modifiers.map(m => `+ ${m.name} ${m.quantity > 1 ? `(x${m.quantity})` : ''}`).join(', ')}
                      </div>`
                : ''}
              </div>
              <div class="cart-item-price">
                ${formatCurrency((item.price + (item.modifiers ? item.modifiers.reduce((sum, m) => sum + (m.price * (m.quantity || 1)), 0) : 0)))} × ${item.quantity}
                 
                 <div style="display: inline-flex; gap: 4px; margin-left: 8px;">
                    ${item.alternativePrices && item.alternativePrices.length > 0 ?
                `<button class="btn btn-sm btn-outline-primary" style="padding: 2px 8px; font-size: 0.9rem;" onclick="event.stopPropagation(); showPriceSelector('${item.id}')" title="Change Price">🏷️</button>`
                : ''}
                    <button class="btn btn-sm btn-outline-secondary" style="padding: 2px 8px; font-size: 0.9rem;" onclick="event.stopPropagation(); showModifiersModal('${item.id}', ${index})" title="Add Modifiers">📝</button>
                 </div>
              </div>
            <div class="cart-item-controls">
              <button class="qty-btn" onclick="event.stopPropagation(); updateQuantity('${item.id}', -1)">−</button>
              <input 
                type="number" 
                class="qty-input" 
                value="${item.quantity}"
                min="1"
                max="${item.stock}"
                onclick="event.stopPropagation()"
                onchange="setQuantity('${item.id}', this.value)"
              >
              <button class="qty-btn" onclick="event.stopPropagation(); updateQuantity('${item.id}', 1)">+</button>
            </div>
          </div>
          <button class="cart-item-remove" onclick="event.stopPropagation(); removeFromCart('${item.id}')">×</button>
        </div>
      </div>
    `).join('');

        // Initialize swipe functionality for each cart item
        initializeSwipeToDelete();
    }

    // Update totals (include modifiers)
    const subtotal = cart.reduce((sum, item) => {
        const itemPrice = item.price;
        const modifiersPrice = item.modifiers ? item.modifiers.reduce((mSum, m) => mSum + (m.price * (m.quantity || 1)), 0) : 0;
        return sum + ((itemPrice + modifiersPrice) * item.quantity);
    }, 0);
    const tax = 0; // Tax removed
    const total = subtotal + tax;

    document.getElementById('subtotal').textContent = formatCurrency(subtotal);
    // document.getElementById('tax').textContent = formatCurrency(tax); // Tax display removed
    document.getElementById('total').textContent = formatCurrency(total);

    // Update Mobile Cart Bar
    const mobileCartCount = document.getElementById('mobileCartCount');
    const mobileTotal = document.getElementById('mobileTotal');
    if (mobileCartCount && mobileTotal) {
        mobileCartCount.textContent = totalItems;
        mobileTotal.textContent = formatCurrency(total);

        // Ensure bar is always visible on mobile
        const mobileBar = document.getElementById('mobileCartBar');
        if (mobileBar) {
            mobileBar.classList.add('visible');

            // Only bump animation on change
            if (totalItems > 0) {
                mobileBar.classList.add('bump');
                setTimeout(() => mobileBar.classList.remove('bump'), 300);
            }
        }
    }
}

// Initialize swipe-to-delete for cart items
function initializeSwipeToDelete() {
    const cartItems = document.querySelectorAll('.cart-item');

    cartItems.forEach(item => {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        let startTime = 0;
        const wrapper = item.closest('.cart-item-wrapper');

        // Touch start
        item.addEventListener('touchstart', (e) => {
            // Ignore if touching interactive elements
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.qty-btn')) return;

            startX = e.touches[0].clientX;
            startTime = Date.now();
            isDragging = true;
            item.style.transition = 'none';
        }, { passive: true });

        // Touch move
        item.addEventListener('touchmove', (e) => {
            if (!isDragging) return;

            currentX = e.touches[0].clientX;
            const diff = currentX - startX;

            // Only allow left swipe (negative diff)
            if (diff < 0) {
                const translateX = Math.max(diff, -100); // Max swipe distance
                item.style.transform = `translateX(${translateX}px)`;

                // Show delete background
                wrapper.classList.add('swiping');
            }
        }, { passive: true });

        // Touch end
        item.addEventListener('touchend', (e) => {
            if (!isDragging) return;

            isDragging = false;
            const diff = currentX - startX;
            const swipeTime = Date.now() - startTime;
            const swipeSpeed = Math.abs(diff) / swipeTime;

            item.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

            // Fast swipe or full swipe = delete
            if (diff < -80 || swipeSpeed > 0.5) {
                // Full swipe - delete with animation
                item.style.transform = 'translateX(-120%)';
                wrapper.classList.add('deleting');

                setTimeout(() => {
                    const productId = item.dataset.productId;
                    removeFromCartWithUndo(productId);
                }, 300);
            } else if (diff < -30) {
                // Partial swipe - show delete button
                item.style.transform = 'translateX(-80px)';
                wrapper.classList.add('revealed');

                // Add click handler to delete background
                const deleteBg = wrapper.querySelector('.cart-item-delete-bg');
                deleteBg.onclick = () => {
                    item.style.transform = 'translateX(-120%)';
                    wrapper.classList.add('deleting');

                    setTimeout(() => {
                        const productId = item.dataset.productId;
                        removeFromCartWithUndo(productId);
                    }, 300);
                };
            } else {
                // Snap back
                item.style.transform = 'translateX(0)';
                wrapper.classList.remove('swiping', 'revealed');
            }

            startX = 0;
            currentX = 0;
        });

        // Mouse events for desktop testing
        item.addEventListener('mousedown', (e) => {
            // Ignore if clicking interactive elements
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.qty-btn')) return;

            startX = e.clientX;
            startTime = Date.now();
            isDragging = true;
            item.style.transition = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            currentX = e.clientX;
            const diff = currentX - startX;

            if (diff < 0) {
                const translateX = Math.max(diff, -100);
                item.style.transform = `translateX(${translateX}px)`;
                wrapper.classList.add('swiping');
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;

            isDragging = false;
            const diff = currentX - startX;
            const swipeTime = Date.now() - startTime;
            const swipeSpeed = Math.abs(diff) / swipeTime;

            item.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

            if (diff < -80 || swipeSpeed > 0.5) {
                item.style.transform = 'translateX(-120%)';
                wrapper.classList.add('deleting');

                setTimeout(() => {
                    const productId = item.dataset.productId;
                    removeFromCartWithUndo(productId);
                }, 300);
            } else if (diff < -30) {
                item.style.transform = 'translateX(-80px)';
                wrapper.classList.add('revealed');

                const deleteBg = wrapper.querySelector('.cart-item-delete-bg');
                deleteBg.onclick = () => {
                    item.style.transform = 'translateX(-120%)';
                    wrapper.classList.add('deleting');

                    setTimeout(() => {
                        const productId = item.dataset.productId;
                        removeFromCartWithUndo(productId);
                    }, 300);
                };
            } else {
                item.style.transform = 'translateX(0)';
                wrapper.classList.remove('swiping', 'revealed');
            }

            startX = 0;
            currentX = 0;
        });
    });
}

// Remove from cart with undo option
let lastRemovedItem = null;
function removeFromCartWithUndo(productId) {
    const itemIndex = cart.findIndex(item => item.id === productId);
    if (itemIndex === -1) return;

    // Just remove from cart - no notification
    cart.splice(itemIndex, 1);
    updateCart();
}

// Checkout
function checkout() {
    if (cart.length === 0) {
        showToast('Cart is empty', 'warning');
        return;
    }

    // Show checkout modal
    const modal = document.getElementById('checkoutModal');
    modal.classList.add('active');
    document.body.classList.add('modal-open');

    // Set total
    const total = parseFloat(document.getElementById('total').textContent.replace(/[₱,]/g, ''));
    document.getElementById('checkoutTotal').textContent = formatCurrency(total);

    // Reset form to single payment mode
    document.getElementById('paymentMethod').value = 'cash';
    document.getElementById('customerName').value = '';
    document.getElementById('amountReceived').value = '';
    document.getElementById('change').textContent = formatCurrency(0);
    document.getElementById('splitCashAmount').value = '';
    document.getElementById('splitGcashAmount').value = '';

    // Always start in single mode
    setPaymentMode('single');
}

// Close checkout modal
function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
}

// ─── Payment Mode Management ──────────────────────────────────────────────────

// Set payment mode: 'single' or 'split'
function setPaymentMode(mode) {
    const isSplit = mode === 'split';

    // Toggle sections
    document.getElementById('singlePaymentSection').style.display = isSplit ? 'none' : 'block';
    document.getElementById('splitPaymentSection').style.display = isSplit ? 'block' : 'none';

    // Update toggle button styles
    const singleBtn = document.getElementById('modeBtnSingle');
    const splitBtn  = document.getElementById('modeBtnSplit');

    if (isSplit) {
        singleBtn.style.cssText = 'flex: 1; padding: 0.6rem; border-radius: 10px; border: 2px solid var(--gray-300); background: transparent; color: var(--gray-600); font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.2s;';
        splitBtn.style.cssText  = 'flex: 1; padding: 0.6rem; border-radius: 10px; border: 2px solid var(--primary); background: var(--primary); color: white; font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.2s;';
        updateSplitPayment();
    } else {
        singleBtn.style.cssText = 'flex: 1; padding: 0.6rem; border-radius: 10px; border: 2px solid var(--primary); background: var(--primary); color: white; font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.2s;';
        splitBtn.style.cssText  = 'flex: 1; padding: 0.6rem; border-radius: 10px; border: 2px solid var(--gray-300); background: transparent; color: var(--gray-600); font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.2s;';
        toggleCashPayment();
    }
}

// Toggle cash amount field visibility (single mode only)
function toggleCashPayment() {
    const paymentMethod = document.getElementById('paymentMethod').value;
    const cashGroup = document.getElementById('cashPaymentGroup');
    cashGroup.style.display = paymentMethod === 'cash' ? 'block' : 'none';
}

// Calculate change (single cash mode)
function calculateChange() {
    const total    = parseFloat(document.getElementById('total').textContent.replace(/[₱,]/g, ''));
    const received = parseFloat(document.getElementById('amountReceived').value) || 0;
    const change   = received - total;

    document.getElementById('change').textContent = formatCurrency(Math.max(0, change));
    document.getElementById('change').style.color = change >= 0 ? 'var(--success)' : 'var(--danger)';
}

// Update split payment summary
function updateSplitPayment() {
    const total     = parseFloat(document.getElementById('total').textContent.replace(/[₱,]/g, ''));
    const cashAmt   = parseFloat(document.getElementById('splitCashAmount').value)  || 0;
    const gcashAmt  = parseFloat(document.getElementById('splitGcashAmount').value) || 0;
    const covered   = cashAmt + gcashAmt;
    const remaining = total - covered;
    const change    = covered - total; // change comes from cash portion

    // Update displayed values
    document.getElementById('splitTotalCovered').textContent = formatCurrency(covered);
    document.getElementById('splitRemaining').textContent    = formatCurrency(Math.max(0, remaining));
    document.getElementById('splitChange').textContent       = formatCurrency(Math.max(0, change));

    // Status message
    const statusEl = document.getElementById('splitStatusMsg');
    const btn      = document.getElementById('completeSaleBtn');

    if (covered === 0) {
        statusEl.style.display = 'none';
        btn.disabled = false;
    } else if (remaining > 0.009) {
        statusEl.style.display  = 'block';
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.color      = 'var(--danger)';
        statusEl.textContent      = `⚠️ Still need ${formatCurrency(remaining)} more`;
        btn.disabled = true;
    } else {
        statusEl.style.display  = 'block';
        statusEl.style.background = 'rgba(16,185,129,0.1)';
        statusEl.style.color      = '#059669';
        statusEl.textContent      = '✅ Payment complete!';
        btn.disabled = false;
    }
}

// Complete transaction
async function completeTransaction() {
    const customerName  = document.getElementById('customerName').value.trim();
    const total         = parseFloat(document.getElementById('total').textContent.replace(/[₱,]/g, ''));
    const isSplitMode   = document.getElementById('splitPaymentSection').style.display !== 'none';

    // ── Determine payment info ──
    let paymentMethod, amountPaid, change, cashAmount, gcashAmount;

    if (isSplitMode) {
        cashAmount  = parseFloat(document.getElementById('splitCashAmount').value)  || 0;
        gcashAmount = parseFloat(document.getElementById('splitGcashAmount').value) || 0;
        amountPaid  = cashAmount + gcashAmount;

        if (amountPaid < total - 0.009) {
            showToast('Split payment does not cover the total', 'error');
            return;
        }

        paymentMethod = 'split';
        change        = Math.max(0, amountPaid - total);
    } else {
        paymentMethod = document.getElementById('paymentMethod').value;

        if (paymentMethod === 'cash') {
            amountPaid = parseFloat(document.getElementById('amountReceived').value) || 0;
            if (amountPaid < total) {
                showToast('Insufficient amount received', 'error');
                return;
            }
            change = amountPaid - total;
        } else {
            amountPaid = total;
            change     = 0;
        }
    }

    showLoading('Processing transaction...');

    try {
        // ── Build transaction object ──
        const transaction = {
            date:         new Date().toISOString(),
            cashier:      auth.getCurrentUser().username,
            cashierName:  auth.getCurrentUser().name || auth.getCurrentUser().username,
            orderType:    currentOrderType, // 'dinein' or 'takeout'
            items: cart.map(item => ({
                productId: item.id,
                name:      item.name,
                price:     item.price,
                quantity:  item.quantity,
                modifiers: item.modifiers || [],
                subtotal:  (item.price + (item.modifiers ? item.modifiers.reduce((s, m) => s + (m.price * (m.quantity || 1)), 0) : 0)) * item.quantity
            })),
            subtotal:      parseFloat(document.getElementById('subtotal').textContent.replace(/[₱,]/g, '')),
            tax:           0,
            total:         total,
            amountPaid:    amountPaid,
            change:        change,
            paymentMethod: paymentMethod,
            customerName:  customerName || 'Walk-in Customer',
            ...(isSplitMode && { cashAmount, gcashAmount })
        };

        // Capture cart copy and order details for background non-blocking execution
        const cartCopy = [...cart];
        const orderTypeCopy = currentOrderType;

        // Clear UI instantly
        hideLoading();
        closeCheckoutModal();

        // Clear cart and reload products UI immediately
        cart = [];
        updateCart();
        if (typeof loadProducts === 'function') {
            loadProducts();
        }

        // Reset order type to Dine-in for the next transaction
        setOrderType('dinein');
        showToast('Transaction completed successfully!', 'success');

        // Execute DB updates, stock deductions, and notifications asynchronously in the background
        (async () => {
            try {
                // 1. Save transaction in IndexedDB & Cloud
                const transactionId = await db.add('transactions', transaction);

                // 2. Send notification to Admin
                db.notify(
                    'sale',
                    'New Sale Completed',
                    `${transaction.cashierName} completed a sale of ${formatCurrency(transaction.total)}`,
                    { transactionId: transactionId, total: transaction.total }
                );

                // 3. Pre-fetch recipes and ingredients if any product has a recipe
                const productsWithRecipe = cartCopy.filter(item => item.hasRecipe || (products.find(p => p.id === item.id) || {}).hasRecipe);
                const hasModifiersWithIngredients = cartCopy.some(item => item.modifiers && item.modifiers.some(m => m.ingredientId));

                let allRecipes = [];
                let allIngredients = [];

                if (productsWithRecipe.length > 0 || hasModifiersWithIngredients) {
                    const promises = [db.getAll('ingredients')];
                    if (productsWithRecipe.length > 0) {
                        promises.push(db.getAll('recipes'));
                    }

                    const results = await Promise.all(promises);
                    allIngredients = results[0];
                    if (productsWithRecipe.length > 0) {
                        allRecipes = results[1];
                    }
                }

                // 4. Update product stock and record movements
                for (const item of cartCopy) {
                    const product = await db.get('products', item.id);
                    if (!product) continue;

                    const stockBefore = product.stock;

                    // CHECK RECIPE LOGIC
                    const recipe = product.hasRecipe ? allRecipes.find(r => r.productId === product.id) : null;

                    if (recipe) {
                        // Deduct Ingredients — skip takeoutOnly ingredients when order is dine-in
                        for (const ingItem of recipe.ingredients) {
                            if (ingItem.takeoutOnly === true && orderTypeCopy === 'dinein') {
                                continue;
                            }

                            const ingredient = allIngredients.find(i => i.id === ingItem.ingredientId);
                            if (ingredient) {
                                const qtyToDeduct = (parseFloat(ingItem.quantity) || 0) * item.quantity;
                                const ingStockBefore = ingredient.stock;

                                ingredient.stock = Math.max(0, ingredient.stock - qtyToDeduct);
                                await db.update('ingredients', ingredient);

                                await db.add('stockMovements', {
                                    productId: item.id,
                                    ingredientId: ingredient.id,
                                    type: 'out',
                                    quantity: qtyToDeduct,
                                    reason: `Ingredient Used (${orderTypeCopy === 'takeout' ? 'Take-out' : 'Dine-in'}) - Sale ${formatTransactionId(transactionId)}`,
                                    date: new Date().toISOString(),
                                    user: auth.getCurrentUser().username,
                                    stockBefore: ingStockBefore,
                                    stockAfter: ingredient.stock,
                                    unitPrice: ingredient.cost
                                });
                            }
                        }
                    } else {
                        // NORMAL PRODUCT DEDUCTION (Skip for availability-mode products)
                        if (product.stockMode !== 'availability') {
                            product.stock = Math.max(0, product.stock - item.quantity);
                            await db.update('products', product);

                            await db.add('stockMovements', {
                                productId: item.id,
                                type: 'out',
                                quantity: item.quantity,
                                reason: `Sale - Transaction ${formatTransactionId(transactionId)}`,
                                date: new Date().toISOString(),
                                user: auth.getCurrentUser().username,
                                stockBefore: stockBefore,
                                stockAfter: product.stock,
                                unitPrice: item.price
                            });
                        }
                    }

                    // DEDUCT MODIFIER INGREDIENTS
                    if (item.modifiers && item.modifiers.length > 0) {
                        for (const mod of item.modifiers) {
                            if (mod.ingredientId) {
                                let ingredient = allIngredients.find(i => i.id === mod.ingredientId);
                                if (!ingredient) {
                                    ingredient = await db.get('ingredients', mod.ingredientId);
                                }

                                if (ingredient) {
                                    const modQty = mod.quantity || 1;
                                    const qtyToDeduct = item.quantity * modQty;
                                    const ingStockBefore = ingredient.stock;

                                    ingredient.stock = Math.max(0, ingredient.stock - qtyToDeduct);
                                    await db.update('ingredients', ingredient);

                                    await db.add('stockMovements', {
                                        productId: item.id,
                                        modifierName: mod.name,
                                        ingredientId: ingredient.id,
                                        type: 'out',
                                        quantity: qtyToDeduct,
                                        reason: `Modifier Used - Sale ${formatTransactionId(transactionId)}`,
                                        date: new Date().toISOString(),
                                        user: auth.getCurrentUser().username,
                                        stockBefore: ingStockBefore,
                                        stockAfter: ingredient.stock,
                                        unitPrice: ingredient.cost || 0
                                    });
                                }
                            }
                        }
                    }
                }

                // 5. Check for low stock and notify
                for (const item of cartCopy) {
                    const product = await db.get('products', item.id);
                    if (!product) continue;

                    const settings = typeof getSettings === 'function' ? getSettings() : { lowStockThreshold: 10 };
                    if (product.stock <= (settings.lowStockThreshold || 10)) {
                        db.notify(
                            'low_stock',
                            'Low Stock Alert',
                            `${product.name} is running low on stock (${product.stock} left)`,
                            { productId: product.id, currentStock: product.stock }
                        );
                    }
                }

                // 6. Reload products UI to show fresh stock levels in the background
                if (typeof loadProducts === 'function') {
                    loadProducts();
                }

            } catch (bgError) {
                console.error("Background transaction processing failed:", bgError);
            }
        })();

    } catch (error) {
        hideLoading();
        showToast('Error completing transaction: ' + error.message, 'error');
    }
}

// Print receipt
function printTransactionReceipt(transaction, transactionId) {
    const settings = typeof getSettings === 'function' ? getSettings() : { systemName: 'POS System', systemDescription: 'Point of Sale Receipt' };

    // Build payment lines for receipt
    let paymentLines = '';
    if (transaction.paymentMethod === 'split') {
        paymentLines = `
    <div class="receipt-item">
      <span>Payment:</span>
      <span>SPLIT</span>
    </div>
    <div class="receipt-item" style="font-size: 11px; padding-left: 12px;">
      <span>💵 Cash:</span>
      <span>${formatCurrency(transaction.cashAmount || 0)}</span>
    </div>
    <div class="receipt-item" style="font-size: 11px; padding-left: 12px;">
      <span>📱 GCash:</span>
      <span>${formatCurrency(transaction.gcashAmount || 0)}</span>
    </div>
    <div class="receipt-item">
      <span>Change:</span>
      <span>${formatCurrency(transaction.change || 0)}</span>
    </div>`;
    } else if (transaction.paymentMethod === 'cash') {
        paymentLines = `
    <div class="receipt-item">
      <span>Payment:</span>
      <span>CASH</span>
    </div>
    <div class="receipt-item">
      <span>Amount Paid:</span>
      <span>${formatCurrency(transaction.amountPaid || transaction.total)}</span>
    </div>
    <div class="receipt-item">
      <span>Change:</span>
      <span>${formatCurrency(transaction.change || 0)}</span>
    </div>`;
    } else {
        paymentLines = `
    <div class="receipt-item">
      <span>Payment:</span>
      <span>${transaction.paymentMethod.toUpperCase()}</span>
    </div>`;
    }

    const receiptHtml = `
    <div class="receipt-header">
      <h2>${settings.systemName}</h2>
      <p>${settings.systemDescription}</p>
    </div>
    <div class="receipt-info">
      <p><strong>Transaction #:</strong> ${formatTransactionId(transactionId)}</p>
      <p><strong>Date:</strong> ${formatDateTime(transaction.date)}</p>
      <p><strong>Cashier:</strong> ${transaction.cashier}</p>
      <p><strong>Customer:</strong> ${transaction.customerName}</p>
    </div>
    <div class="receipt-items">
      ${transaction.items.map(item => `
        <div class="receipt-item">
          <div>
            <div>${item.name}</div>
            <div style="font-size: 11px; color: #666;">${item.quantity} × ${formatCurrency(item.price)}</div>
          </div>
          <div>${formatCurrency(item.subtotal)}</div>
        </div>
      `).join('')}
    </div>
    <div class="receipt-item">
      <span>Subtotal:</span>
      <span>${formatCurrency(transaction.subtotal)}</span>
    </div>
    <div class="receipt-item receipt-total">
      <span>TOTAL:</span>
      <span>${formatCurrency(transaction.total)}</span>
    </div>
    ${paymentLines}
    <div class="receipt-footer">
      <p>Thank you for your purchase!</p>
      <p>Please come again</p>
    </div>
  `;

    printReceipt(receiptHtml);
}

// Setup event listeners
function setupEventListeners() {
    // Real-time search - instant filtering on every keystroke
    const searchInput = document.getElementById('searchInput');
    
    // Snappy visual feedback, debounced rendering
    const debouncedSearch = debounce((query) => {
        if (!query) {
            const activeFilter = document.querySelector('.filter-btn.active');
            const category = activeFilter ? activeFilter.dataset.category : 'all';
            filterByCategory(category);
            return;
        }

        const filtered = products.filter(product =>
            product._searchTag && product._searchTag.includes(query)
        );

        renderProducts(filtered);
    }, 150);

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query) {
            searchInput.classList.add('searching');
        } else {
            searchInput.classList.remove('searching');
        }
        debouncedSearch(query);
    });

    // Event delegation for product card clicks on catalog grid container
    const grid = document.getElementById('productsGrid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;

            // Skip handling if clicked on disabling states
            if (card.style.opacity === '0.5') return;

            const productId = card.dataset.productId;
            const product = products.find(p => p.id === productId);
            if (!product) return;

            addToCart(product);
        });
    }

    // Payment method change (single mode)
    document.getElementById('paymentMethod').addEventListener('change', toggleCashPayment);

    // Amount received change (single cash mode)
    document.getElementById('amountReceived').addEventListener('input', calculateChange);

    // Close modal on outside click
    document.getElementById('checkoutModal').addEventListener('click', (e) => {
        if (e.target.id === 'checkoutModal') {
            closeCheckoutModal();
        }
    });
}

// Setup mobile cart toggle
function setupMobileCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    const cartHeader = cartSidebar.querySelector('.cart-header');

    if (cartHeader) {
        cartHeader.addEventListener('click', () => {
            cartSidebar.classList.toggle('expanded');
        });
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        // Match CSS breakpoint (900px)
        if (window.innerWidth > 900) {
            cartSidebar.classList.remove('expanded');
        }
    });

    // Close cart when clicking outside on mobile
    // Close cart when clicking outside on mobile
    document.addEventListener('click', (e) => {
        const cartSidebar = document.getElementById('cartSidebar');
        const mobileBar = document.getElementById('mobileCartBar');
        const priceModal = document.getElementById('priceSelectorModal');
        const checkoutModal = document.getElementById('checkoutModal');

        // Check if click is inside price selector or checkout modal
        if ((priceModal && priceModal.classList.contains('active') && priceModal.contains(e.target)) ||
            (checkoutModal && checkoutModal.classList.contains('active') && checkoutModal.contains(e.target))) {
            return;
        }

        if (window.innerWidth <= 900 &&
            cartSidebar.classList.contains('expanded') &&
            !cartSidebar.contains(e.target) &&
            !mobileBar.contains(e.target) &&
            (!priceModal || !priceModal.contains(e.target)) &&
            (!checkoutModal || !checkoutModal.contains(e.target))) {
            cartSidebar.classList.remove('expanded');
            document.body.style.overflow = ''; // Restore scroll
        }
    });

    // Add Close Button listener for mobile sidebar specific
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mobile-cart-close';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = toggleMobileCart;
    cartSidebar.appendChild(closeBtn);
}

// Toggle Mobile Cart
function toggleMobileCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    cartSidebar.classList.toggle('expanded');

    // Prevent body scroll when cart is open on mobile
    if (cartSidebar.classList.contains('expanded')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

// ---------------------------------------------------------
// Sales History Feature
// ---------------------------------------------------------

let allSales = [];
let currentSalesFilter = 'recent';

// Switch View (POS vs Sales)
// Switch View (POS vs Sales vs Expenses)
window.switchView = async function (view) {
    // Update Tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Find the tab that matches the view
    let tabIndex = 0;
    if (view === 'pos') tabIndex = 0;
    if (view === 'sales') tabIndex = 1;
    if (view === 'expenses') tabIndex = 2;

    // Safely add active class
    const tabs = document.querySelectorAll('.view-tab');
    if (tabs[tabIndex]) {
        tabs[tabIndex].classList.add('active');
    }

    // Hide all views first
    document.getElementById('posView').style.display = 'none';
    document.getElementById('salesView').style.display = 'none';
    document.getElementById('expensesView').style.display = 'none';
    const collectiblesView = document.getElementById('collectiblesView');
    if (collectiblesView) collectiblesView.style.display = 'none';
    const modifierStockView = document.getElementById('modifierStockView');
    if (modifierStockView) modifierStockView.style.display = 'none';
    const recipesStockView = document.getElementById('recipesView');
    if (recipesStockView) recipesStockView.style.display = 'none';

    // Sidebar visibility
    const cartSidebar = document.getElementById('cartSidebar');
    const mobileBar = document.getElementById('mobileCartBar');

    // Show selected view
    if (view === 'pos') {
        document.getElementById('posView').style.display = 'block';
        cartSidebar.style.display = 'flex';
        if (mobileBar) mobileBar.style.display = '';
    } else if (view === 'sales') {
        document.getElementById('salesView').style.display = 'block';
        cartSidebar.style.display = 'none';
        if (mobileBar) mobileBar.style.display = 'none';
        await loadSalesHistory();
    } else if (view === 'expenses') {
        document.getElementById('expensesView').style.display = 'block';
        cartSidebar.style.display = 'none';
        if (mobileBar) mobileBar.style.display = 'none';
        await loadExpenses();
    } else if (view === 'collectibles') {
        if (collectiblesView) collectiblesView.style.display = 'block';
        cartSidebar.style.display = 'none';
        if (mobileBar) mobileBar.style.display = 'none';
        // Load collectibles using the global function if available
        if (typeof loadCollectibles === 'function') {
            await loadCollectibles();
        }
    } else if (view === 'modifierStock') {
        if (modifierStockView) modifierStockView.style.display = 'block';
        cartSidebar.style.display = 'none';
        if (mobileBar) mobileBar.style.display = 'none';
        if (typeof loadCashierStockTracker === 'function') {
            await loadCashierStockTracker();
        }
    } else if (view === 'recipes') {
        if (recipesStockView) recipesStockView.style.display = 'block';
        cartSidebar.style.display = 'none';
        if (mobileBar) mobileBar.style.display = 'none';
        if (typeof loadCashierRecipes === 'function') {
            await loadCashierRecipes();
        }
    }

    // Update active sidebar item
    document.querySelectorAll('.sidebar-item[data-view]').forEach(el => {
        el.classList.toggle('active', el.dataset.view === view);
    });
}

let allExpenses = [];
let allCollectibles = [];

// Load Sales History
async function loadSalesHistory() {
    const listContainer = document.getElementById('salesList');
    listContainer.innerHTML = '<div class="loading-spinner">Loading sales history...</div>';

    try {
        const user = auth.getCurrentUser();
        if (!user) {
            throw new Error("User not authenticated");
        }

        // Fetch sales for this cashier
        // We use getAllByIndex to filter by 'cashier' == user.username
        // The DB method also enforces storeId filtering if applicable
        // Fetch sales for this cashier (FORCE cloud read for live data)
        const sales = await db.getAllByIndex('transactions', 'cashier', user.username, true);

        // Fetch expenses for this cashier (FORCE cloud read for live data)
        const expenses = await db.getAll('expenses', true);
        allExpenses = expenses.filter(exp => exp.storeId === user.storeId && exp.cashier === user.username);

        // Fetch collectibles for this cashier (FORCE cloud read for live data)
        const collectibles = await db.getAll('collectibles', true);
        allCollectibles = collectibles.filter(col => {
            const totalAmount = parseFloat(col.totalAmount) || 0;
            const paidAmount = parseFloat(col.paidAmount) || 0;
            const balance = totalAmount - paidAmount;

            // Only include collectibles with outstanding balance from this store/cashier
            return col.storeId === user.storeId &&
                col.cashier === user.username &&
                balance > 0; // Only count if there's outstanding balance
        });

        console.log('💰 Collectibles Loaded:');
        console.log('  Total from DB:', collectibles.length);
        console.log('  Filtered for cashier:', allCollectibles.length);
        console.log('  Collectibles data:', allCollectibles);

        // Sort by date descending
        allSales = sales.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Apply current filter
        filterSales(currentSalesFilter);

    } catch (error) {
        console.error('Error loading sales:', error);
        listContainer.innerHTML = `
            <div class="no-sales">
                <div class="no-sales-icon">⚠️</div>
                <h3>Error Loading Sales</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Filter Sales
window.filterSales = function (filterType) {
    currentSalesFilter = filterType;

    // Update buttons
    const buttons = document.querySelectorAll('.sales-filter-btn');
    buttons.forEach((btn, index) => {
        btn.classList.remove('active');
        if (filterType === 'recent' && index === 0) btn.classList.add('active');
        if (filterType === 'today' && index === 1) btn.classList.add('active');
        if (filterType === 'yesterday' && index === 2) btn.classList.add('active');
    });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let filteredSales = [];
    let filteredExpenses = [];
    let filteredCollectibles = [];

    if (filterType === 'recent') {
        filteredSales = allSales.slice(0, 20);
        // For recent expenses, let's just match the time window of the oldest recent sale?
        // Or just show calculate net profit for 'Today' implicitly? 
        // Typically 'Recent' view stats might just show stats for those 20 items?
        // Actually, for "Net Profit", it usually implies a time period. 
        // If "Recent", Net Profit is ambiguous. Let's assume user wants "Today's" net profit if viewing recent, OR just sum of displayed.
        // Let's go with "Today" logic for consistency if 'Recent' is default, OR just 0.
        // Better: let's filter expenses for Today when in Recent mode to give context of "Current Session", 
        // OR better yet, just sum the expense of the items retrieved? No, expenses aren't linked to sales.
        // Let's stick to: If Recent -> Show today's stats? No, that is confusing.
        // Let's make "Recent" calculate based on "Today" for stats, but show recent list.
        filteredExpenses = allExpenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate >= today;
        });
        filteredCollectibles = allCollectibles.filter(col => {
            const colDate = new Date(col.createdAt || col.date); // Use createdAt, fallback to date
            return colDate >= today;
        });

    } else if (filterType === 'today') {
        filteredSales = allSales.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= today && saleDate < new Date(today.getTime() + 86400000);
        });
        filteredExpenses = allExpenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate >= today && expDate < new Date(today.getTime() + 86400000);
        });
        filteredCollectibles = allCollectibles.filter(col => {
            const colDate = new Date(col.createdAt || col.date); // Use createdAt, fallback to date
            return colDate >= today && colDate < new Date(today.getTime() + 86400000);
        });
    } else if (filterType === 'yesterday') {
        filteredSales = allSales.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= yesterday && saleDate < today;
        });
        filteredExpenses = allExpenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate >= yesterday && expDate < today;
        });
        filteredCollectibles = allCollectibles.filter(col => {
            const colDate = new Date(col.createdAt || col.date); // Use createdAt, fallback to date
            return colDate >= yesterday && colDate < today;
        });
    }

    renderSalesList(filteredSales);
    updateSalesStats(filteredSales, filteredExpenses, filteredCollectibles);
}

// Render Sales List
function renderSalesList(sales) {
    const listContainer = document.getElementById('salesList');

    if (sales.length === 0) {
        listContainer.innerHTML = `
            <div class="no-sales">
                <div class="no-sales-icon">📜</div>
                <h3>No Sales Found</h3>
                <p>No transactions match your filter.</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = sales.map(sale => {
        const date      = new Date(sale.date);
        const timeStr   = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr   = date.toLocaleDateString();
        const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        const isVoided  = sale.status === 'voided';

        // Build payment badge(s)
        let paymentBadge = '';
        if (sale.paymentMethod === 'split') {
            paymentBadge = `
                <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
                    <span style="display: inline-flex; align-items: center; gap: 3px; background: rgba(16,185,129,0.1); color: #059669; border: 1px solid rgba(16,185,129,0.25); border-radius: 20px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700;">
                        💵 ₱${(sale.cashAmount || 0).toFixed(2)}
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 3px; background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.25); border-radius: 20px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700;">
                        📱 ₱${(sale.gcashAmount || 0).toFixed(2)}
                    </span>
                </div>`;
        } else if (sale.paymentMethod === 'cash') {
            paymentBadge = `<span style="display: inline-flex; align-items: center; gap: 3px; background: rgba(16,185,129,0.1); color: #059669; border: 1px solid rgba(16,185,129,0.25); border-radius: 20px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700;">💵 Cash</span>`;
        } else if (sale.paymentMethod === 'mobile') {
            paymentBadge = `<span style="display: inline-flex; align-items: center; gap: 3px; background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.25); border-radius: 20px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700;">📱 GCash</span>`;
        } else if (sale.paymentMethod === 'card') {
            paymentBadge = `<span style="display: inline-flex; align-items: center; gap: 3px; background: rgba(59,130,246,0.1); color: #3b82f6; border: 1px solid rgba(59,130,246,0.25); border-radius: 20px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700;">💳 Card</span>`;
        } else {
            paymentBadge = `<span style="display: inline-flex; align-items: center; gap: 3px; background: var(--light); color: var(--gray-500); border: 1px solid var(--gray-200); border-radius: 20px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700;">${sale.paymentMethod || 'Cash'}</span>`;
        }

        return `
            <div class="sale-card ${isVoided ? 'voided' : ''}" onclick="viewTransactionDetails('${sale.id}')" style="cursor: pointer; ${isVoided ? 'opacity: 0.7; background-color: #f9f9f9; border: 1px solid #ddd;' : ''}">
                <div class="sale-header">
                    <div class="sale-time">
                        ${timeStr}
                        <span class="sale-date-small">${dateStr}</span>
                    </div>
                    ${isVoided
                        ? '<div class="badge badge-danger" style="font-size: 0.75rem; padding: 2px 6px;">VOIDED</div>'
                        : `<div class="sale-amount">${formatCurrency(sale.total)}</div>`
                    }
                </div>
                ${!isVoided ? `<div style="padding: 0 0 0.4rem 0;">${paymentBadge}</div>` : ''}
                <div class="sale-footer">
                    <div class="sale-items-count" style="${isVoided ? 'text-decoration: line-through; color: #888;' : ''}">
                        <span>🛍️</span> ${itemCount} items
                    </div>
                    <div class="sale-id" style="${isVoided ? 'text-decoration: line-through; color: #888;' : ''}">#${formatTransactionId(sale.id)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Update Stats
function updateSalesStats(sales, expenses = [], collectibles = []) {
    // Filter out voided sales for total calculation
    const validSales = sales.filter(s => s.status !== 'voided');
    const totalAmount = validSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const totalCount = validSales.length;

    // Calculate expenses total
    const totalExpenses = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);

    // Calculate collectibles total (outstanding balances)
    const totalCollectibles = collectibles.reduce((sum, col) => {
        // Calculate outstanding balance for each collectible
        const totalAmount = parseFloat(col.totalAmount) || 0;
        const paidAmount = parseFloat(col.paidAmount) || 0;
        const balance = totalAmount - paidAmount;
        return sum + balance;
    }, 0);

    // Net Profit = Total Sales - Expenses - Collectibles
    const netProfit = totalAmount - totalExpenses - totalCollectibles;

    // Debug logging
    console.log('📊 Sales Stats Update:');
    console.log('  Total Sales:', formatCurrency(totalAmount));
    console.log('  Expenses:', formatCurrency(totalExpenses));
    console.log('  Collectibles Count:', collectibles.length);
    console.log('  Collectibles Total:', formatCurrency(totalCollectibles));
    console.log('  Net Profit:', formatCurrency(netProfit));
    console.log('  Formula: ₱' + totalAmount.toFixed(2) + ' - ₱' + totalExpenses.toFixed(2) + ' - ₱' + totalCollectibles.toFixed(2) + ' = ₱' + netProfit.toFixed(2));

    document.getElementById('salesTotalAmount').textContent = formatCurrency(totalAmount);
    document.getElementById('salesTotalCount').textContent = totalCount;

    const profitEl = document.getElementById('salesNetProfit');
    if (profitEl) {
        profitEl.textContent = formatCurrency(netProfit);
        if (netProfit < 0) {
            profitEl.style.color = 'var(--danger)';
        } else {
            profitEl.style.color = 'var(--success-dark)';
        }
    }
}

// ---------------------------------------------------------
// Transaction Details Modal
// ---------------------------------------------------------

window.viewTransactionDetails = function (transactionId) {
    const transaction = allSales.find(t => t.id === transactionId);
    if (!transaction) return;

    const modal      = document.getElementById('transactionDetailsModal');
    const content    = document.getElementById('transactionDetailsContent');
    const reprintBtn = document.getElementById('reprintBtn');
    const isVoided   = transaction.status === 'voided';

    // Build payment info block
    const isSplit = transaction.paymentMethod === 'split';
    let paymentInfoHtml = '';

    if (isSplit) {
        paymentInfoHtml = `
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--gray-600); margin-top: 0.25rem;">
                <span>Payment</span>
                <span style="font-weight: 700; color: var(--dark);">SPLIT</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">
                <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 0.5rem 0.75rem;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #059669;">💵 Cash</div>
                    <div style="font-size: 1rem; font-weight: 800; color: var(--dark);">${formatCurrency(transaction.cashAmount || 0)}</div>
                </div>
                <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 0.5rem 0.75rem;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--primary);">📱 GCash</div>
                    <div style="font-size: 1rem; font-weight: 800; color: var(--dark);">${formatCurrency(transaction.gcashAmount || 0)}</div>
                </div>
            </div>
            ${transaction.change > 0 ? `
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--gray-600); margin-top: 0.4rem;">
                <span>Change (Cash)</span>
                <span style="color: var(--success); font-weight: 600;">${formatCurrency(transaction.change)}</span>
            </div>` : ''}`;
    } else if (transaction.paymentMethod === 'cash') {
        paymentInfoHtml = `
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--gray-600); margin-top: 0.25rem;">
                <span>Payment</span><span style="font-weight: 600;">💵 Cash</span>
            </div>
            ${transaction.change > 0 ? `
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--gray-600); margin-top: 0.25rem;">
                <span>Change</span>
                <span style="color: var(--success); font-weight: 600;">${formatCurrency(transaction.change)}</span>
            </div>` : ''}`;
    } else {
        paymentInfoHtml = `
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--gray-600); margin-top: 0.25rem;">
                <span>Payment</span>
                <span style="font-weight: 600;">📱 ${(transaction.paymentMethod || 'Mobile').toUpperCase()}</span>
            </div>`;
    }

    content.innerHTML = `
        <div style="text-align: center; margin-bottom: 1rem;">
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">🧾</div>
            <h3 style="margin: 0;">Transaction Details</h3>
            <p style="color: var(--gray-500); margin: 0.25rem 0;">#${formatTransactionId(transaction.id)}</p>
            <p style="color: var(--gray-500); margin: 0;">${formatDateTime(transaction.date)}</p>
            ${isVoided ? '<div class="badge badge-danger" style="display:inline-block; margin-top:0.5rem; font-size:1rem; padding:0.5rem 1rem;">VOIDED</div>' : ''}
            ${isVoided && transaction.voidReason ? `<p style="color: #dc3545; font-size: 0.9rem; margin-top: 0.25rem;">Reason: ${escapeHtml(transaction.voidReason)}</p>` : ''}
        </div>

        <div style="background: var(--light); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            ${transaction.items.map(item => `
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                    <div>
                        <div>${item.name}</div>
                        <div style="color: var(--gray-500); font-size: 0.8rem;">${item.quantity} x ${formatCurrency(item.price)}</div>
                    </div>
                    <div style="font-weight: 600;">${formatCurrency(item.subtotal)}</div>
                </div>
            `).join('')}

            <hr style="border: 0; border-top: 1px dashed var(--gray-300); margin: 0.5rem 0;">

            <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem; margin-top: 0.5rem;">
                <span>Total</span>
                <span>${formatCurrency(transaction.total)}</span>
            </div>

            ${paymentInfoHtml}

            ${transaction.customerName ? `
            <div style="display: flex; justify-content: space-between; color: var(--gray-600); font-size: 0.9rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--gray-200);">
                <span>Customer</span>
                <span>${transaction.customerName}</span>
            </div>` : ''}
        </div>
    `;

    reprintBtn.onclick = () => printTransactionReceipt(transaction, transaction.id);
    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

window.closeTransactionModal = function () {
    const modal = document.getElementById('transactionDetailsModal');
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
}

// Add event listener for outside click to close
document.addEventListener('click', (e) => {
    const modal = document.getElementById('transactionDetailsModal');
    if (e.target === modal) {
        closeTransactionModal();
    }
});

// ---------------------------------------------------------
// Expenses Feature
// ---------------------------------------------------------

async function loadExpenses(filter = 'today') {
    const listContainer = document.getElementById('expensesList');
    const totalBadge = document.getElementById('todayExpensesTotal');
    const title = document.getElementById('expensesTitle');

    // Update buttons
    const buttons = document.querySelectorAll('#expensesView .sales-filter-btn');
    buttons.forEach(btn => {
        if (btn.textContent.toLowerCase() === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    if (filter === 'today') title.textContent = "Today's Expenses";
    else if (filter === 'yesterday') title.textContent = "Yesterday's Expenses";
    else title.textContent = "Expense History";

    listContainer.innerHTML = '<div class="loading-spinner">Loading expenses...</div>';

    try {
        const user = auth.getCurrentUser();
        if (!user) return;

        let expenses = await db.getAll('expenses');

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);

        const filteredExpenses = expenses.filter(exp => {
            const expDate = new Date(exp.date);
            const isUserMatch = exp.storeId === user.storeId && exp.cashier === user.username;

            if (!isUserMatch) return false;

            if (filter === 'today') {
                return expDate >= todayStart;
            } else if (filter === 'yesterday') {
                return expDate >= yesterdayStart && expDate < todayStart;
            } else {
                return true; // History shows all
            }
        });

        // Sort new to old
        filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate total
        const total = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        totalBadge.textContent = formatCurrency(total);

        // Render
        if (filteredExpenses.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state" style="padding: 2rem;">
                    <div style="font-size: 2rem;">💸</div>
                    <p>No expenses found for ${filter}</p>
                </div>`;
            return;
        }

        listContainer.innerHTML = filteredExpenses.map(exp => `
            <div class="sale-card" style="cursor: default;">
                <div class="sale-header">
                    <div class="sale-time">
                        ${new Date(exp.date).toLocaleDateString()} ${new Date(exp.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div class="sale-amount" style="color: var(--danger);">-${formatCurrency(exp.amount)}</div>
                </div>
                <div class="sale-footer">
                    <div class="sale-items-count">
                        <span>📝</span> ${escapeHtml(exp.reason)}
                    </div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading expenses:', error);
        listContainer.innerHTML = `<div class="p-3 text-center text-danger">Error loading expenses</div>`;
    }
}

window.submitExpense = async function () {
    const amountInput = document.getElementById('expenseAmount');
    const reasonInput = document.getElementById('expenseReason');

    const amount = parseFloat(amountInput.value);
    const reason = reasonInput.value.trim();

    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'warning');
        return;
    }

    if (!reason) {
        showToast('Please enter a reason', 'warning');
        return;
    }

    showLoading('Saving expense...');

    try {
        const user = auth.getCurrentUser();
        const expense = {
            date: new Date().toISOString(),
            amount: amount,
            reason: reason,
            cashier: user.username,
            cashierName: user.name || user.username,
            storeId: user.storeId
        };

        await db.add('expenses', expense);

        // Reset form
        amountInput.value = '';
        reasonInput.value = '';

        hideLoading();
        showToast('Expense recorded', 'success');

        // Reload list
        await loadExpenses();

    } catch (error) {
        hideLoading();
        showToast('Error saving expense: ' + error.message, 'error');
    }
}

// ---------------------------------------------------------
// Price Selection Feature
// ---------------------------------------------------------

function showPriceSelector(itemId) {
    const item = cart.find(i => i.id === itemId);
    if (!item || !item.alternativePrices || item.alternativePrices.length === 0) return;

    // Create modal if not exists
    let priceModal = document.getElementById('priceSelectorModal');
    if (!priceModal) {
        priceModal = document.createElement('div');
        priceModal.id = 'priceSelectorModal';
        priceModal.className = 'modal';
        priceModal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Select Price</h2>
                    <button class="modal-close" onclick="closePriceSelector()">×</button>
                </div>
                <div class="modal-body">
                    <div id="priceOptionsList" style="display: flex; flex-direction: column; gap: 0.5rem;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(priceModal);

        // Close on outside click
        priceModal.addEventListener('click', (e) => {
            if (e.target.id === 'priceSelectorModal') closePriceSelector();
        });
    }

    const list = document.getElementById('priceOptionsList');
    list.innerHTML = '';

    // Add Original Price Option
    const productMaster = products.find(p => p.id === item.id);
    const basePrice = productMaster ? productMaster.price : item.price;
    // Use formatCurrency for friendly display
    const currentPrice = item.price;

    // Base Price Button
    const baseBtn = document.createElement('button');
    baseBtn.className = 'btn btn-outline-primary';
    baseBtn.style.display = 'flex';
    baseBtn.style.justifyContent = 'space-between';
    baseBtn.style.alignItems = 'center';
    baseBtn.style.padding = '1rem';
    // Highlight if active
    if (basePrice === currentPrice) baseBtn.style.borderColor = 'var(--primary)';

    baseBtn.innerHTML = `<span>Default Price</span> <strong>${formatCurrency(basePrice)}</strong>`;
    baseBtn.onclick = () => selectItemPrice(itemId, basePrice);
    list.appendChild(baseBtn);

    // Alternative Prices
    item.alternativePrices.forEach(alt => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline-secondary';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'space-between';
        btn.style.alignItems = 'center';
        btn.style.padding = '1rem';
        // Highlight if active
        if (alt.price === currentPrice) {
            btn.className = 'btn btn-primary'; // solid
            btn.style.color = 'white';
        }

        btn.innerHTML = `<span>${escapeHtml(alt.name)}</span> <strong>${formatCurrency(alt.price)}</strong>`;
        btn.onclick = () => selectItemPrice(itemId, alt.price);
        list.appendChild(btn);
    });

    const modal = document.getElementById('priceSelectorModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
}

function closePriceSelector() {
    const modal = document.getElementById('priceSelectorModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }
}

function selectItemPrice(itemId, price) {
    const item = cart.find(i => i.id === itemId);
    if (!item) return;

    item.price = parseFloat(price);
    updateCart();
    closePriceSelector();
    showToast('Price updated', 'success');
}


// ---------------------------------------------------------
// Modifiers Modal Functionality
// ---------------------------------------------------------

window.showModifiersModal = function (productId, cartIndex) {
    const item = cart[cartIndex];
    if (!item) return;

    currentEditingCartItemIndex = cartIndex;
    const modal = document.getElementById('modifiersModal');
    const title = document.getElementById('modifiersModalTitle');
    const list = document.getElementById('modifiersList');

    if (!modal || !list) return;

    title.textContent = `Extras for ${item.name}`;
    list.innerHTML = '';

    // Filter modifiers relevant to this store
    const user = auth.getCurrentUser();

    // Safety check: Filter out nulls or malformed modifiers
    const validModifiers = modifiers.filter(m => m && m.name && m.id);

    // Filter by storeId if present (modifiers without storeId are treated as global or manual)
    const storeModifiers = validModifiers.filter(m => !m.storeId || m.storeId === user.storeId);

    if (storeModifiers.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: var(--gray-500); padding: 2rem;">
                <p>No modifiers available.</p>
                <small>Go to Admin > Modifiers to add some.</small>
            </div>
        `;
    } else {
        // Sort modifiers by name
        storeModifiers.sort((a, b) => a.name.localeCompare(b.name));

        const searchInput = document.getElementById('modifierSearch');
        if (searchInput) {
            searchInput.value = '';
            searchInput.onclick = (e) => e.stopPropagation(); // prevent modal close
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const groups = list.querySelectorAll('.modifier-group');

                groups.forEach(group => {
                    const groupName = group.querySelector('h4').textContent.toLowerCase();
                    const options = group.querySelectorAll('.modifier-option-container');
                    let hasVisibleOption = false;

                    options.forEach(opt => {
                        // The name is in the first span inside the first div
                        const nameSpan = opt.querySelector('span'); // Gets the first span which is name
                        const optName = nameSpan ? nameSpan.textContent.toLowerCase() : '';

                        if (term === '' || groupName.includes(term) || optName.includes(term)) {
                            opt.style.display = 'flex';
                            hasVisibleOption = true;
                        } else {
                            opt.style.display = 'none';
                        }
                    });

                    group.style.display = hasVisibleOption ? 'block' : 'none';
                });
            };
        }

        storeModifiers.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'modifier-group';
            groupDiv.style.border = '1px solid var(--gray-200)';
            groupDiv.style.borderRadius = '8px';
            groupDiv.style.padding = '1rem';

            // Group Header
            const header = document.createElement('div');
            header.style.marginBottom = '0.5rem';
            header.innerHTML = `
                <h4 style="margin: 0; color: var(--dark); font-size: 1rem;">${escapeHtml(group.name)}</h4>
                <div style="font-size: 0.8rem; color: var(--gray-500);">
                    ${group.type === 'multiple' ?
                    (group.maxSelections ? `Select up to ${group.maxSelections}` : 'Select multiple') :
                    'Select one'}
                </div>
            `;
            groupDiv.appendChild(header);

            // Options Container
            const optionsDiv = document.createElement('div');
            optionsDiv.style.display = 'flex';
            optionsDiv.style.flexDirection = 'column';
            optionsDiv.style.gap = '0.5rem';

            // Check currently selected modifiers for this item
            const currentModifiers = item.modifiers || [];

            if (group.options && group.options.length > 0) {
                group.options.forEach(opt => {
                    const isSelected = currentModifiers.some(m => m.name === opt.name && m.price === opt.price);
                    const selectedMod = currentModifiers.find(m => m.name === opt.name && m.price === opt.price);
                    const currentQty = selectedMod ? (selectedMod.quantity || 1) : 1;

                    // Construct unique value for the input
                    const optionValue = `${opt.name}::${opt.price}::${opt.ingredientId || ''}`;
                    const inputType = group.type === 'multiple' ? 'checkbox' : 'radio';
                    const inputName = `modifier_group_${group.id}`;

                    const label = document.createElement('div');
                    label.style.display = 'flex';
                    label.style.flexDirection = 'column';
                    label.style.padding = '0.5rem';
                    label.style.borderRadius = '6px';
                    label.style.cursor = 'pointer';
                    label.style.background = isSelected ? 'var(--primary-light)' : 'var(--gray-50)';
                    label.className = 'modifier-option-container';
                    label.onclick = (e) => {
                        e.stopPropagation();
                        if (!e.target.closest('.modifier-qty-controls')) {
                            const input = label.querySelector('input.modifier-input');
                            if (input) {
                                if (input.type === 'checkbox') input.click();
                                else if (input.type === 'radio' && !input.checked) input.click();
                            }
                        }
                    };

                    const mainRow = document.createElement('div');
                    mainRow.style.display = 'flex';
                    mainRow.style.alignItems = 'center';
                    mainRow.style.justifyContent = 'space-between';
                    mainRow.style.width = '100%';

                    mainRow.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <input type="${inputType}" 
                                   name="${inputName}" 
                                   value="${optionValue.replace(/"/g, '&quot;')}"
                                   ${isSelected ? 'checked' : ''}
                                   data-group-id="${group.id}"
                                   data-max="${group.maxSelections || 999}"
                                   class="modifier-input"
                                   style="width: 18px; height: 18px; accent-color: var(--primary);">
                            <span style="font-weight: 500;">${escapeHtml(opt.name)}</span>
                        </div>
                        <span style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">
                            +${formatCurrency(opt.price)}
                        </span>
                    `;

                    label.appendChild(mainRow);

                    // Quantity Controls
                    const qtyControls = document.createElement('div');
                    qtyControls.className = 'modifier-qty-controls';
                    qtyControls.style.display = isSelected ? 'flex' : 'none';
                    qtyControls.style.alignItems = 'center';
                    qtyControls.style.gap = '0.5rem';
                    qtyControls.style.marginTop = '0.5rem';
                    qtyControls.style.paddingLeft = '2.2rem';

                    qtyControls.innerHTML = `
                         <button type="button" class="btn btn-sm btn-outline-secondary" style="padding: 2px 8px;" onclick="updateModifierQty(this, -1)">-</button>
                         <input type="number" class="modifier-qty-input" value="${currentQty}" min="1" max="99" style="width: 40px; text-align: center; padding: 2px; border: 1px solid var(--gray-300); border-radius: 4px;" onclick="event.stopPropagation()">
                         <button type="button" class="btn btn-sm btn-outline-secondary" style="padding: 2px 8px;" onclick="updateModifierQty(this, 1)">+</button>
                    `;

                    label.appendChild(qtyControls);

                    // Input Listener
                    const input = mainRow.querySelector('input');
                    input.onclick = (e) => e.stopPropagation();

                    input.addEventListener('change', () => {
                        if (input.checked) {
                            if (inputType === 'radio') {
                                const allContainers = optionsDiv.querySelectorAll('.modifier-option-container');
                                allContainers.forEach(div => {
                                    div.style.background = 'var(--gray-50)';
                                    div.querySelector('.modifier-qty-controls').style.display = 'none';
                                });
                            }
                            label.style.background = 'var(--primary-light)';
                            qtyControls.style.display = 'flex';
                        } else {
                            label.style.background = 'var(--gray-50)';
                            qtyControls.style.display = 'none';
                            qtyControls.querySelector('input').value = 1;
                        }

                        if (inputType === 'checkbox' && group.maxSelections) {
                            const checked = optionsDiv.querySelectorAll(`input[name="${inputName}"]:checked`);
                            if (checked.length > group.maxSelections) {
                                input.checked = false;
                                label.style.background = 'var(--gray-50)';
                                qtyControls.style.display = 'none';
                                showToast(`Maximum ${group.maxSelections} selections allowed for ${group.name}`, 'warning');
                            }
                        }
                    });

                    optionsDiv.appendChild(label);
                });
            } else {
                optionsDiv.innerHTML = '<div style="font-style: italic; color: var(--gray-400);">No options in this group</div>';
            }

            groupDiv.appendChild(optionsDiv);
            list.appendChild(groupDiv);
        });
    }

    modal.classList.add('active');
    document.body.classList.add('modal-open');
};

window.closeModifiersModal = function () {
    const modal = document.getElementById('modifiersModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
    currentEditingCartItemIndex = null;
};

// Helper to update modifier quantity in modal
window.updateModifierQty = function (btn, change) {
    if (window.event) window.event.stopPropagation();

    const input = btn.parentElement.querySelector('input');
    let val = parseInt(input.value) || 1;
    val += change;
    if (val < 1) val = 1;
    if (val > 99) val = 99;
    input.value = val;
};

window.saveModifiersToCart = function () {
    if (currentEditingCartItemIndex === null || !cart[currentEditingCartItemIndex]) return;

    const modal = document.getElementById('modifiersModal');
    // Find containers where input is checked
    const selectedContainers = modal.querySelectorAll('.modifier-option-container');

    const newModifiers = [];

    selectedContainers.forEach(container => {
        const input = container.querySelector('input.modifier-input');
        if (input && input.checked) {
            const qtyInput = container.querySelector('.modifier-qty-input');
            const quantity = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;

            const parts = input.value.split('::');
            if (parts.length >= 2) {
                const name = parts[0];
                const price = parseFloat(parts[1]) || 0;
                const ingredientId = parts[2] || null;

                newModifiers.push({
                    name: name,
                    price: price,
                    ingredientId: ingredientId,
                    quantity: quantity
                });
            }
        }
    });

    // Update cart item
    cart[currentEditingCartItemIndex].modifiers = newModifiers;

    // Refresh Cart UI
    updateCart();

    // Close modal
    closeModifiersModal();
    showToast('Modifiers updated', 'success');
};

