// Sales Management
const salesPaginator = new PaginationManager(5);

// Load sales
async function loadSales() {
  const transactions = await db.getAll('transactions');
  const users = await db.getAll('users');
  const userMap = {};
  const roleMap = {};
  users.forEach(u => {
    userMap[u.username] = u.name || u.username;
    roleMap[u.username] = u.role;
  });

  const tbody = document.getElementById('salesTable');
  const dateFilter = document.getElementById('salesFilter').value;
  const cashierFilter = document.getElementById('salesCashierFilter');
  const cashierFilterValue = cashierFilter?.value || 'all';

  // ------------------------------------------
  // Populate Cashier Filter Dropdown (Dynamic)
  // ------------------------------------------
  if (cashierFilter) {
    // Get unique cashiers from transactions + existing users
    const uniqueCashiers = new Set();

    // Add existing cashiers
    users.forEach(u => {
      if (u.role === 'cashier') uniqueCashiers.add(u.username);
    });

    // Add checks from transactions
    transactions.forEach(t => {
      if (t.cashier) uniqueCashiers.add(t.cashier);
    });

    const sortedCashiers = Array.from(uniqueCashiers).sort();

    // Save current selection to restore after rebuild
    const currentSelection = cashierFilter.value;

    let optionsHtml = '<option value="all">All Cashiers</option>';
    sortedCashiers.forEach(username => {
      const displayName = userMap[username] || username;
      optionsHtml += `<option value="${username}">${escapeHtml(displayName)}</option>`;
    });

    // Only update innerHTML if options changed (simple check: length) or force update
    if (cashierFilter.innerHTML.length < 50 || cashierFilter.childElementCount !== (document.querySelectorAll('#salesCashierFilter option').length)) {
      cashierFilter.innerHTML = optionsHtml;
      // Restore selection if valid, else default to all
      const optionExists = Array.from(cashierFilter.options).some(o => o.value === currentSelection);
      cashierFilter.value = optionExists ? currentSelection : 'all';
    }
  }

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No sales yet</td></tr>';
    const container = document.getElementById('salesPaginationContainer');
    if (container) container.innerHTML = '';
    return;
  }

  // Filter transactions
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
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No sales found for this period</td></tr>';
    const container = document.getElementById('salesPaginationContainer');
    if (container) container.innerHTML = '';
    return;
  }

  // Sort by date (newest first)
  const sortedTransactions = filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Pagination
  const paginated = salesPaginator.paginate(sortedTransactions);
  const displayTransactions = paginated.data;

  tbody.innerHTML = displayTransactions.map(transaction => {
    const isVoided = transaction.status === 'voided';
    const cashierDisplay = transaction.cashierName || userMap[transaction.cashier] || transaction.cashier;
    
    // Order type badge
    let orderTypeBadge = '';
    if (transaction.orderType === 'takeout') {
        orderTypeBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.08); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.15); font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px;"><i class="ph ph-shopping-bag"></i> Takeout</span>`;
    } else {
        orderTypeBadge = `<span class="badge" style="background: rgba(99, 102, 241, 0.08); color: #6366f1; border: 1px solid rgba(99, 102, 241, 0.15); font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px;"><i class="ph ph-house"></i> Dine-in</span>`;
    }

    // Payment method badge
    let paymentBadge = '';
    if (transaction.paymentMethod === 'split') {
        paymentBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.08); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.15); font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px;">💵 Cash + 📱 GCash</span>`;
    } else if (transaction.paymentMethod?.toLowerCase() === 'gcash') {
        paymentBadge = `<span class="badge" style="background: rgba(59, 130, 246, 0.08); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.15); font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px;">📱 GCash</span>`;
    } else {
        paymentBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.08); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.15); font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px;">💵 Cash</span>`;
    }

    const itemsCount = transaction.items ? transaction.items.length : 0;
    
    return `
    <tr class="clickable-row ${isVoided ? 'voided-row' : ''}" onclick="viewTransaction('${transaction.id}')" style="cursor: pointer; ${isVoided ? 'opacity: 0.7;' : ''}">
      <td style="font-weight: 700; font-family: monospace; color: var(--gray-700); font-size: 0.85rem; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${formatTransactionId(transaction.id)}
      </td>
      <td style="font-size: 0.82rem; color: var(--gray-600);">${formatDateTime(transaction.date)}</td>
      <td style="font-weight: 600; color: var(--gray-800);">${escapeHtml(cashierDisplay)}</td>
      <td style="color: var(--gray-700);">${escapeHtml(transaction.customerName || 'Walk-in')}</td>
      <td>${orderTypeBadge}</td>
      <td style="font-weight: 700; color: var(--primary);">${itemsCount} item${itemsCount !== 1 ? 's' : ''}</td>
      <td style="text-align: right; font-weight: 800; color: ${isVoided ? 'var(--gray-400)' : 'var(--success)'}; ${isVoided ? 'text-decoration: line-through;' : ''} font-size: 0.95rem;">
        ${formatCurrency(Number(transaction.total) || Number(transaction.amount) || 0)}
      </td>
      <td>${paymentBadge}</td>
      <td style="text-align: right;" onclick="event.stopPropagation();">
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
    </tr>
    `;
  }).join('');

  // Pagination Controls
  let paginationContainer = document.getElementById('salesPaginationContainer');
  if (!paginationContainer && tbody) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = 'salesPaginationContainer';
    tbody.closest('.table-container').appendChild(paginationContainer);
  }

  salesPaginator.renderControls('salesPaginationContainer', paginated.totalPages, (page) => {
    salesPaginator.setPage(page);
    loadSales();
  });
}

