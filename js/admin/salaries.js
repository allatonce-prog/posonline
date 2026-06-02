// Salaries Management

// Filter salaries by month
function filterSalariesByMonth() {
    loadSalaries();
}

// Load salaries
async function loadSalaries() {
    const salaries = await db.getAll('salaries');
    const users = await db.getAll('users');
    const userMap = {};
    users.forEach(u => {
        userMap[u.username] = u.name || u.username;
    });

    const tbody = document.getElementById('salariesTable');
    const dateFilter = document.getElementById('salariesMonthFilter');
    const periodLabel = document.getElementById('salariesPeriodLabel');

    // Get current user's store
    const currentUser = auth.getCurrentUser();
    const storeId = currentUser?.storeId;

    // Filter by store
    const storeSalaries = salaries.filter(s => s.storeId === storeId);

    let finalSalaries = [];
    let isFiltered = dateFilter && dateFilter.value;

    if (isFiltered) {
        // filter by selected YYYY-MM
        const filterVal = dateFilter.value; // e.g., "2026-02"
        finalSalaries = storeSalaries.filter(s => {
            const dateObj = new Date(s.date);
            const sMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            return sMonth === filterVal;
        });

        // Update label
        if (periodLabel) {
            const [y, m] = filterVal.split('-');
            const dateObj = new Date(y, m - 1);
            periodLabel.textContent = dateObj.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric'
            });
        }
    } else {
        // Default: Filter by current month
        const now = new Date();
        const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        finalSalaries = storeSalaries.filter(s => {
            const dateObj = new Date(s.date);
            const sMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            return sMonth === currentMonthVal;
        });

        // Set default filter value if empty
        if (dateFilter && !dateFilter.value) {
            dateFilter.value = currentMonthVal;
        }

        // Update label
        if (periodLabel) {
            periodLabel.textContent = now.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric'
            });
        }
    }

    // Sort by date (newest first)
    const sortedSalaries = finalSalaries.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate stats
    const total = sortedSalaries.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const count = sortedSalaries.length;

    // Update stats UI
    const totalElement = document.getElementById('monthSalariesTotal');
    const countElement = document.getElementById('monthSalariesCount');

    if (totalElement) totalElement.textContent = typeof formatCurrency === 'function' ? formatCurrency(total) : `₱${total.toFixed(2)}`;
    if (countElement) countElement.textContent = count;

    // Render list
    if (sortedSalaries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No salaries recorded for this period</td></tr>`;
    } else {
        tbody.innerHTML = sortedSalaries.map(salary => {
            return `
                <tr style="transition: background 0.2s;" onmouseover="this.style.background='var(--light)'" onmouseout="this.style.background='white'">
                    <td style="padding: 0.75rem;">${typeof formatDateTime === 'function' ? formatDateTime(salary.date) : new Date(salary.date).toLocaleString()}</td>
                    <td style="padding: 0.75rem; font-weight: 500;">${escapeHtml(salary.staffName || '')}</td>
                    <td style="padding: 0.75rem; color: var(--gray-600);">${escapeHtml(salary.role || '')}</td>
                    <td style="padding: 0.75rem; font-weight: 700; color: var(--primary);">
                        ${typeof formatCurrency === 'function' ? formatCurrency(salary.amount) : `₱${salary.amount.toFixed(2)}`}
                    </td>
                    <td style="padding: 0.75rem;">
                        <button class="btn btn-sm btn-action btn-icon" 
                            onclick="editSalary('${salary.id}')" 
                            title="Edit"
                            style="flex-shrink: 0; margin-right: 0.25rem; background: #f59e0b; color: white;">
                            <i class="ph ph-pencil-simple"></i>
                        </button>
                        <button class="btn btn-sm btn-danger btn-icon" 
                            onclick="deleteSalary('${salary.id}')" 
                            title="Delete"
                            style="flex-shrink: 0;">
                            <i class="ph ph-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}


function showAddSalaryModal() {
    const form = document.getElementById('addSalaryForm');
    if (form) form.reset();

    // Set default date to now
    const now = new Date();
    // Format to YYYY-MM-DDThh:mm for datetime-local
    const offset = now.getTimezoneOffset();
    const localISOString = new Date(now.getTime() - (offset * 60 * 1000)).toISOString().slice(0, 16);

    document.getElementById('salaryDate').value = localISOString;

    const modal = document.getElementById('addSalaryModal');
    if (modal) modal.classList.add('active');
}

function closeAddSalaryModal() {
    const modal = document.getElementById('addSalaryModal');
    if (modal) modal.classList.remove('active');
}

async function saveSalary() {
    const staffName = document.getElementById('salaryStaffName').value.trim();
    const role = document.getElementById('salaryRole').value.trim();
    const amount = parseFloat(document.getElementById('salaryAmount').value);
    const date = document.getElementById('salaryDate').value;

    // Validation
    if (!staffName) {
        showToast('Please enter the staff name', 'warning');
        return;
    }

    if (!role) {
        showToast('Please enter the role or description', 'warning');
        return;
    }

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'warning');
        return;
    }

    if (!date) {
        showToast('Please select a date and time', 'warning');
        return;
    }

    showLoading('Saving salary...');

    try {
        const currentUser = auth.getCurrentUser();
        const salaryDate = new Date(date);

        const salaryData = {
            id: 'slry_' + Date.now(),
            staffName: staffName,
            role: role,
            amount: amount,
            date: salaryDate.toISOString(),
            cashier: currentUser.username,
            storeId: currentUser.storeId,
            createdAt: new Date().toISOString()
        };

        await db.add('salaries', salaryData);

        // Real-time notification if possible
        try {
            if (typeof db.notify === 'function') {
                const adminName = currentUser?.name || currentUser?.username || 'Admin';
                const formattedAmount = typeof formatCurrency === 'function' ? formatCurrency(amount) : `₱${amount.toFixed(2)}`;

                await db.notify(
                    'salary',
                    'Staff Salary Added',
                    `${adminName} added a salary of ${formattedAmount} for ${staffName}`,
                    {
                        salaryId: salaryData.id,
                        user: adminName,
                        amount: amount,
                        action: 'add'
                    }
                );
            }
        } catch (notifError) {
            console.warn('Notification skipped:', notifError);
        }

        hideLoading();
        showToast('Salary saved successfully', 'success');
        closeAddSalaryModal();

        // Reload salaries list
        loadSalaries();

    } catch (error) {
        console.error('Error saving salary:', error);
        hideLoading();
        showToast('Failed to save salary: ' + error.message, 'error');
    }
}

