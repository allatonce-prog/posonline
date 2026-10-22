// Sales Management
const salesPaginator = new PaginationManager(5);

// In-memory caches to make Sales tab load instantly (0ms) and filter/paginate in memory
let _salesTransactionsCache = null;
let _salesUsersCache = null;

// Expose cache invalidator
window.invalidateSalesCache = function() {
  _salesTransactionsCache = null;
  _salesUsersCache = null;
};

// Load sales (Cache-first with non-blocking background refresh)
async function loadSales(forceRefresh = false) {
  // 1. If memory cache is available and forceRefresh is false, render immediately!
  if (!forceRefresh && _salesTransactionsCache && _salesUsersCache) {
    renderSalesTable();
    return;
  }

  // 2. Stale-While-Revalidate: Try fast local IndexedDB read first (<20ms)
  if (!forceRefresh && !_salesTransactionsCache) {
    try {
      const [localTransactions, localUsers] = await Promise.all([
        db.getAllLocal('transactions'),
        db.getAllLocal('users')
      ]);
      if (localTransactions && localTransactions.length > 0) {
        _salesTransactionsCache = localTransactions;
        _salesUsersCache = localUsers || [];
        renderSalesTable(); // Instant render from local cache!

        // Background cloud sync non-blockingly
        syncSalesFromCloud().catch(err => console.warn('Background sales sync error:', err));
        return;
      }
    } catch (e) {
      console.warn('Local sales read failed, falling back to cloud:', e);
    }
  }

  // 3. Fallback or forceRefresh: Fetch from cloud
  await syncSalesFromCloud();
}

async function syncSalesFromCloud() {
  const [transactions, users] = await Promise.all([
    db.getAll('transactions'),
    db.getAll('users')
  ]);
  _salesTransactionsCache = transactions || [];
  _salesUsersCache = users || [];
  renderSalesTable();
}

