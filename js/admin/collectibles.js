// Collectibles Management
const collectiblesPaginator = new PaginationManager(5);

let currentCollectiblesFilter = 'all';
let currentCollectiblesSearch = '';
let currentCollectibleStatus = 'pending'; // 'pending' (unpaid/partial) or 'paid'

// Load collectibles
async function loadCollectibles() {
    const listContainer = document.getElementById('collectiblesList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="table-empty">Loading collectibles...</div>';

    try {
        const user = auth.getCurrentUser();
        const allCollectibles = await db.getAll('collectibles');
        let storeCollectibles = allCollectibles.filter(c => c.storeId === user.storeId);

        // Apply Status Filter
        if (currentCollectibleStatus === 'pending') {
            storeCollectibles = storeCollectibles.filter(c => c.status !== 'paid');
        } else if (currentCollectibleStatus === 'paid') {
            storeCollectibles = storeCollectibles.filter(c => c.status === 'paid');
        }

        // Apply Search
        if (currentCollectiblesSearch) {
            const query = currentCollectiblesSearch.toLowerCase();
            storeCollectibles = storeCollectibles.filter(c =>
                (c.customerName && c.customerName.toLowerCase().includes(query))
            );
        }

        // Apply Date Filter
        const filteredByDate = filterCollectiblesByDate(storeCollectibles, currentCollectiblesFilter);

        // Sort by date (newest first)
        const sortedCollectibles = filteredByDate.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.date);
            const dateB = new Date(b.createdAt || b.date);
            return dateB - dateA;
        });

        // Update stats using the full list for the store (not just the filtered ones)
        updateCollectibleStats(storeCollectibles);

        if (sortedCollectibles.length === 0) {
            listContainer.innerHTML = '<div class="table-empty">No collectibles found</div>';
            const container = document.getElementById('collectiblesPaginationContainer');
            if (container) container.innerHTML = '';
            return;
        }

        // Pagination
        const paginated = collectiblesPaginator.paginate(sortedCollectibles);
        const displayCollectibles = paginated.data;

        listContainer.innerHTML = displayCollectibles.map(c => {
            const balance = c.totalAmount - (c.paidAmount || 0);
            const statusClass = c.status === 'paid' ? 'badge-success' : (c.paidAmount > 0 ? 'badge-warning' : 'badge-danger');
            const statusText = c.status === 'paid' ? 'Paid' : (c.paidAmount > 0 ? 'Partial' : 'Unpaid');
            const dateDisplay = c.updatedAt ? c.updatedAt : (c.createdAt || c.date);

            return `
                <div class="collectible-card" onclick="viewCollectibleDetails('${c.id}')" style="cursor: pointer; border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.75rem; background: var(--white); display: flex; flex-direction: column; gap: 0.75rem; transition: all 0.2s; position: relative;">
                    
                    <!-- Header: Name & Amount -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-weight: 700; color: var(--dark); font-size: 1.1rem; margin-bottom: 2px;">
                                ${escapeHtml(c.customerName)}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--gray-500);">
                                ${formatDateTime(dateDisplay)}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="color: ${balance > 0 ? 'var(--dark)' : 'var(--success)'}; font-weight: 800; font-size: 1.25rem;">
                                ${formatCurrency(balance)}
                            </div>
                        </div>
                    </div>

                    <!-- Divider -->
                    <div style="height: 1px; background: var(--gray-100); width: 100%;"></div>

                    <!-- Details: Items & Balance Text -->
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                        <span style="color: var(--gray-600); font-weight: 500;">
                            ${c.items.length} item${c.items.length !== 1 ? 's' : ''} &bull; Balance: ${formatCurrency(balance)}
                        </span>
                    </div>

                    <!-- Footer: Status -->
                    <div style="display: flex; justify-content: flex-start;">
                        <span class="badge ${statusClass}" style="font-size: 0.75rem; padding: 0.4rem 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            ${statusText}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        // Render Pagination Controls
        let paginationContainer = document.getElementById('collectiblesPaginationContainer');
        // listContainer is the grid. We want controls below it.
        if (!paginationContainer && listContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'collectiblesPaginationContainer';
            // listContainer is inside a .table-container (based on admin.html structure)
            // But let's verify. Yes, line 457 of admin.html shows it's inside .table-container
            listContainer.closest('.table-container').appendChild(paginationContainer);
        }

        collectiblesPaginator.renderControls('collectiblesPaginationContainer', paginated.totalPages, (page) => {
            collectiblesPaginator.setPage(page);
            loadCollectibles();
        });

        setupCollectiblesFilters();

    } catch (error) {
        console.error('Error loading collectibles:', error);
        listContainer.innerHTML = `<div class="table-empty">Error loading data: ${error.message}</div>`;
    }
}

function updateCollectibleStats(collectibles) {
    // 1. Calculate General Totals (for all pending items in the store)
    const totalAmount = collectibles.reduce((sum, c) => sum + (Number(c.totalAmount) || 0), 0);
    const totalPaid = collectibles.reduce((sum, c) => sum + (Number(c.paidAmount) || 0), 0);
    const globalOutstanding = totalAmount - totalPaid;

    // 2. Calculate "Today" specifically (New Debt Issued Today)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayAmount = collectibles.reduce((sum, c) => {
        let amountInPeriod = 0;
        const cDate = new Date(c.createdAt || c.date);
        const isDocCreatedInRange = cDate >= todayStart && cDate < todayEnd;

        // Document itself created today
        if (isDocCreatedInRange) {
            const total = Number(c.totalAmount) || 0;
            const paid = Number(c.paidAmount) || 0;
            amountInPeriod = total - paid;
        }
        // Old document, but check for new items added today
        else if (c.items && c.items.length > 0) {
            amountInPeriod = c.items.reduce((isum, i) => {
                if (i.dateAdded) {
                    const iDate = new Date(i.dateAdded);
                    if (iDate >= todayStart && iDate < todayEnd) {
                        return isum + (Number(i.total) || 0);
                    }
                }
                return isum;
            }, 0);
        }
        return sum + amountInPeriod;
    }, 0);

    // Update the UI
    const valueEl = document.getElementById('todayCollectiblesAmount');
    const labelEl = valueEl?.closest('.stat-info')?.querySelector('h3');

    if (currentCollectiblesFilter === 'today') {
        if (labelEl) labelEl.textContent = "TODAY'S COLLECTIBLES";
        if (valueEl) valueEl.textContent = formatCurrency(todayAmount);
    } else if (currentCollectiblesFilter === 'all' || currentCollectiblesFilter === 'recent') {
        if (labelEl) labelEl.textContent = "TOTAL OUTSTANDING";
        if (valueEl) valueEl.textContent = formatCurrency(globalOutstanding);
    } else {
        // For other ranges (yesterday, month, etc.), show the balance of current selection
        let rangeLabel = "PERIOD OUTSTANDING";
        if (currentCollectiblesFilter === 'yesterday') rangeLabel = "YESTERDAY'S BALANCE";
        if (currentCollectiblesFilter === 'thisMonth') rangeLabel = "THIS MONTH'S BALANCE";
        if (currentCollectiblesFilter === 'last7days') rangeLabel = "LAST 7 DAYS BALANCE";

        if (labelEl) labelEl.textContent = rangeLabel;

        // Use the balance of the filtered set
        const filteredBalance = collectibles.reduce((sum, c) => {
            // Only count if it passes the date filter (since we passed storeCollectibles to this func)
            // Wait, to be safe, if we are in this 'else', we should probably have pre-filtered the list
            // But loadCollectibles passes storeCollectibles (all pending).
            // So we re-apply the filter here to get the correct display value.
            const filterRes = filterCollectiblesByDate([c], currentCollectiblesFilter);
            if (filterRes.length > 0) {
                return sum + (Number(c.totalAmount) - Number(c.paidAmount || 0));
            }
            return sum;
        }, 0);

        if (valueEl) valueEl.textContent = formatCurrency(filteredBalance);
    }

    // Also update a global outstanding if that element exists elsewhere
    const outstandingEl = document.getElementById('totalOutstandingAmount');
    if (outstandingEl) outstandingEl.textContent = formatCurrency(globalOutstanding);
}

// Filter collectibles helper
function filterCollectiblesByDate(collectibles, filter) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    const last7DaysStart = new Date(todayStart);
    last7DaysStart.setDate(last7DaysStart.getDate() - 7);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return collectibles.filter(c => {
        const date = new Date(c.createdAt || c.date);

        // Check for items added in the range for more accurate activity filtering
        const hasItemsInRange = (start, end) => {
            if (!c.items || c.items.length === 0) return false;
            return c.items.some(i => {
                if (!i.dateAdded) return false;
                const iDate = new Date(i.dateAdded);
                return iDate >= start && iDate < end;
            });
        };

        switch (filter) {
            case 'today':
                return (date >= todayStart && date < todayEnd) || hasItemsInRange(todayStart, todayEnd);
            case 'yesterday':
                return (date >= yesterdayStart && date < yesterdayEnd) || hasItemsInRange(yesterdayStart, yesterdayEnd);
            case 'last7days':
                return date >= last7DaysStart || hasItemsInRange(last7DaysStart, todayEnd);
            case 'thisMonth':
                return date >= thisMonthStart || hasItemsInRange(thisMonthStart, todayEnd);
            case 'recent':
                return true;
            case 'all':
            default:
                return true;
        }
    });
}

function setupCollectiblesFilters() {
    const searchInput = document.getElementById('collectiblesSearch');
    const filterSelect = document.getElementById('collectiblesFilter');

    if (searchInput) {
        // Remove old listeners to avoid duplicates if called multiple times (though simple assignment overwrites property listeners, addEventListener accumulates. Better to check or use a flag, but simple check here)
        // Actually best place to call this is once. But loadCollectibles might be called multiple times.
        // Let's attach only if not already attached? Or just attach once in main admin.js?
        // For self-contained file, let's just make sure we don't duplicate logic. 
        // We will replace the element to clear listeners or just use onchange property which is singular.

        searchInput.oninput = debounce((e) => {
            currentCollectiblesSearch = e.target.value.trim();
            loadCollectibles();
        }, 300);
    }

    if (filterSelect) {
        filterSelect.onchange = (e) => {
            currentCollectiblesFilter = e.target.value;
            loadCollectibles();
        };
        // Set initial value
        if (filterSelect.value !== currentCollectiblesFilter) {
            filterSelect.value = currentCollectiblesFilter;
        }
    }
}

// View Collectible Details
window.viewCollectibleDetails = async function (id) {
    try {
        const collectible = await db.get('collectibles', id);
        if (!collectible) {
            showToast('Collectible not found', 'error');
            return;
        }

        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.zIndex = '10000';

        const balance = collectible.totalAmount - (collectible.paidAmount || 0);
        const statusClass = collectible.status === 'paid' ? 'badge-success' : (collectible.paidAmount > 0 ? 'badge-warning' : 'badge-danger');
        const statusText = collectible.status === 'paid' ? 'Paid' : (collectible.paidAmount > 0 ? 'Partial' : 'Unpaid');

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Collectible Details</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; margin-bottom: 1.5rem;">
                        <div style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem;">${escapeHtml(collectible.customerName)}</div>
                        <div style="color: var(--gray-500); font-size: 0.9rem;">
                            Created on ${new Date(collectible.createdAt).toLocaleString()}
                        </div>
                        <div style="margin-top: 0.5rem;">
                             <span class="badge ${statusClass}">${statusText}</span>
                        </div>
                    </div>

                    <div style="background: var(--light); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="color: var(--gray-600);">Total Amount</span>
                            <span style="font-weight: 600;">${formatCurrency(collectible.totalAmount)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="color: var(--gray-600);">Paid Amount</span>
                            <span style="font-weight: 600; color: var(--success);">${formatCurrency(collectible.paidAmount || 0)}</span>
                        </div>
                        <div style="border-top: 1px dashed var(--gray-300); margin: 0.5rem 0;"></div>
                        <div style="display: flex; justify-content: space-between; font-size: 1.1rem;">
                            <span style="font-weight: 600;">Balance</span>
                            <span style="font-weight: 700; color: ${balance > 0 ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(balance)}</span>
                        </div>
                    </div>

                    <h4 style="margin-bottom: 0.5rem; border-bottom: 1px solid var(--gray-200); padding-bottom: 0.5rem;">Items</h4>
                    <div style="max-height: 200px; overflow-y: auto; margin-bottom: 1rem;">
                        ${collectible.items.map(item => `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                <div>
                                    <div>${escapeHtml(item.name)}</div>
                                    <div style="font-size: 0.8rem; color: var(--gray-500);">
                                        ${item.quantity} x ${formatCurrency(item.price)}
                                    </div>
                                </div>
                                <div style="font-weight: 500;">
                                    ${formatCurrency(item.total)}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    ${collectible.notes ? `
                        <div style="margin-top: 1rem;">
                            <h4 style="font-size: 0.9rem; margin-bottom: 0.25rem;">Notes</h4>
                            <div style="background: #fff; border: 1px solid var(--gray-200); padding: 0.75rem; border-radius: 4px; font-size: 0.9rem; color: var(--gray-700);">
                                ${escapeHtml(collectible.notes)}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 1rem; font-size: 0.85rem; color: var(--gray-500); text-align: right;">
                        Processed by: ${collectible.cashierName || collectible.cashier}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-danger" onclick="deleteCollectible('${collectible.id}')" style="margin-right: auto;">Delete</button>
                    <button class="btn btn-primary" onclick="showEditBalanceModal('${collectible.id}', ${balance})" style="margin-right: 0.5rem;">Edit Balance</button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

    } catch (error) {
        console.error('Error viewing collectible:', error);
        showToast('Error loading details', 'error');
    }
};

window.deleteCollectible = async function (id) {
    if (!confirm('Are you sure you want to delete this collectible record? This action cannot be undone.')) {
        return;
    }

    try {
        await db.remove('collectibles', id);

        // Remove the modal
        const modal = document.querySelector('.modal.active');
        if (modal) modal.remove();

        // Reload list
        loadCollectibles();

        showToast('Collectible deleted successfully', 'success');

        // Update dashboard if applicable
        if (typeof loadDashboard === 'function') {
            loadDashboard();
        }

    } catch (error) {
        console.error('Error deleting collectible:', error);
        showToast('Error deleting record', 'error');
    }
};

// Helper for direct payment from details
window.showPaymentModalFromInfo = function (id) {
    // Check if we are in admin context, payment might differ or re-use logic.
    // For now, let's just close details and rely on standard flow or just show a toast that 
    // payment recording is a cashier function? 
    // Looking at the codebase, admins CAN see payments but recording might be better in cashier view or we need to add admin payment logic.
    // The user didn't ask for payment logic here, just "details error".
    // I'll leave the button but just close the modal for now or show "feature not available".
    // Actually, usually admin monitors. Let's just remove the button logic or redirect.
    // Ideally admin should be able to record payment too. 

    // For now, let's keep it simple and just show a message.
    showToast('Please use Cashier interface to record payments.', 'info');
};

// Global toggle for Pending vs Paid
window.filterByCollectibleStatus = function (status) {
    currentCollectibleStatus = status;

    // Update UI buttons
    const btnPending = document.getElementById('btnCollectiblesPending');
    const btnPaid = document.getElementById('btnCollectiblesPaid');

    if (btnPending && btnPaid) {
        if (status === 'pending') {
            btnPending.classList.add('active', 'btn-primary');
            btnPending.classList.remove('btn-secondary');
            btnPaid.classList.add('btn-secondary');
            btnPaid.classList.remove('active', 'btn-primary');
        } else {
            btnPaid.classList.add('active', 'btn-primary');
            btnPaid.classList.remove('btn-secondary');
            btnPending.classList.add('btn-secondary');
            btnPending.classList.remove('active', 'btn-primary');
        }
    }

    loadCollectibles();
};

// Show Edit Balance Modal
window.showEditBalanceModal = function (id, currentBalance) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '10001'; // Above details modal
    modal.id = 'editBalanceModal';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 350px;">
            <div class="modal-header">
                <h3>Edit Balance</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 1rem; color: var(--gray-600); font-size: 0.9rem;">
                    Enter the new correct balance. An adjustment item will be added to the history to reconcile the difference.
                </p>
                <div class="form-group">
                    <label>New Balance</label>
                    <input type="number" id="newBalanceInput" class="form-control" value="${currentBalance}" step="0.01">
                </div>
            </div>
            <div class="modal-footer">
                 <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                 <button class="btn btn-primary" onclick="saveBalanceUpdate('${id}')">Save Changes</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('newBalanceInput').focus(), 100);
};

// Save Balance Update
window.saveBalanceUpdate = async function (id) {
    const input = document.getElementById('newBalanceInput');
    if (!input) return;

    const newBalance = parseFloat(input.value);
    if (isNaN(newBalance)) {
        showToast('Please enter a valid number', 'error');
        return;
    }

    try {
        const collectible = await db.get('collectibles', id);
        if (!collectible) {
            showToast('Record not found', 'error');
            return;
        }

        const currentTotal = Number(collectible.totalAmount) || 0;
        const currentPaid = Number(collectible.paidAmount) || 0;
        const currentBalance = currentTotal - currentPaid;

        if (Math.abs(newBalance - currentBalance) < 0.01) {
            input.closest('.modal').remove(); // No change
            return;
        }

        // Logic: newBalance = newTotal - currentPaid
        // So: newTotal = newBalance + currentPaid
        const newTotal = newBalance + currentPaid;
        const difference = newTotal - currentTotal;

        // Create adjustment item
        const adjustmentItem = {
            id: Date.now().toString(),
            name: "Manual Balance Adjustment",
            price: difference,
            quantity: 1,
            total: difference,
            dateAdded: new Date().toISOString()
        };

        const items = collectible.items || [];
        items.push(adjustmentItem);

        await db.update('collectibles', {
            id: id,
            totalAmount: newTotal,
            items: items,
            updatedAt: new Date().toISOString()
        });

        showToast('Balance updated successfully', 'success');

        // Close edit modal
        input.closest('.modal').remove();

        // Refresh details modal
        const detailsModal = document.querySelector('.modal[style*="z-index: 10000"]');
        if (detailsModal) detailsModal.remove();
        viewCollectibleDetails(id);

        // Refresh list
        loadCollectibles();

    } catch (error) {
        console.error('Error updating balance:', error);
        showToast('Error updating balance: ' + error.message, 'error');
    }
};