async function deleteSalary(id) {
    if (!confirm('Are you sure you want to delete this salary record?')) {
        return;
    }

    showLoading('Deleting...');
    try {
        await db.remove('salaries', id);

        hideLoading();
        showToast('Salary record deleted', 'info');

        // Reload list
        loadSalaries();
    } catch (error) {
        console.error('Error deleting salary:', error);
        hideLoading();
        showToast('Failed to delete salary', 'error');
    }
}

// Edit Salary Functions
async function editSalary(id) {
    showLoading('Loading details...');
    try {
        const salary = await db.get('salaries', id);
        if (!salary) {
            hideLoading();
            showToast('Salary record not found', 'error');
            return;
        }

        // Populate modal fields
        document.getElementById('editSalaryId').value = salary.id;
        document.getElementById('editSalaryStaffName').value = salary.staffName || '';
        document.getElementById('editSalaryRole').value = salary.role || '';
        document.getElementById('editSalaryAmount').value = salary.amount || '';

        // Format date for datetime-local input
        if (salary.date) {
            try {
                const dateObj = new Date(salary.date);
                const offset = dateObj.getTimezoneOffset();
                const localISOString = new Date(dateObj.getTime() - (offset * 60 * 1000)).toISOString().slice(0, 16);
                document.getElementById('editSalaryDate').value = localISOString;
            } catch (e) {
                console.error("Error parsing date:", e);
                document.getElementById('editSalaryDate').value = '';
            }
        } else {
            document.getElementById('editSalaryDate').value = '';
        }

        hideLoading();
        const modal = document.getElementById('editSalaryModal');
        if (modal) modal.classList.add('active');

    } catch (error) {
        console.error('Error loading salary details:', error);
        hideLoading();
        showToast('Failed to load salary details', 'error');
    }
}

function closeEditSalaryModal() {
    const modal = document.getElementById('editSalaryModal');
    if (modal) modal.classList.remove('active');
}

async function updateSalary() {
    const id = document.getElementById('editSalaryId').value;
    const staffName = document.getElementById('editSalaryStaffName').value.trim();
    const role = document.getElementById('editSalaryRole').value.trim();
    const amount = parseFloat(document.getElementById('editSalaryAmount').value);
    const date = document.getElementById('editSalaryDate').value;

    // Validation
    if (!id) {
        showToast('Invalid salary record', 'error');
        return;
    }

    if (!staffName) {
        showToast('Please enter the staff name', 'warning');
        return;
    }

    if (!role) {
        showToast('Please enter the role or description', 'warning');
        return;
    }

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'warning');
        return;
    }

    if (!date) {
        showToast('Please select a date and time', 'warning');
        return;
    }

    showLoading('Updating salary...');

    try {
        // Fetch the existing record to preserve some fields
        const existingSalary = await db.get('salaries', id);
        if (!existingSalary) {
            hideLoading();
            showToast('Salary record not found', 'error');
            return;
        }

        const currentUser = auth.getCurrentUser();
        const salaryDate = new Date(date);

        const updatedData = {
            ...existingSalary, // Keep original createdAt, storeId, cashier (or update cashier?)
            staffName: staffName,
            role: role,
            amount: amount,
            date: salaryDate.toISOString(),
            // Optionally update the cashier to the one who edited it
            // updatedBy: currentUser.username,
            // updatedAt: new Date().toISOString()
        };

        await db.put('salaries', updatedData);

        // Real-time notification if possible (optional for edits, but good practice)
        try {
            if (typeof db.notify === 'function') {
                const adminName = currentUser?.name || currentUser?.username || 'Admin';
                await db.notify(
                    'salary',
                    'Staff Salary Updated',
                    `${adminName} updated salary for ${staffName}`,
                    {
                        salaryId: id,
                        user: adminName,
                        action: 'update'
                    }
                );
            }
        } catch (notifError) {
            console.warn('Notification skipped:', notifError);
        }

        hideLoading();
        showToast('Salary updated successfully', 'success');
        closeEditSalaryModal();

        // Reload salaries list
        loadSalaries();

    } catch (error) {
        console.error('Error updating salary:', error);
        hideLoading();
        showToast('Failed to update salary: ' + error.message, 'error');
    }
}

// Make functions globally available
window.filterSalariesByMonth = filterSalariesByMonth;
window.loadSalaries = loadSalaries;
window.showAddSalaryModal = showAddSalaryModal;
window.closeAddSalaryModal = closeAddSalaryModal;
window.saveSalary = saveSalary;
window.deleteSalary = deleteSalary;
window.editSalary = editSalary;
window.closeEditSalaryModal = closeEditSalaryModal;
window.updateSalary = updateSalary;

// Load salaries when the Salaries tab is activated
document.addEventListener('DOMContentLoaded', () => {
    // If we're on the admin page, listen for tab changes
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            if (tabId === 'salaries') {
                loadSalaries();
            }
        });
    });
});
