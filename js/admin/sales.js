// Sales Management

// Load sales
async function loadSales() {
  const transactions = await db.getAll('transactions');
  const users = await db.getAll('users');
  const userMap = {};
  users.forEach(u => {
    userMap[u.username] = u.name || u.username;
  });

  const tbody = document.getElementById('salesTable');
  const filter = document.getElementById('salesFilter').value;

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No sales yet</td></tr>';
    return;
  }

  // Filter transactions
  let filteredTransactions = transactions;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (filter === 'today') {
    filteredTransactions = transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= today && tDate < new Date(today.getTime() + 86400000);
    });
  } else if (filter === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    filteredTransactions = transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= yesterday && tDate < today;
    });
  } else if (filter === 'last7days') {
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    filteredTransactions = transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= last7Days;
    });
  }

  if (filteredTransactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No sales found for this period</td></tr>';
    return;
  }

  // Sort by date (newest first)
  const sortedTransactions = filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  tbody.innerHTML = sortedTransactions.map(transaction => {
    const isVoided = transaction.status === 'voided';
    const rowStyle = isVoided ? 'opacity: 0.6; background-color: #f9fafb;' : '';
    const textStyle = isVoided ? 'text-decoration: line-through; color: #6b7280;' : '';

    // Determine cashier display name
    // 1. Use saved name in transaction (for new transactions)
    // 2. Lookup user by username (for old transactions)
    // 3. Fallback to username
    const cashierDisplay = transaction.cashierName || userMap[transaction.cashier] || transaction.cashier;

    return `
    <tr class="clickable-row" style="${rowStyle}" onclick="viewTransaction('${transaction.id}')">
      <td data-label="ID">
        ${formatTransactionId(transaction.id)}
        ${isVoided ? '<span class="badge badge-danger" style="margin-left: 0.5rem; font-size: 0.7rem;">VOIDED</span>' : ''}
      </td>
      <td data-label="Date" style="${textStyle}">${formatDateTime(transaction.date)}</td>
      <td data-label="Cashier" style="${textStyle}">${escapeHtml(cashierDisplay)}</td>
      <td data-label="Customer" style="${textStyle}">${escapeHtml(transaction.customerName || 'Walk-in')}</td>
      <td data-label="Items" style="${textStyle}">${transaction.items ? transaction.items.length : 0} items</td>
      <td data-label="Total" style="${textStyle} font-weight: bold; color: var(--success);">${formatCurrency(Number(transaction.total) || Number(transaction.amount) || 0)}</td>
      <td data-label="Payment"><span class="badge ${isVoided ? 'badge-secondary' : 'badge-primary'}">${escapeHtml(transaction.paymentMethod || 'Cash')}</span></td>
      <td data-label="Actions">
        <button class="btn btn-sm btn-secondary btn-icon" onclick="event.stopPropagation(); viewTransaction('${transaction.id}')" title="View Details">
          <i class="ph ph-eye"></i>
        </button>
      </td>
    </tr>
  `}).join('');
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
          </div>
          <div class="item-total">
            ${formatCurrency(item.subtotal)}
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
        // Update stock
        product.stock += item.quantity;
        await db.update('products', product);

        // Record stock movement
        await db.add('stockMovements', {
          productId: product.id,
          productName: product.name, // Redundant but useful for logs
          type: 'in',
          quantity: item.quantity,
          reason: `Void Transaction: ${formatTransactionId(id)} `,
          date: new Date().toISOString(),
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
