// Delivery Expenses Management

// Filter deliveries by date
function filterDeliveriesByDate() {
    loadDeliveries();
}

// Load deliveries
async function loadDeliveries() {
    const deliveries = await db.getAll('deliveries');
    const users = await db.getAll('users');
    const userMap = {};
    users.forEach(u => {
        userMap[u.username] = u.name || u.username;
    });

    const tbody = document.getElementById('deliveriesTable');
    const dateFilter = document.getElementById('deliveriesDateFilter');
    const periodLabel = document.getElementById('deliveriesPeriodLabel');

    // Get current user's store
    const currentUser = auth.getCurrentUser();
    const storeId = currentUser?.storeId;

    // Filter by store
    const storeDeliveries = deliveries.filter(d => d.storeId === storeId);

    let finalDeliveries = [];
    let isDateFiltered = dateFilter && dateFilter.value;

    if (isDateFiltered) {
        // Filter by specific date
        const filterDateString = dateFilter.value;
        const filterDate = new Date(filterDateString).toDateString();

        finalDeliveries = storeDeliveries.filter(d =>
            new Date(d.date).toDateString() === filterDate
        );

        // Update label to show specific date
        if (periodLabel) {
            const dateObj = new Date(filterDateString);
            periodLabel.textContent = dateObj.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    } else {
        // Default: Filter by current month
        const currentMonthKey = getCurrentMonthKey();
        finalDeliveries = storeDeliveries.filter(d => {
            const deliveryMonth = getMonthKey(new Date(d.date));
            return deliveryMonth === currentMonthKey;
        });

        // Update label to show current month
        if (periodLabel) {
            const now = new Date();
            periodLabel.textContent = now.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric'
            });
        }
    }

    // Sort by date (newest first)
    const sortedDeliveries = finalDeliveries.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate stats
    const total = finalDeliveries.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const count = finalDeliveries.length;

    // Update stats UI
    const totalElement = document.getElementById('monthDeliveryTotal');
    const countElement = document.getElementById('monthDeliveryCount');

    // Update card title dynamically
    const totalCardTitle = totalElement?.closest('.stat-card')?.querySelector('h3');
    if (totalCardTitle) {
        totalCardTitle.textContent = isDateFiltered ? 'THIS DAY TOTAL' : 'THIS MONTH TOTAL';
    }

    if (totalElement) totalElement.textContent = formatCurrency(total);
    if (countElement) countElement.textContent = count;

    // Update Sidebar deliveries count badge
    const sidebarDeliveriesBadge = document.getElementById('sidebarDeliveriesBadge');
    if (sidebarDeliveriesBadge) {
        if (count > 0) {
            sidebarDeliveriesBadge.textContent = count;
            sidebarDeliveriesBadge.style.display = 'inline-flex';
        } else {
            sidebarDeliveriesBadge.style.display = 'none';
        }
    }

    // Render list
    if (sortedDeliveries.length === 0) {
        tbody.innerHTML = `<tr><td class="table-empty">No deliveries for ${isDateFiltered ? 'this date' : 'this month'}</td></tr>`;
    } else {
        tbody.innerHTML = sortedDeliveries.map(delivery => {
            const cashierName = userMap[delivery.cashier] || delivery.cashier || 'Unknown';
            return `
                <tr style="cursor: pointer; transition: background 0.2s;" 
                    onclick="viewDeliveryDetails('${delivery.id}')"
                    onmouseover="this.style.background='var(--light)'" 
                    onmouseout="this.style.background='white'">
                    <td style="padding: 0.75rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 0.25rem;">
                                    ${formatDateTime(delivery.date)}
                                </div>
                                <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary);">
                                    ${formatCurrency(delivery.amount)}
                                </div>
                                <div style="font-size: 0.8rem; color: var(--gray-500);">
                                    ${escapeHtml(cashierName)}
                                </div>
                            </div>
                            <button class="btn btn-sm btn-danger btn-icon" 
                                onclick="event.stopPropagation(); deleteDelivery('${delivery.id}')" 
                                title="Delete"
                                style="flex-shrink: 0;">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// View delivery details in modal
function viewDeliveryDetails(id) {
    // Find the delivery
    db.getAll('deliveries').then(deliveries => {
        const delivery = deliveries.find(d => d.id === id);
        if (!delivery) {
            showToast('Delivery not found', 'error');
            return;
        }

        // Get user info
        db.getAll('users').then(users => {
            const userMap = {};
            users.forEach(u => {
                userMap[u.username] = u.name || u.username;
            });

            const cashierName = userMap[delivery.cashier] || delivery.cashier || 'Unknown';

            // Show modal
            const modal = document.getElementById('viewDeliveryModal');
            const noteContainer = document.getElementById('viewDeliveryNoteContainer');

            document.getElementById('viewDeliveryDate').textContent = formatDateTime(delivery.date);
            document.getElementById('viewDeliveryAmount').textContent = formatCurrency(delivery.amount);
            document.getElementById('viewDeliveryCashier').textContent = cashierName;
            document.getElementById('viewDeliveryId').textContent = delivery.id;

            // Show/hide note based on whether it exists
            if (delivery.note && delivery.note.trim()) {
                document.getElementById('viewDeliveryNote').textContent = delivery.note;
                noteContainer.style.display = 'block';
            } else {
                noteContainer.style.display = 'none';
            }

            // Update delete button
            const deleteBtn = document.getElementById('btnDeleteDelivery');
            if (deleteBtn) {
                // Ensure the button calls deleteDelivery with the correct ID
                deleteBtn.onclick = () => deleteDelivery(delivery.id);
            }

            modal.classList.add('active');
        });
    });
}

// Populate month filter dropdown
function populateMonthFilter(deliveries) {
    const monthFilter = document.getElementById('deliveriesMonthFilter');
    if (!monthFilter) return;

    // Get unique months from deliveries
    const months = new Set();
    deliveries.forEach(d => {
        months.add(getMonthKey(new Date(d.date)));
    });

    // Always include current month
    months.add(getCurrentMonthKey());

    // Sort months (newest first)
    const sortedMonths = Array.from(months).sort().reverse();

    // Save current selection
    const currentSelection = monthFilter.value;

    // Populate dropdown
    monthFilter.innerHTML = sortedMonths.map(monthKey => {
        const date = parseMonthKey(monthKey);
        const label = formatMonthLabel(date);
        return `<option value="${monthKey}">${label}</option>`;
    }).join('');

    // Restore selection or default to current month
    if (sortedMonths.includes(currentSelection)) {
        monthFilter.value = currentSelection;
    } else {
        monthFilter.value = getCurrentMonthKey();
    }
}

// Update monthly history display
function updateMonthlyHistory(deliveries) {
    const historyContainer = document.getElementById('deliveryMonthlyHistory');
    if (!historyContainer) return;

    // Group by month
    const monthlyTotals = {};
    deliveries.forEach(d => {
        const monthKey = getMonthKey(new Date(d.date));
        if (!monthlyTotals[monthKey]) {
            monthlyTotals[monthKey] = { total: 0, count: 0 };
        }
        monthlyTotals[monthKey].total += Number(d.amount) || 0;
        monthlyTotals[monthKey].count++;
    });

    // Sort by month (newest first)
    const sortedMonths = Object.keys(monthlyTotals).sort().reverse();

    // Limit to last 6 months
    const recentMonths = sortedMonths.slice(0, 6);

    if (recentMonths.length === 0) {
        historyContainer.innerHTML = '<p style="color: var(--gray-600); text-align: center;">No history yet</p>';
        return;
    }

    historyContainer.innerHTML = recentMonths.map(monthKey => {
        const date = parseMonthKey(monthKey);
        const label = formatMonthLabel(date);
        const data = monthlyTotals[monthKey];
        const isCurrentMonth = monthKey === getCurrentMonthKey();

        return `
            <div style="padding: 1rem; background: white; border-radius: var(--radius-md); border-left: 4px solid ${isCurrentMonth ? 'var(--primary)' : 'var(--gray-300)'};">
                <div style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 0.25rem;">
                    ${label} ${isCurrentMonth ? '(Current)' : ''}
                </div>
                <div style="font-size: 1.25rem; font-weight: 700; color: var(--dark); margin-bottom: 0.25rem;">
                    ${formatCurrency(data.total)}
                </div>
                <div style="font-size: 0.75rem; color: var(--gray-500);">
                    ${data.count} ${data.count === 1 ? 'delivery' : 'deliveries'}
                </div>
            </div>
        `;
    }).join('');
}

// Show add delivery modal
function showAddDeliveryModal() {
    const modal = document.getElementById('addDeliveryModal');
    const form = document.getElementById('addDeliveryForm');

    // Reset form
    form.reset();

    // Set current date/time (local timezone)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const dateTimeString = `${year}-${month}-${day}T${hours}:${minutes}`;
    document.getElementById('deliveryDate').value = dateTimeString;

    modal.classList.add('active');

    // Focus on amount field
    setTimeout(() => {
        document.getElementById('deliveryAmount').focus();
    }, 100);
}

// Close add delivery modal
function closeAddDeliveryModal() {
    document.getElementById('addDeliveryModal').classList.remove('active');
}

// Close view delivery modal
function closeViewDeliveryModal() {
    document.getElementById('viewDeliveryModal').classList.remove('active');
}

// Save delivery
async function saveDelivery() {
    const amount = parseFloat(document.getElementById('deliveryAmount').value);
    const date = document.getElementById('deliveryDate').value;
    const note = document.getElementById('deliveryNote').value.trim();

    // Validation
    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'warning');
        return;
    }

    if (!date) {
        showToast('Please select a date and time', 'warning');
        return;
    }

    showLoading('Saving delivery...');

    try {
        const currentUser = auth.getCurrentUser();
        const deliveryDate = new Date(date);

        const delivery = {
            amount: amount,
            date: deliveryDate.toISOString(),
            month: getMonthKey(deliveryDate),
            note: note || '',
            cashier: currentUser.username,
            storeId: currentUser.storeId,
            createdAt: new Date().toISOString()
        };

        const deliveryId = await db.add('deliveries', delivery);

        // Real-time notification
        try {
            if (typeof db.notify === 'function') {
                const adminName = auth.getCurrentUser()?.name || auth.getCurrentUser()?.username || 'Admin';
                const formattedAmount = typeof formatCurrency === 'function' ? formatCurrency(amount) : `₱${amount.toFixed(2)}`;

                await db.notify(
                    'delivery',
                    'New Delivery Added',
                    `${adminName} added a delivery expense of ${formattedAmount}`,
                    {
                        deliveryId: deliveryId,
                        user: adminName,
                        amount: amount,
                        action: 'add'
                    }
                );
            }
        } catch (notifError) {
            console.warn('Notification skipped:', notifError);
            // Continue execution, don't block main flow
        }

        showToast('Delivery expense added successfully', 'success');
        closeAddDeliveryModal();
        await loadDeliveries();

        // Refresh dashboard stats if on dashboard tab
        if (typeof loadDashboardWithRange === 'function') {
            await loadDashboardWithRange((typeof currentTimeRange !== 'undefined') ? currentTimeRange : 'today', true);
        }

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error saving delivery:', error);
        showToast('Error saving delivery: ' + error.message, 'error');
    }
}

// Delete delivery
async function deleteDelivery(id) {
    if (!confirm('Are you sure you want to delete this delivery expense?')) return;

    showLoading('Deleting delivery...');
    try {
        await db.remove('deliveries', id);
        showToast('Delivery deleted successfully', 'success');

        // Close view modal if it's open (e.g. deleted from details view)
        if (typeof closeViewDeliveryModal === 'function') {
            closeViewDeliveryModal();
        }
        await loadDeliveries();

        // Refresh dashboard stats if on dashboard tab
        if (typeof loadDashboardWithRange === 'function') {
            await loadDashboardWithRange((typeof currentTimeRange !== 'undefined') ? currentTimeRange : 'today', true);
        }

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error deleting delivery:', error);
        showToast('Error deleting delivery: ' + error.message, 'error');
    }
}

// Helper functions
function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(monthKey) {
    const [year, month] = monthKey.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, 1);
}

function formatMonthLabel(date) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Export functions
window.loadDeliveries = loadDeliveries;
window.showAddDeliveryModal = showAddDeliveryModal;
window.closeAddDeliveryModal = closeAddDeliveryModal;
window.closeViewDeliveryModal = closeViewDeliveryModal;
window.viewDeliveryDetails = viewDeliveryDetails;
window.saveDelivery = saveDelivery;
window.deleteDelivery = deleteDelivery;

// Close modal on outside click
document.addEventListener('click', (e) => {
    if (e.target.id === 'addDeliveryModal') {
        closeAddDeliveryModal();
    }
    if (e.target.id === 'viewDeliveryModal') {
        closeViewDeliveryModal();
    }
});
