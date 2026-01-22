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
    <tr style="${rowStyle}">
      <td>
        ${formatTransactionId(transaction.id)}
        ${isVoided ? '<span class="badge badge-danger" style="margin-left: 0.5rem; font-size: 0.7rem;">VOIDED</span>' : ''}
      </td>
      <td style="${textStyle}">${formatDateTime(transaction.date)}</td>
      <td style="${textStyle}">${escapeHtml(cashierDisplay)}</td>
      <td style="${textStyle}">${escapeHtml(transaction.customerName || 'Walk-in')}</td>
      <td style="${textStyle}">${transaction.items.length} items</td>
      <td style="${textStyle}">${formatCurrency(transaction.total)}</td>
      <td><span class="badge ${isVoided ? 'badge-secondary' : 'badge-primary'}">${escapeHtml(transaction.paymentMethod)}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary btn-icon" onclick="viewTransaction('${transaction.id}')" title="View Details">
          👁️
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
    <div style="margin-bottom: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <h3 style="margin-bottom: 1rem; color: var(--dark);">Transaction ${formatTransactionId(transaction.id)}</h3>
        ${transaction.status === 'voided'
      ? '<span class="badge badge-danger" style="font-size: 1rem; padding: 0.5rem 1rem;">VOIDED</span>'
      : '<button onclick="initiateVoidTransaction(\'' + transaction.id + '\')" class="btn btn-danger btn-sm">⛔ Void Transaction</button>'}
      </div>
      
      ${transaction.status === 'voided' ? `
      <div style="background-color: #fee2e2; color: #b91c1c; padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 1rem;">
        <strong>Void Reason:</strong> ${escapeHtml(transaction.voidReason || 'No reason provided')}
      </div>` : ''}

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <p style="color: var(--gray-600); font-size: 0.875rem; margin-bottom: 0.25rem;">Date & Time</p>
          <p style="font-weight: 600;">${formatDateTime(transaction.date)}</p>
        </div>
        <div>
          <p style="color: var(--gray-600); font-size: 0.875rem; margin-bottom: 0.25rem;">Cashier</p>
          <p style="font-weight: 600;">${escapeHtml(transaction.cashier)}</p>
        </div>
        <div>
          <p style="color: var(--gray-600); font-size: 0.875rem; margin-bottom: 0.25rem;">Customer</p>
          <p style="font-weight: 600;">${escapeHtml(transaction.customerName || 'Walk-in Customer')}</p>
        </div>
        <div>
          <p style="color: var(--gray-600); font-size: 0.875rem; margin-bottom: 0.25rem;">Payment Method</p>
          <p style="font-weight: 600;">${escapeHtml(transaction.paymentMethod)}</p>
        </div>
      </div>
    </div>

    <h4 style="margin-bottom: 1rem; color: var(--dark);">Items</h4>
    <table class="data-table" style="margin-bottom: 1.5rem;">
      <thead>
        <tr>
          <th>Product</th>
          <th>Price</th>
          <th>Qty</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${transaction.items.map(item => `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${formatCurrency(item.price)}</td>
            <td>${item.quantity}</td>
            <td>${formatCurrency(item.subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="border-top: 2px solid var(--gray-200); padding-top: 1rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span>Subtotal:</span>
        <strong>${formatCurrency(transaction.subtotal)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 1.25rem; color: var(--primary); margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--gray-300);">
        <strong>Total:</strong>
        <strong>${formatCurrency(transaction.total)}</strong>
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
          reason: `Void Transaction: ${formatTransactionId(id)}`,
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
