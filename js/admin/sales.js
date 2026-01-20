// Sales Management

// Load sales
async function loadSales() {
  const transactions = await db.getAll('transactions');
  const tbody = document.getElementById('salesTable');

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No sales yet</td></tr>';
    return;
  }

  // Sort by date (newest first)
  const sortedTransactions = transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  tbody.innerHTML = sortedTransactions.map(transaction => `
    <tr>
      <td>${formatTransactionId(transaction.id)}</td>
      <td>${formatDateTime(transaction.date)}</td>
      <td>${escapeHtml(transaction.cashier)}</td>
      <td>${escapeHtml(transaction.customerName || 'Walk-in')}</td>
      <td>${transaction.items.length} items</td>
      <td>${formatCurrency(transaction.total)}</td>
      <td><span class="badge badge-primary">${escapeHtml(transaction.paymentMethod)}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary btn-icon" onclick="viewTransaction('${transaction.id}')" title="View Details">
          👁️
        </button>
      </td>
    </tr>
  `).join('');
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
      <h3 style="margin-bottom: 1rem; color: var(--dark);">Transaction ${formatTransactionId(transaction.id)}</h3>
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

      <!--
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span>Tax (10%):</span>
        <strong>${formatCurrency(transaction.tax)}</strong>
      </div>
      -->
      <div style="display: flex; justify-content: space-between; font-size: 1.25rem; color: var(--primary); margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--gray-300);">
        <strong>Total:</strong>
        <strong>${formatCurrency(transaction.total)}</strong>
      </div>
    </div>
  `;

  document.getElementById('transactionDetails').innerHTML = detailsHtml;
  document.getElementById('transactionModal').classList.add('active');
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