// View transaction details
async function viewTransaction(id) {
  const transaction = await db.get('transactions', id);

  if (!transaction) {
    showToast('Transaction not found', 'error');
    return;
  }

  const detailsHtml = `
    <div class="transaction-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--gray-100);">
      <div class="transaction-title" style="display: flex; flex-direction: column; gap: 0.25rem;">
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--gray-400); letter-spacing: 0.5px;">Transaction Reference</span>
        <span class="transaction-id" style="font-family: monospace; font-size: 1.1rem; font-weight: 700; color: var(--gray-800); background: var(--gray-100); padding: 0.35rem 0.75rem; border-radius: 8px; width: fit-content; border: 1px solid var(--gray-200);">${transaction.id}</span>
      </div>
      <div class="transaction-actions">
        ${transaction.status === 'voided'
      ? '<span class="badge-voided" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); font-weight: 700; padding: 0.5rem 1rem; border-radius: 30px; font-size: 0.8rem; letter-spacing: 0.5px;">VOIDED</span>'
      : `<button onclick="initiateVoidTransaction('${transaction.id}')" class="btn btn-danger btn-sm" style="border-radius: var(--radius-md); font-weight: 600; padding: 0.5rem 1.25rem;"><i class="ph ph-trash" style="margin-right: 4px;"></i> Void Transaction</button>`}
      </div>
    </div>
      
    ${transaction.status === 'voided' ? `
    <div style="background-color: #fee2e2; color: #b91c1c; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; border: 1px solid #fecaca; display: flex; gap: 0.75rem; align-items: flex-start;">
      <i class="ph ph-warning-circle" style="font-size: 1.5rem; margin-top: 2px;"></i>
      <div>
        <strong style="display: block; margin-bottom: 0.25rem;">Voided Transaction</strong>
        <p style="margin: 0; font-size: 0.9rem;"><strong>Reason:</strong> ${escapeHtml(transaction.voidReason || 'No reason provided')}</p>
        <small style="opacity: 0.8; display: block; margin-top: 0.25rem;">Voided at: ${formatDateTime(transaction.voidedAt)}</small>
      </div>
    </div>` : ''}

    <div class="detail-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; background: var(--gray-50); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--gray-100);">
      <div class="detail-item" style="display: flex; flex-direction: column; gap: 0.25rem;">
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--gray-400); letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-calendar"></i> Date & Time</span>
        <span style="font-weight: 600; color: var(--gray-800);">${formatDateTime(transaction.date)}</span>
      </div>
      <div class="detail-item" style="display: flex; flex-direction: column; gap: 0.25rem;">
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--gray-400); letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-user"></i> Cashier</span>
        <span style="font-weight: 600; color: var(--gray-800);">${escapeHtml(transaction.cashier)}</span>
      </div>
      <div class="detail-item" style="display: flex; flex-direction: column; gap: 0.25rem;">
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--gray-400); letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-users"></i> Customer</span>
        <span style="font-weight: 600; color: var(--gray-800);">${escapeHtml(transaction.customerName || 'Walk-in')}</span>
      </div>
      <div class="detail-item" style="display: flex; flex-direction: column; gap: 0.25rem;">
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--gray-400); letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-shopping-bag"></i> Order Type</span>
        <span style="font-weight: 600; color: var(--gray-800);">${transaction.orderType === 'takeout' ? '🥡 Take-out' : '🍽️ Dine-in'}</span>
      </div>
      <div class="detail-item" style="display: flex; flex-direction: column; gap: 0.25rem;">
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--gray-400); letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-credit-card"></i> Payment Method</span>
        ${transaction.paymentMethod === 'split' ? `
          <span class="payment-method-badge split" style="font-weight: 700; color: var(--primary); font-size: 0.85rem; display: flex; align-items: center; gap: 4px; margin-bottom: 0.25rem;"><i class="ph ph-arrows-split"></i> Split Payment</span>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem; width: 100%;">
            <div style="flex: 1; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 0.5rem; display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 0.65rem; font-weight: 800; color: #059669; text-transform: uppercase; letter-spacing: 0.5px;">💵 Cash</span>
              <strong style="font-size: 0.95rem; font-weight: 800; color: #065f46;">${formatCurrency(transaction.cashAmount || 0)}</strong>
            </div>
            <div style="flex: 1; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 8px; padding: 0.5rem; display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 0.65rem; font-weight: 800; color: #6366f1; text-transform: uppercase; letter-spacing: 0.5px;">📱 GCash</span>
              <strong style="font-size: 0.95rem; font-weight: 800; color: #3730a3;">${formatCurrency(transaction.gcashAmount || 0)}</strong>
            </div>
          </div>
          ${transaction.change > 0 ? `<p style="font-size: 0.8rem; font-weight: 700; color: var(--success); margin: 0.25rem 0 0 0; display: flex; align-items: center; gap: 2px;"><i class="ph ph-hand-coins"></i> Change: ${formatCurrency(transaction.change)}</p>` : ''}` : 
          (transaction.paymentMethod === 'gcash' ? `
            <span class="payment-method-badge gcash" style="background: rgba(99,102,241,0.1); color: #6366f1; border: 1px solid rgba(99,102,241,0.2); font-weight: 700; font-size: 0.85rem; padding: 0.25rem 0.75rem; border-radius: 30px; width: fit-content; display: inline-flex; align-items: center; gap: 4px;"><i class="ph ph-device-mobile"></i> GCash</span>
          ` : `
            <span class="payment-method-badge cash" style="background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.2); font-weight: 700; font-size: 0.85rem; padding: 0.25rem 0.75rem; border-radius: 30px; width: fit-content; display: inline-flex; align-items: center; gap: 4px;"><i class="ph ph-money"></i> Cash</span>
          `)}
      </div>
    </div>

    <h4 style="margin-top: 1.5rem; margin-bottom: 0.75rem; color: var(--dark); font-size: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--gray-100); padding-bottom: 0.5rem; display: flex; align-items: center; gap: 6px;"><i class="ph ph-shopping-bag"></i> Items Purchased</h4>
    
    <div class="transaction-items-list" style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 250px; overflow-y: auto; padding-right: 4px;">
      ${transaction.items.map(item => `
        <div class="transaction-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--white); border: 1px solid var(--gray-100); border-radius: 12px; transition: all 0.2s;">
          <div class="item-info" style="display: flex; flex-direction: column; gap: 0.25rem; flex: 1;">
            <span class="item-name" style="font-weight: 700; color: var(--gray-800); font-size: 0.95rem;">${escapeHtml(item.name)}</span>
            <span class="item-meta" style="font-size: 0.85rem; color: var(--gray-500); font-weight: 500;">
              <span style="background: var(--gray-100); padding: 2px 6px; border-radius: 6px; font-weight: 600; margin-right: 4px;">${formatCurrency(item.price)}</span> × ${item.quantity}
            </span>
            ${(item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0) ? `
              <div class="item-modifiers" style="margin-top: 6px; padding: 6px 10px; background-color: var(--gray-50); border-radius: 8px; border: 1px dashed var(--gray-200); max-width: 90%;">
                <div style="font-size: 0.65rem; font-weight: 800; color: var(--gray-400); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 2px;"><i class="ph ph-plus-circle"></i> Extras / Customizations</div>
                ${item.modifiers.map(m => `
                  <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--gray-600); margin-bottom: 2px;">
                      <span>+ ${escapeHtml(m.name || 'Unknown')} ${m.quantity > 1 ? `<strong style="color: var(--primary);">(x${m.quantity})</strong>` : ''}</span>
                      <span style="font-weight: 600; color: var(--gray-700);">${formatCurrency((m.price || 0) * (m.quantity || 1))}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="item-total" style="font-weight: 800; color: var(--dark); font-size: 1.05rem;">
            ${formatCurrency(item.subtotal || ((item.price + (item.modifiers ? item.modifiers.reduce((s, m) => s + (m.price * (m.quantity || 1)), 0) : 0)) * item.quantity))}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="transaction-summary" style="margin-top: 1.5rem; background: var(--gray-50); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--gray-100); display: flex; flex-direction: column; gap: 0.5rem;">
      <div class="summary-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: var(--gray-500); font-weight: 500;">
        <span>Subtotal</span>
        <strong style="color: var(--gray-800);">${formatCurrency(transaction.subtotal)}</strong>
      </div>
      ${transaction.tax > 0 ? `
      <div class="summary-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: var(--gray-500); font-weight: 500;">
        <span>Tax</span>
        <strong style="color: var(--gray-800);">${formatCurrency(transaction.tax)}</strong>
      </div>` : ''}
      <div class="summary-row total" style="display: flex; justify-content: space-between; align-items: center; font-size: 1.35rem; font-weight: 800; color: var(--primary); border-top: 1px dashed var(--gray-200); padding-top: 0.75rem; margin-top: 0.25rem;">
        <span>Total Amount</span>
        <span>${formatCurrency(transaction.total)}</span>
      </div>
    </div>
  `;

  document.getElementById('transactionDetails').innerHTML = detailsHtml;
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
    await loadSales(); // Reload list to show status updates

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

// Helper to get filtered transactions
async function getFilteredTransactions() {
  const transactions = await db.getAll('transactions');
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
