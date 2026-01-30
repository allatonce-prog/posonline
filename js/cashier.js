// Cashier functionality
let products = [];
let cart = [];
let categories = new Set(['all']);

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
    // Setup mobile cart toggle
    setupMobileCart();

    // Initialize held orders counter
    updateHeldOrdersCount();
});

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
}

window.closeHeldOrdersModal = function () {
    document.getElementById('heldOrdersModal').classList.remove('active');
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

// Load products
async function loadProducts() {
    products = await db.getAll('products');

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

// Render category filters
function renderCategoryFilters() {
    const filterContainer = document.getElementById('categoryFilter');
    filterContainer.innerHTML = '';

    categories.forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn' + (category === 'all' ? ' active' : '');
        btn.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        btn.dataset.category = category;
        btn.addEventListener('click', () => filterByCategory(category));
        filterContainer.appendChild(btn);
    });
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

    if (productsToRender.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    grid.innerHTML = '';

    const lowStockThreshold = getLowStockThreshold();

    productsToRender.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => addToCart(product);

        const stockClass = product.stock <= lowStockThreshold ? 'low' : '';
        const stockText = product.stock > 0 ? `${product.stock} in stock` : 'Out of stock';

        card.innerHTML = `
      <div class="product-image">
        ${product.image ? `<img src="${product.image}" alt="${product.name}">` : '📦'}
      </div>
      <div class="product-info">
        <div class="product-name">${escapeHtml(product.name)}</div>
        <div class="product-category">${escapeHtml(product.category || 'Uncategorized')}</div>
        <div class="product-price">${formatCurrency(product.price)}</div>
        <div class="product-stock ${stockClass}">${stockText}</div>
      </div>
    `;

        // Disable if out of stock
        if (product.stock <= 0) {
            card.style.opacity = '0.5';
            card.style.cursor = 'not-allowed';
            card.onclick = () => showToast('Product out of stock', 'warning');
        }

        grid.appendChild(card);
    });
}

