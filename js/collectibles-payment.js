// Collectibles Payment & Tab Management

let currentCollectibleForPayment = null;
let currentCollectiblesTab = 'active';

// Tab switching
window.switchCollectiblesTab = function (tab) {
    currentCollectiblesTab = tab;

    // Update button states
    document.querySelectorAll('.collectibles-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tab) {
            btn.classList.add('active');
        }
    });

    // Show/hide lists
    const activeList = document.getElementById('activeCollectiblesList');
    const archivesList = document.getElementById('archivesCollectiblesList');

    if (tab === 'active') {
        activeList.style.display = 'block';
        archivesList.style.display = 'none';
    } else {
        activeList.style.display = 'none';
        archivesList.style.display = 'block';
    }

    // Load appropriate data
    loadCollectibles();
};

// Show payment modal
window.showCollectPaymentModal = function (collectibleId) {
    const modal = document.getElementById('collectPaymentModal');

    // Find the collectible
    db.get('collectibles', collectibleId).then(collectible => {
        if (!collectible) {
            showToast('Collectible not found', 'error');
            return;
        }

        currentCollectibleForPayment = collectible;
        const balance = collectible.totalAmount - (collectible.paidAmount || 0);

        // Populate modal
        document.getElementById('paymentCustomerName').textContent = collectible.customerName;
        document.getElementById('paymentTotalAmount').textContent = formatCurrency(collectible.totalAmount);
        document.getElementById('paymentBalance').textContent = formatCurrency(balance);
        document.getElementById('paymentAmount').value = balance.toFixed(2);
        document.getElementById('paymentNotes').value = '';

        modal.style.display = 'flex';
    });
};

window.closeCollectPaymentModal = function () {
    document.getElementById('collectPaymentModal').style.display = 'none';
    currentCollectibleForPayment = null;
};

// Save payment
window.savePayment = async function () {
    if (!currentCollectibleForPayment) return;

    const paymentAmount = Number(parseFloat(document.getElementById('paymentAmount').value));
    const paymentNotes = document.getElementById('paymentNotes').value.trim();

    if (!paymentAmount || isNaN(paymentAmount) || paymentAmount <= 0) {
        showToast('Please enter a valid payment amount', 'warning');
        return;
    }

    const balance = currentCollectibleForPayment.totalAmount - (currentCollectibleForPayment.paidAmount || 0);

    if (paymentAmount > balance) {
        showToast('Payment amount cannot exceed balance', 'warning');
        return;
    }

    showLoading('Processing payment...');

    try {
        const user = auth.getCurrentUser();
        const newPaidAmount = (currentCollectibleForPayment.paidAmount || 0) + paymentAmount;
        const newStatus = newPaidAmount >= currentCollectibleForPayment.totalAmount ? 'paid' : 'unpaid';

        // Update collectible
        await db.update('collectibles', {
            id: currentCollectibleForPayment.id,
            paidAmount: newPaidAmount,
            status: newStatus,
            updatedAt: new Date().toISOString()
        });

        // Record payment as a transaction (for sales tracking on payment date)
        await db.add('transactions', {
            type: 'collectible_payment',
            collectibleId: currentCollectibleForPayment.id,
            customerName: currentCollectibleForPayment.customerName,
            items: currentCollectibleForPayment.items,
            subtotal: paymentAmount,
            tax: 0,
            total: paymentAmount,
            amountPaid: paymentAmount,
            change: 0,
            paymentMethod: 'cash',
            cashier: user.username,
            cashierName: user.name || user.username,
            storeId: user.storeId,
            date: new Date().toISOString(),
            notes: paymentNotes || `Payment for collectible - ${currentCollectibleForPayment.customerName}`
        });

        hideLoading();
        showToast('Payment collected successfully!', 'success');
        closeCollectPaymentModal();
        loadCollectibles();

    } catch (error) {
        hideLoading();
        console.error('Error saving payment:', error);
        showToast('Error saving payment: ' + error.message, 'error');
    }
};
