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
    setupMobileCart();
});

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
          <div class="cart-item-price">${formatCurrency(item.price)} × ${item.quantity}</div>
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

        if (window.innerWidth <= 900 &&
            cartSidebar.classList.contains('expanded') &&
            !cartSidebar.contains(e.target) &&
            !mobileBar.contains(e.target)) {
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
window.switchView = async function (view) {
    // Update Tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    // Find the tab that matches the view (index 0 for pos, 1 for sales)
    const tabIndex = view === 'pos' ? 0 : 1;
    document.querySelectorAll('.view-tab')[tabIndex].classList.add('active');

    // Update Views
    if (view === 'pos') {
        document.getElementById('posView').style.display = 'block';
        document.getElementById('salesView').style.display = 'none';

        // Show Sidebar/Mobile Bar only in POS view
        document.getElementById('cartSidebar').style.display = 'flex';
        const mobileBar = document.getElementById('mobileCartBar');
        if (mobileBar) mobileBar.style.display = 'flex';

    } else if (view === 'sales') {
        document.getElementById('posView').style.display = 'none';
        document.getElementById('salesView').style.display = 'block';

        // Hide Sidebar/Mobile Bar in Sales view
        document.getElementById('cartSidebar').style.display = 'none';
        const mobileBar = document.getElementById('mobileCartBar');
        if (mobileBar) mobileBar.style.display = 'none';

        // Load Sales Data
        await loadSalesHistory();
    }
}

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
    document.querySelectorAll('.sales-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === filterType) { // text content matches filter name loosely
            btn.classList.add('active');
        }
        // Better matching: check onclick attribute or just index
    });
    // Fix: Match button by onclick since textContent might vary slightly or be capitalized
    const buttons = document.querySelectorAll('.sales-filter-btn');
    if (filterType === 'recent') buttons[0].classList.add('active');
    if (filterType === 'today') buttons[1].classList.add('active');
    if (filterType === 'yesterday') buttons[2].classList.add('active');


    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let filtered = [];

    if (filterType === 'recent') {
        // Last 20 transactions
        filtered = allSales.slice(0, 20);
    } else if (filterType === 'today') {
        filtered = allSales.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= today && saleDate < new Date(today.getTime() + 86400000);
        });
    } else if (filterType === 'yesterday') {
        filtered = allSales.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= yesterday && saleDate < today;
        });
    }

    renderSalesList(filtered);
    updateSalesStats(filtered);
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
function updateSalesStats(sales) {
    // Filter out voided sales for total calculation
    const validSales = sales.filter(s => s.status !== 'voided');

    const totalAmount = validSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const totalCount = validSales.length;

    document.getElementById('salesTotalAmount').textContent = formatCurrency(totalAmount);
    // Show total count (maybe show valid count or total count including voids? Usually valid count is more useful for "Sales" stats)
    document.getElementById('salesTotalCount').textContent = totalCount;
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