// Render sales table purely from in-memory cache (0ms instant pagination & filtering)
function renderSalesTable() {
  const transactions = _salesTransactionsCache || [];
  const users = _salesUsersCache || [];
  const userMap = {};
  const roleMap = {};
  users.forEach(u => {
    userMap[u.username] = u.name || u.username;
    roleMap[u.username] = u.role;
  });

  const tbody = document.getElementById('salesTable');
  if (!tbody) return;

  const dateFilter = document.getElementById('salesFilter')?.value || 'today';
  const cashierFilter = document.getElementById('salesCashierFilter');
  const cashierFilterValue = cashierFilter?.value || 'all';

  // ------------------------------------------
  // Populate Cashier Filter Dropdown (Dynamic)
  // ------------------------------------------
  if (cashierFilter) {
    const uniqueCashiers = new Set();
    users.forEach(u => {
      if (u.role === 'cashier') uniqueCashiers.add(u.username);
    });
    transactions.forEach(t => {
      if (t.cashier) uniqueCashiers.add(t.cashier);
    });

    const sortedCashiers = Array.from(uniqueCashiers).sort();
    const currentSelection = cashierFilter.value;

    let optionsHtml = '<option value="all">All Cashiers</option>';
    sortedCashiers.forEach(username => {
      const displayName = userMap[username] || username;
      optionsHtml += `<option value="${username}">${escapeHtml(displayName)}</option>`;
    });

    if (cashierFilter.childElementCount !== (sortedCashiers.length + 1)) {
      cashierFilter.innerHTML = optionsHtml;
      const optionExists = Array.from(cashierFilter.options).some(o => o.value === currentSelection);
      cashierFilter.value = optionExists ? currentSelection : 'all';
    }
  }

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No sales yet</td></tr>';
    const container = document.getElementById('salesPaginationContainer');
    if (container) container.innerHTML = '';
    return;
  }

  // Filter transactions in memory
  let filteredTransactions = transactions.filter(t => t.type !== 'collectible_payment');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 1. Filter by Cashier
  if (cashierFilter && cashierFilter.value !== 'all') {
    filteredTransactions = filteredTransactions.filter(t => t.cashier === cashierFilter.value);
  }

  // 2. Filter by Date
  if (dateFilter === 'today') {
    filteredTransactions = filteredTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= today && tDate < new Date(today.getTime() + 86400000);
    });
  } else if (dateFilter === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    filteredTransactions = filteredTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= yesterday && tDate < today;
    });
  } else if (dateFilter === 'last7days') {
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    filteredTransactions = filteredTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= last7Days;
    });
  }

  if (filteredTransactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No sales found for this period</td></tr>';
    const container = document.getElementById('salesPaginationContainer');
    if (container) container.innerHTML = '';
    return;
  }

  // Sort by date (newest first)
  const sortedTransactions = filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Pagination (pure in-memory slice)
  const paginated = salesPaginator.paginate(sortedTransactions);
  const displayTransactions = paginated.data;

  tbody.innerHTML = displayTransactions.map(transaction => {
    const isVoided = transaction.status === 'voided';
    const cashierDisplay = transaction.cashierName || userMap[transaction.cashier] || transaction.cashier || 'Cashier';
    const customerDisplay = transaction.customerName || 'Walk-in';
    const isTakeout = transaction.orderType === 'takeout';
    const itemsCount = transaction.items ? transaction.items.length : 0;
    const totalAmount = Number(transaction.total) || Number(transaction.amount) || 0;
    const dateFormatted = formatDateTime(transaction.date);
    const shortTxnId = formatTransactionId(transaction.id);
    
    // Order type badge with Phosphor icons (no emojis)
    const orderTypeBadge = isTakeout
      ? `<span class="badge-pill badge-takeout"><i class="ph ph-bag"></i> Takeout</span>`
      : `<span class="badge-pill badge-dinein"><i class="ph ph-fork-knife"></i> Dine-in</span>`;

    // Payment method badge with Phosphor icons (no emojis)
    let paymentBadge = '';
    if (transaction.paymentMethod === 'split') {
      paymentBadge = `<span class="badge-pill badge-split"><i class="ph ph-arrows-split"></i> Split</span>`;
    } else if (transaction.paymentMethod?.toLowerCase() === 'gcash' || transaction.paymentMethod?.toLowerCase() === 'mobile') {
      paymentBadge = `<span class="badge-pill badge-gcash"><i class="ph ph-device-mobile"></i> GCash</span>`;
    } else {
      paymentBadge = `<span class="badge-pill badge-cash"><i class="ph ph-money"></i> Cash</span>`;
    }

    return `
    <tr class="clickable-row sales-row ${isVoided ? 'voided-row' : ''}" onclick="viewTransaction('${transaction.id}')" style="cursor: pointer;">
      <!-- Desktop Columns (Hidden on screens <= 768px) -->
      <td class="desktop-col col-txnid" style="font-weight: 700; font-family: monospace; color: var(--gray-700); font-size: 0.85rem; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${shortTxnId}
      </td>
      <td class="desktop-col col-date" style="font-size: 0.82rem; color: var(--gray-600);">${dateFormatted}</td>
      <td class="desktop-col col-cashier" style="font-weight: 600; color: var(--gray-800);">${escapeHtml(cashierDisplay)}</td>
      <td class="desktop-col col-customer" style="color: var(--gray-700);">${escapeHtml(customerDisplay)}</td>
      <td class="desktop-col col-ordertype">${orderTypeBadge}</td>
      <td class="desktop-col col-items" style="font-weight: 700; color: var(--primary);">${itemsCount} item${itemsCount !== 1 ? 's' : ''}</td>
      <td class="desktop-col col-total" style="text-align: right; font-weight: 800; color: ${isVoided ? 'var(--gray-400)' : 'var(--success)'}; ${isVoided ? 'text-decoration: line-through;' : ''} font-size: 0.95rem;">
        ${formatCurrency(totalAmount)}
      </td>
      <td class="desktop-col col-payment">${paymentBadge}</td>
      <td class="desktop-col col-actions" style="text-align: right;" onclick="event.stopPropagation();">
        <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-icon" onclick="viewTransaction('${transaction.id}')" style="height: 32px; width: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px;" title="View Details">
                <i class="ph ph-eye" style="font-size: 1.05rem;"></i>
            </button>
            ${isVoided ? '' : `
            <button class="btn btn-danger btn-icon" onclick="initiateVoidTransaction('${transaction.id}'); event.stopPropagation();" style="height: 32px; width: 32px; padding: 0; background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.15); color: #ef4444; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px;" title="Void Transaction">
                <i class="ph ph-prohibit" style="font-size: 1.05rem;"></i>
            </button>
            `}
        </div>
      </td>

      <!-- Mobile Clean Card Column (Visible ONLY on screens <= 768px) -->
      <td class="mobile-col" colspan="9">
        <div class="sales-mobile-card ${isVoided ? 'is-voided-card' : ''}">
          <!-- Top Row: ID, Date, Amount -->
          <div class="smc-top">
            <div class="smc-id-meta">
              <span class="smc-txn-code">#${shortTxnId}</span>
              <span class="smc-date"><i class="ph ph-calendar"></i> ${dateFormatted}</span>
            </div>
            <div class="smc-amount-box">
              <span class="smc-amount ${isVoided ? 'is-voided-amount' : ''}">${formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <!-- Middle Row: Cashier, Customer, Badges -->
          <div class="smc-meta-row">
            <div class="smc-people">
              <span class="smc-person"><i class="ph ph-user"></i> ${escapeHtml(cashierDisplay)}</span>
              <span class="smc-dot">•</span>
              <span class="smc-person"><i class="ph ph-users"></i> ${escapeHtml(customerDisplay)}</span>
            </div>
            <div class="smc-badges-wrap">
              ${orderTypeBadge}
              ${paymentBadge}
              <span class="badge-pill badge-items"><i class="ph ph-package"></i> ${itemsCount} item${itemsCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <!-- Bottom Action Bar: Beautifully Aligned Buttons -->
          <div class="smc-actions-bar" onclick="event.stopPropagation();">
            ${isVoided ? `
              <span class="smc-voided-label"><i class="ph ph-prohibit"></i> VOIDED</span>
            ` : `
              <button type="button" class="smc-btn smc-btn-void" onclick="initiateVoidTransaction('${transaction.id}'); event.stopPropagation();" title="Void Transaction">
                <i class="ph ph-prohibit"></i> <span>Void</span>
              </button>
            `}
            <button type="button" class="smc-btn smc-btn-view" onclick="viewTransaction('${transaction.id}')" title="View Details">
              <i class="ph ph-eye"></i> <span>Details</span>
            </button>
          </div>
        </div>
      </td>
    </tr>
    `;
  }).join('');

  // Pagination Controls - 0ms instant click
  let paginationContainer = document.getElementById('salesPaginationContainer');
  if (!paginationContainer && tbody) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = 'salesPaginationContainer';
    tbody.closest('.table-container').appendChild(paginationContainer);
  }

  salesPaginator.renderControls('salesPaginationContainer', paginated.totalPages, (page) => {
    salesPaginator.setPage(page);
    renderSalesTable(); // 0ms instant in-memory pagination!
  });
}

