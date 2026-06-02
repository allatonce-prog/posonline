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

    // Determine cashier display name
    const cashierDisplay = transaction.cashierName || userMap[transaction.cashier] || transaction.cashier;

    return `
    <tr>
      <td colspan="8" style="padding: 0; border: none;">
        <div class="transaction-card clickable-row" onclick="viewTransaction('${transaction.id}')" style="cursor: pointer; border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.75rem; background: ${isVoided ? '#f9fafb' : 'var(--white)'}; display: flex; flex-direction: column; gap: 0.75rem; transition: all 0.2s; position: relative; overflow: hidden; ${isVoided ? 'opacity: 0.8;' : ''}">
            
            ${isVoided ? '<div style="position: absolute; top: 10px; right: -25px; background: var(--danger); color: white; padding: 2px 30px; transform: rotate(45deg); font-size: 0.7rem; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">VOIDED</div>' : ''}

            <!-- Header: Date & ID -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; color: var(--dark); font-size: 1rem; margin-bottom: 2px; word-break: break-all;">
                        ${formatTransactionId(transaction.id)}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--gray-500);">
                        ${formatDateTime(transaction.date)}
                    </div>
                </div>
                <div style="text-align: right; flex-shrink: 0; padding-right: ${isVoided ? '20px' : '0'}; min-width: fit-content;">
                    <div style="color: ${isVoided ? 'var(--gray-500)' : 'var(--success)'}; font-weight: 800; font-size: 1.15rem; ${isVoided ? 'text-decoration: line-through;' : ''} white-space: nowrap;">
                        ${formatCurrency(Number(transaction.total) || Number(transaction.amount) || 0)}
                    </div>
                    <span class="badge ${isVoided ? 'badge-secondary' : 'badge-primary'}" style="font-size: 0.7rem; padding: 2px 6px; margin-top: 2px; display: inline-block;">
                        ${escapeHtml(transaction.paymentMethod || 'Cash')}
                    </span>
                </div>
            </div>

            <!-- Divider -->
            <div style="height: 1px; background: var(--gray-100); width: 100%;"></div>

            <!-- Details: Cashier, Customer, Items -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 0.5rem; font-size: 0.85rem;">
                <div>
                    <span style="color: var(--gray-500); display: block; font-size: 0.75rem; font-weight: 600;">Cashier</span>
                    <span style="color: var(--dark); font-weight: 500; word-break: break-word;">
                        <i class="ph ph-user" style="vertical-align: middle;"></i> ${escapeHtml(cashierDisplay)}
                    </span>
                </div>
                <div>
                    <span style="color: var(--gray-500); display: block; font-size: 0.75rem; font-weight: 600;">Customer</span>
                    <span style="color: var(--dark); font-weight: 500; word-break: break-word;">
                         ${escapeHtml(transaction.customerName || 'Walk-in')}
                    </span>
                </div>
                <div>
                    <span style="color: var(--gray-500); display: block; font-size: 0.75rem; font-weight: 600;">Items</span>
                    <span style="color: var(--primary); font-weight: 600;">
                        ${transaction.items ? transaction.items.length : 0} item${transaction.items && transaction.items.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>
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
    <div class="transaction-header">
      <div class="transaction-title">
        <h3>Txn Details</h3>
        <span class="transaction-id">${transaction.id}</span>
      </div>
      <div class="transaction-actions">
        ${transaction.status === 'voided'
      ? '<span class="badge badge-danger">VOIDED</span>'
      : `<button onclick="initiateVoidTransaction('${transaction.id}')" class="btn btn-danger btn-sm">Void</button>`}
      </div>
    </div>
      
    ${transaction.status === 'voided' ? `
    <div style="background-color: #fee2e2; color: #b91c1c; padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 1rem; border: 1px solid #fecaca;">
      <strong>Void Reason:</strong> ${escapeHtml(transaction.voidReason || 'No reason provided')}
      <br><small>Voided at: ${formatDateTime(transaction.voidedAt)}</small>
    </div>` : ''}

    <div class="detail-grid">
      <div class="detail-item">
        <p style="font-weight: 800; color: var(--dark);">Date</p>
        <p>${formatDateTime(transaction.date)}</p>
      </div>
      <div class="detail-item">
        <p style="font-weight: 800; color: var(--dark);">Cashier</p>
        <p>${escapeHtml(transaction.cashier)}</p>
      </div>
      <div class="detail-item">
        <p style="font-weight: 800; color: var(--dark);">Customer</p>
        <p>${escapeHtml(transaction.customerName || 'Walk-in')}</p>
      </div>
      <div class="detail-item">
        <p style="font-weight: 800; color: var(--dark);">Payment</p>
        <p>${escapeHtml(transaction.paymentMethod)}</p>
      </div>
    </div>

    <h4 style="margin-bottom: 0.5rem; color: var(--dark); font-size: 1rem; font-weight: 600;">Items</h4>
    
    <div class="transaction-items-list">
      ${transaction.items.map(item => `
        <div class="transaction-item">
          <div class="item-info">
            <span class="item-name">${escapeHtml(item.name)}</span>
            <span class="item-meta">${formatCurrency(item.price)} × ${item.quantity}</span>
            ${(item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0) ? `
              <div class="item-modifiers" style="margin-top: 6px; padding: 6px; background-color: var(--gray-50); border-radius: 6px; border: 1px solid var(--gray-100);">
                <div style="font-size: 0.75rem; font-weight: 700; color: var(--gray-500); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Extras</div>
                ${item.modifiers.map(m => `
                  <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--gray-700); margin-bottom: 2px;">
                      <span>+ ${escapeHtml(m.name || 'Unknown')} ${m.quantity > 1 ? `<strong style="color: var(--primary);">(x${m.quantity})</strong>` : ''}</span>
                      <span style="font-weight: 500;">${formatCurrency((m.price || 0) * (m.quantity || 1))}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="item-total">
            ${formatCurrency(item.subtotal || ((item.price + (item.modifiers ? item.modifiers.reduce((s, m) => s + (m.price * (m.quantity || 1)), 0) : 0)) * item.quantity))}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="transaction-summary">
      <div class="summary-row">
        <span>Subtotal</span>
        <strong>${formatCurrency(transaction.subtotal)}</strong>
      </div>
      ${transaction.tax > 0 ? `
      <div class="summary-row">
        <span>Tax</span>
        <strong>${formatCurrency(transaction.tax)}</strong>
      </div>` : ''}
      <div class="summary-row total">
        <span>Total</span>
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

// Export sales to CSV
async function exportSales() {
  const transactions = await db.getAll('transactions');

  if (transactions.length === 0) {
    showToast('No sales data to export', 'warning');
    return;
  }

  // Prepare data for export
  const exportData = transactions.map(t => ({
    'Transaction ID': t.id,
    'Date': formatDateTime(t.date),
    'Cashier': t.cashier,
    'Customer': t.customerName || 'Walk-in',
    'Items': t.items.length,
    'Subtotal': t.subtotal.toFixed(2),
    // 'Tax': t.tax.toFixed(2), // Removed
    'Total': t.total.toFixed(2),
    'Payment Method': t.paymentMethod
  }));

  const filename = `sales_export_${new Date().toISOString().split('T')[0]}.csv`;
  exportToCSV(exportData, filename);
}

// Close modal on outside click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('transactionModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'transactionModal') {
      closeTransactionModal();
    }
  });
});