// Add to cart
function addToCart(product) {
    if (product.stock <= 0) {
        showToast('Product out of stock', 'warning');
        return;
    }

    // Check if product already in cart
    const existingItem = cart.find(item => item.id === product.id);

    if (existingItem) {
        // Check if we can add more
        if (existingItem.quantity >= product.stock) {
            showToast('Cannot add more than available stock', 'warning');
            return;
        }
        existingItem.quantity++;
    } else {
        cart.push({
            ...product,
            quantity: 1
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

    // Check bounds
    if (newQuantity <= 0) {
        removeFromCart(productId);
        return;
    }

    if (newQuantity > item.stock) {
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

    if (qty > item.stock) {
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
        cartItemsContainer.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-image">
          ${item.image ? `<img src="${item.image}" alt="${item.name}">` : '📦'}
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-price">
            ${formatCurrency(item.price)} × ${item.quantity}
             ${item.alternativePrices && item.alternativePrices.length > 0 ?
                `<button class="btn btn-sm btn-outline-primary" style="padding: 2px 8px; margin-left: 8px; font-size: 0.9rem;" onclick="event.stopPropagation(); showPriceSelector('${item.id}')" title="Change Price">🏷️</button>`
                : ''}
          </div>
          <div class="cart-item-controls">
            <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">−</button>
            <input 
              type="number" 
              class="qty-input" 
              value="${item.quantity}"
              min="1"
              max="${item.stock}"
              onchange="setQuantity('${item.id}', this.value)"
            >
            <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
          </div>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">×</button>
      </div>
    `).join('');
    }

    // Update totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
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

// Checkout
function checkout() {
    if (cart.length === 0) {
        showToast('Cart is empty', 'warning');
        return;
    }

    // Show checkout modal
    const modal = document.getElementById('checkoutModal');
    modal.classList.add('active');

    // Set total
    const total = parseFloat(document.getElementById('total').textContent.replace(/[₱,]/g, ''));
    document.getElementById('checkoutTotal').textContent = formatCurrency(total);

    // Reset form
    document.getElementById('paymentMethod').value = 'cash';
    document.getElementById('customerName').value = '';
    document.getElementById('amountReceived').value = '';
    document.getElementById('change').textContent = formatCurrency(0);

    toggleCashPayment();
}

// Close checkout modal
function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    modal.classList.remove('active');
}

// Toggle cash payment fields
function toggleCashPayment() {
    const paymentMethod = document.getElementById('paymentMethod').value;
    const cashGroup = document.getElementById('cashPaymentGroup');
    cashGroup.style.display = paymentMethod === 'cash' ? 'block' : 'none';
}

// Calculate change
function calculateChange() {
    const total = parseFloat(document.getElementById('total').textContent.replace(/[₱,]/g, ''));
    const received = parseFloat(document.getElementById('amountReceived').value) || 0;
    const change = received - total;

    document.getElementById('change').textContent = formatCurrency(Math.max(0, change));
    document.getElementById('change').style.color = change >= 0 ? 'var(--success)' : 'var(--danger)';
}

// Complete transaction
async function completeTransaction() {
    const paymentMethod = document.getElementById('paymentMethod').value;
    const customerName = document.getElementById('customerName').value.trim();
    const total = parseFloat(document.getElementById('total').textContent.replace(/[₱,]/g, ''));

    // Validate cash payment
    if (paymentMethod === 'cash') {
        const received = parseFloat(document.getElementById('amountReceived').value) || 0;
        if (received < total) {
            showToast('Insufficient amount received', 'error');
            return;
        }
    }

    showLoading('Processing transaction...');

    try {
        // Create transaction
        const transaction = {
            date: new Date().toISOString(),
            cashier: auth.getCurrentUser().username,
            cashierName: auth.getCurrentUser().name || auth.getCurrentUser().username,
            items: cart.map(item => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                subtotal: item.price * item.quantity
            })),
            subtotal: parseFloat(document.getElementById('subtotal').textContent.replace(/[₱,]/g, '')),
            tax: 0,
            total: total,
            paymentMethod: paymentMethod,
            customerName: customerName || 'Walk-in Customer'
        };

        // Save transaction
        const transactionId = await db.add('transactions', transaction);

        // Update product stock and record movements
        for (const item of cart) {
            const product = await db.get('products', item.id);
            const stockBefore = product.stock;

            product.stock -= item.quantity;
            await db.update('products', product);

            // Record stock movement with unit price
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

        hideLoading();
        closeCheckoutModal();

        // Print receipt
        printTransactionReceipt(transaction, transactionId);

        // Clear cart and reload products
        cart = [];
        updateCart();
        await loadProducts();

        showToast('Transaction completed successfully!', 'success');

    } catch (error) {
        hideLoading();
        showToast('Error completing transaction: ' + error.message, 'error');
    }
}

// Print receipt
function printTransactionReceipt(transaction, transactionId) {
    // Get custom settings
    const settings = typeof getSettings === 'function' ? getSettings() : { systemName: 'POS System', systemDescription: 'Point of Sale Receipt' };

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
    <!-- Tax removed from receipt -->
    <div class="receipt-item receipt-total">
      <span>TOTAL:</span>
      <span>${formatCurrency(transaction.total)}</span>
    </div>
    <div class="receipt-item">
      <span>Payment:</span>
      <span>${transaction.paymentMethod.toUpperCase()}</span>
    </div>
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
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (!query) {
            // Remove searching class
            searchInput.classList.remove('searching');

            // Get current category filter
            const activeFilter = document.querySelector('.filter-btn.active');
            const category = activeFilter ? activeFilter.dataset.category : 'all';
            filterByCategory(category);
            return;
        }

        // Add searching class for visual feedback
        searchInput.classList.add('searching');

        // Real-time filtering - matches every letter
        const filtered = products.filter(product =>
            product.name.toLowerCase().includes(query) ||
            product.sku.toLowerCase().includes(query) ||
            (product.category && product.category.toLowerCase().includes(query))
        );

        renderProducts(filtered);
    });

    // Payment method change
    document.getElementById('paymentMethod').addEventListener('change', toggleCashPayment);

    // Amount received change
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

    // Sidebar visibility
    const cartSidebar = document.getElementById('cartSidebar');
    const mobileBar = document.getElementById('mobileCartBar');

    // Show selected view
    if (view === 'pos') {
        document.getElementById('posView').style.display = 'block';
        cartSidebar.style.display = 'flex';
        if (mobileBar) mobileBar.style.display = 'flex';
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
    }
}

let allExpenses = [];

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
        const sales = await db.getAllByIndex('transactions', 'cashier', user.username);

        // Fetch expenses for this cashier
        // Filter manually since we might not have a perfect index for (cashier + date) easily available
        // But let's assume we get all expenses and filter
        const expenses = await db.getAll('expenses');
        allExpenses = expenses.filter(exp => exp.storeId === user.storeId && exp.cashier === user.username);

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

    } else if (filterType === 'today') {
        filteredSales = allSales.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= today && saleDate < new Date(today.getTime() + 86400000);
        });
        filteredExpenses = allExpenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate >= today && expDate < new Date(today.getTime() + 86400000);
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
    }

    renderSalesList(filteredSales);
    updateSalesStats(filteredSales, filteredExpenses);
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
        const date = new Date(sale.date);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString();
        const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        const isVoided = sale.status === 'voided';

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
function updateSalesStats(sales, expenses = []) {
    // Filter out voided sales for total calculation
    const validSales = sales.filter(s => s.status !== 'voided');
    const totalAmount = validSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const totalCount = validSales.length;

    // Calculate expenses total
    const totalExpenses = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    const netProfit = totalAmount - totalExpenses;

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

    const modal = document.getElementById('transactionDetailsModal');
    const content = document.getElementById('transactionDetailsContent');
    const reprintBtn = document.getElementById('reprintBtn');

    // Setup content
    const isVoided = transaction.status === 'voided';

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
            <div style="display: flex; justify-content: space-between; color: var(--gray-600); font-size: 0.9rem; margin-top: 0.25rem;">
                <span>Payment (${transaction.paymentMethod})</span>
                <span>${formatCurrency(transaction.total)}</span>
            </div>
             ${transaction.customerName ? `
            <div style="display: flex; justify-content: space-between; color: var(--gray-600); font-size: 0.9rem; margin-top: 0.25rem;">
                <span>Customer</span>
                <span>${transaction.customerName}</span>
            </div>` : ''}
        </div>
    `;

    // Setup Actions
    reprintBtn.onclick = () => printTransactionReceipt(transaction, transaction.id);

    // Show modal
    modal.classList.add('active');
}

window.closeTransactionModal = function () {
    const modal = document.getElementById('transactionDetailsModal');
    modal.classList.remove('active');
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
    let modal = document.getElementById('priceSelectorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'priceSelectorModal';
        modal.className = 'modal';
        modal.innerHTML = `
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
        document.body.appendChild(modal);

        // Close on outside click
        modal.addEventListener('click', (e) => {
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

    modal.classList.add('active');
}

function closePriceSelector() {
    const modal = document.getElementById('priceSelectorModal');
    if (modal) modal.classList.remove('active');
}

function selectItemPrice(itemId, price) {
    const item = cart.find(i => i.id === itemId);
    if (item) {
        item.price = parseFloat(price);
        updateCart();
        showToast('Price updated', 'success');
    }
    closePriceSelector();
}