// View transaction details
async function viewTransaction(id) {
  const transaction = await db.get('transactions', id);

  if (!transaction) {
    showToast('Transaction not found', 'error');
    return;
  }

  const isVoided = transaction.status === 'voided';
  const isTakeout = transaction.orderType === 'takeout';
  const cashierDisplay = transaction.cashierName || transaction.cashier || 'Cashier';
  const customerDisplay = transaction.customerName || 'Walk-in Customer';

  // Build clean payment method display with Phosphor icons
  let paymentMethodHtml = '';
  if (transaction.paymentMethod === 'split') {
    paymentMethodHtml = `
      <div class="txn-split-payment-box">
        <span class="badge-pill badge-split" style="margin-bottom: 6px;"><i class="ph ph-arrows-split"></i> Split Payment</span>
        <div class="txn-split-subgrid">
          <div class="txn-split-subcard cash">
            <span class="split-subcard-label"><i class="ph ph-money"></i> Cash</span>
            <strong class="split-subcard-val">${formatCurrency(transaction.cashAmount || 0)}</strong>
          </div>
          <div class="txn-split-subcard gcash">
            <span class="split-subcard-label"><i class="ph ph-device-mobile"></i> GCash</span>
            <strong class="split-subcard-val">${formatCurrency(transaction.gcashAmount || 0)}</strong>
          </div>
        </div>
        ${transaction.change > 0 ? `
          <div class="txn-split-change"><i class="ph ph-hand-coins"></i> Change: ${formatCurrency(transaction.change)}</div>
        ` : ''}
      </div>
    `;
  } else if (transaction.paymentMethod?.toLowerCase() === 'gcash' || transaction.paymentMethod?.toLowerCase() === 'mobile') {
    paymentMethodHtml = `
      <span class="badge-pill badge-gcash"><i class="ph ph-device-mobile"></i> GCash</span>
    `;
  } else {
    paymentMethodHtml = `
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="badge-pill badge-cash"><i class="ph ph-money"></i> Cash</span>
        ${transaction.change > 0 ? `<span class="txn-inline-change"><i class="ph ph-hand-coins"></i> Change: ${formatCurrency(transaction.change)}</span>` : ''}
      </div>
    `;
  }

  const detailsHtml = `
    <!-- 1. Transaction Reference Banner Card (Full Width, No Squished Buttons) -->
    <div class="txn-modal-ref-card">
      <div class="txn-modal-ref-content">
        <span class="txn-modal-ref-label">Transaction Reference</span>
        <span class="txn-modal-ref-code">${escapeHtml(transaction.id)}</span>
      </div>
      <div class="txn-modal-ref-badge">
        ${isVoided 
          ? '<span class="badge-voided-pill"><i class="ph ph-prohibit"></i> VOIDED</span>' 
          : '<span class="badge-completed-pill"><i class="ph ph-check-circle"></i> Completed</span>'}
      </div>
    </div>

    <!-- 2. Void Reason Banner (if voided) -->
    ${isVoided ? `
    <div class="txn-modal-void-alert">
      <i class="ph ph-warning-circle"></i>
      <div>
        <strong>Transaction Voided</strong>
        <p><strong>Reason:</strong> ${escapeHtml(transaction.voidReason || 'No reason provided')}</p>
        <small>Voided at: ${formatDateTime(transaction.voidedAt)}</small>
      </div>
    </div>` : ''}

    <!-- 3. Key Details 2-Column Grid -->
    <div class="txn-modal-grid">
      <div class="txn-grid-cell">
        <span class="txn-cell-label"><i class="ph ph-calendar"></i> Date & Time</span>
        <span class="txn-cell-val">${formatDateTime(transaction.date)}</span>
      </div>
      <div class="txn-grid-cell">
        <span class="txn-cell-label"><i class="ph ph-user"></i> Cashier</span>
        <span class="txn-cell-val">${escapeHtml(cashierDisplay)}</span>
      </div>
      <div class="txn-grid-cell">
        <span class="txn-cell-label"><i class="ph ph-users"></i> Customer</span>
        <span class="txn-cell-val">${escapeHtml(customerDisplay)}</span>
      </div>
      <div class="txn-grid-cell">
        <span class="txn-cell-label"><i class="ph ph-bag"></i> Order Type</span>
        <span class="txn-cell-val">
          ${isTakeout 
            ? '<span class="badge-pill badge-takeout"><i class="ph ph-bag"></i> Takeout</span>' 
            : '<span class="badge-pill badge-dinein"><i class="ph ph-fork-knife"></i> Dine-in</span>'}
        </span>
      </div>
      <div class="txn-grid-cell full-width">
        <span class="txn-cell-label"><i class="ph ph-credit-card"></i> Payment Method</span>
        <div class="txn-cell-val" style="margin-top: 4px;">
          ${paymentMethodHtml}
        </div>
      </div>
    </div>

    <!-- 4. Items Purchased List -->
    <div class="txn-modal-items-section">
      <h4 class="txn-modal-section-title"><i class="ph ph-receipt"></i> Items Purchased</h4>
      <div class="txn-modal-items-list">
        ${transaction.items.map(item => `
          <div class="txn-modal-item">
            <div class="txn-item-main">
              <span class="txn-item-name">${escapeHtml(item.name)}</span>
              <div class="txn-item-meta">
                <span class="txn-item-price-tag">${formatCurrency(item.price)}</span>
                <span class="txn-item-qty">× ${item.quantity}</span>
              </div>
              ${(item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0) ? `
                <div class="txn-item-modifiers">
                  <div class="txn-modifiers-header"><i class="ph ph-sliders"></i> Extras / Modifiers</div>
                  ${item.modifiers.map(m => `
                    <div class="txn-modifier-row">
                      <span>+ ${escapeHtml(m.name || 'Extra')} ${m.quantity > 1 ? `<strong style="color: var(--primary);">(x${m.quantity})</strong>` : ''}</span>
                      <span class="txn-modifier-price">${formatCurrency((m.price || 0) * (m.quantity || 1))}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
            <div class="txn-item-subtotal">
              ${formatCurrency(item.subtotal || ((item.price + (item.modifiers ? item.modifiers.reduce((s, m) => s + (m.price * (m.quantity || 1)), 0) : 0)) * item.quantity))}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- 5. Totals Summary Card -->
    <div class="txn-modal-summary">
      <div class="txn-summary-row">
        <span>Subtotal</span>
        <strong>${formatCurrency(transaction.subtotal || transaction.total)}</strong>
      </div>
      ${transaction.tax > 0 ? `
      <div class="txn-summary-row">
        <span>Tax</span>
        <strong>${formatCurrency(transaction.tax)}</strong>
      </div>` : ''}
      <div class="txn-summary-row total-row">
        <span>Total Amount</span>
        <span class="txn-total-price">${formatCurrency(transaction.total)}</span>
      </div>
    </div>
  `;

  document.getElementById('transactionDetails').innerHTML = detailsHtml;

  // 6. Update Aligned Action Buttons in Modal Footer
  const footer = document.getElementById('transactionModalFooter') || document.querySelector('#transactionModal .modal-footer');
  if (footer) {
    if (isVoided) {
      footer.innerHTML = `
        <span class="modal-footer-void-note"><i class="ph ph-info"></i> This transaction is voided</span>
        <button class="btn btn-secondary btn-modal-close" onclick="closeTransactionModal()">Close</button>
      `;
    } else {
      footer.innerHTML = `
        <button class="btn btn-danger-soft btn-modal-void" onclick="initiateVoidTransaction('${transaction.id}')">
          <i class="ph ph-prohibit"></i> <span>Void Transaction</span>
        </button>
        <button class="btn btn-secondary btn-modal-close" onclick="closeTransactionModal()">Close</button>
      `;
    }
  }

  document.getElementById('transactionModal').classList.add('active');
  document.body.classList.add('modal-open');
}

// Initiate void transaction
async function initiateVoidTransaction(id) {
  if (!confirm('Are you sure you want to VOID this transaction? This will reverse the sale and restore inventory.')) {
    return;
  }

  const reason = prompt('Please enter a reason for voiding this transaction:');
  if (reason === null) return; // Users cancelled prompt
  if (reason.trim() === '') {
    alert('Void reason is required.');
    return;
  }

  await processVoidTransaction(id, reason);
}

// Process void transaction logic
async function processVoidTransaction(id, reason) {
  showLoading('Voiding transaction...');
  try {
    const transaction = await db.get('transactions', id);
    if (!transaction) throw new Error('Transaction not found');
    if (transaction.status === 'voided') throw new Error('Transaction is already voided');

    // 1. Update Transaction Status
    transaction.status = 'voided';
    transaction.voidReason = reason;
    transaction.voidedAt = new Date().toISOString();
    await db.update('transactions', transaction);

    // Update in-memory cache immediately
    if (_salesTransactionsCache) {
      const idx = _salesTransactionsCache.findIndex(t => t.id === id);
      if (idx !== -1) {
        _salesTransactionsCache[idx] = { ..._salesTransactionsCache[idx], ...transaction };
      }
    }

    // 2. Restore Inventory
    for (const item of transaction.items) {
      if (!item.id) {
        console.warn('Skipping item with missing ID during void:', item);
        continue;
      }
      const product = await db.get('products', item.id);
      if (product) {
        // Record stock before change
        const stockBefore = product.stock;

        // Update stock
        product.stock += item.quantity;
        await db.update('products', product);

        // Record stock movement with complete information
        await db.add('stockMovements', {
          productId: product.id,
          productName: product.name, // Redundant but useful for logs
          type: 'in',
          quantity: item.quantity,
          reason: `Void Transaction: ${formatTransactionId(id)} `,
          date: new Date().toISOString(),
          user: auth.getCurrentUser().username,
          stockBefore: stockBefore,
          stockAfter: product.stock,
          unitPrice: item.price || product.price,
          storeId: transaction.storeId // Preserve store context
        });
      }
    }

    // 3. Refresh UI
    hideLoading();
    showToast('Transaction voided successfully', 'success');
    closeTransactionModal();
    renderSalesTable(); // Instantly update row in table without re-fetching

    // Refresh dashboard stats if function exists
    if (typeof loadDashboard === 'function') {
      loadDashboard();
    }

  } catch (error) {
    hideLoading();
    console.error('Void error:', error);
    showToast('Failed to void transaction: ' + error.message, 'error');
  }
}

// Close transaction modal
function closeTransactionModal() {
  document.getElementById('transactionModal').classList.remove('active');
  document.body.classList.remove('modal-open');
}

// Helper to get filtered transactions (uses memory or local cache for fast export)
async function getFilteredTransactions() {
  let transactions = _salesTransactionsCache;
  if (!transactions || transactions.length === 0) {
    try {
      transactions = await db.getAllLocal('transactions');
    } catch (e) {}
  }
  if (!transactions || transactions.length === 0) {
    transactions = await db.getAll('transactions');
  }
  transactions = transactions || [];
  const dateFilter = document.getElementById('salesFilter')?.value || 'today';
  const cashierFilter = document.getElementById('salesCashierFilter')?.value || 'all';

  let filteredTransactions = transactions.filter(t => t.type !== 'collectible_payment');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (cashierFilter !== 'all') {
    filteredTransactions = filteredTransactions.filter(t => t.cashier === cashierFilter);
  }

  if (dateFilter === 'today') {
    filteredTransactions = filteredTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= today && tDate < new Date(today.getTime() + 86400000);
    });
  } else if (dateFilter === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    filteredTransactions = filteredTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= yesterday && tDate < today;
    });
  } else if (dateFilter === 'last7days') {
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    filteredTransactions = filteredTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= last7Days;
    });
  }
  return filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Export sales to CSV
async function exportSales(event) {
  if (event) event.stopPropagation();
  const transactions = await getFilteredTransactions();

  if (transactions.length === 0) {
    showToast('No sales data to export', 'warning');
    return;
  }

  // Prepare data for export
  const exportData = transactions.map(t => ({
    'Transaction ID': formatTransactionId(t.id),
    'Date': formatDateTime(t.date),
    'Cashier': t.cashier,
    'Customer': t.customerName || 'Walk-in',
    'Order Type': t.orderType === 'takeout' ? 'Take-out' : 'Dine-in',
    'Items': t.items.length,
    'Subtotal': t.subtotal.toFixed(2),
    'Total': t.total.toFixed(2),
    'Payment Method': t.paymentMethod,
    'Cash Amount': t.paymentMethod === 'split' ? (t.cashAmount || 0).toFixed(2) : (t.paymentMethod === 'cash' ? (t.total || 0).toFixed(2) : ''),
    'GCash Amount': t.paymentMethod === 'split' ? (t.gcashAmount || 0).toFixed(2) : (t.paymentMethod === 'mobile' ? (t.total || 0).toFixed(2) : '')
  }));

  const filename = `sales_export_${new Date().toISOString().split('T')[0]}.csv`;
  exportToCSV(exportData, filename);
}

// Export sales to PDF
async function exportSalesPDF(event) {
  if (event) event.stopPropagation();
  const transactions = await getFilteredTransactions();

  if (transactions.length === 0) {
    showToast('No sales data to export', 'warning');
    return;
  }

  const headers = ['Transaction ID', 'Date', 'Cashier', 'Customer', 'Order Type', 'Items Count', 'Total', 'Payment Method'];
  const rows = transactions.map(t => [
    formatTransactionId(t.id),
    formatDateTime(t.date),
    t.cashier,
    t.customerName || 'Walk-in',
    t.orderType === 'takeout' ? 'Take-out' : 'Dine-in',
    t.items.length,
    formatCurrency(t.total),
    t.paymentMethod === 'split' ? 'Cash + GCash' : (t.paymentMethod || 'Cash')
  ]);

  const filename = `sales_export_${new Date().toISOString().split('T')[0]}.pdf`;
  exportToPDF('Sales Report', headers, rows, filename);
}


// Close modal on outside click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('transactionModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'transactionModal') {
      closeTransactionModal();
    }
  });
});
