
// Collectibles View Functions
if (!window.currentCollectiblesTab) {
    window.currentCollectiblesTab = 'active';
}

// Pagination
const COLLECTIBLES_PER_PAGE = 5;
let currentCollectiblesPage = 1;
let currentCollectiblesSearch = '';

window.switchCollectiblesTab = function (tab) {
    window.currentCollectiblesTab = tab;
    currentCollectiblesPage = 1; // Reset to first page

    // Update tab button states
    const tabBtns = document.querySelectorAll('.collectibles-tab-btn');
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
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

    loadCollectibles();
};

window.loadCollectibles = async function () {
    currentCollectiblesPage = 1; // Reset to first page
    await renderCollectibles();
};

async function renderCollectibles() {
    const activeList = document.getElementById('activeCollectiblesList');
    const archivesList = document.getElementById('archivesCollectiblesList');
    const targetList = window.currentCollectiblesTab === 'active' ? activeList : archivesList;

    if (!targetList) {
        console.error('Target list element not found');
        return;
    }

    targetList.innerHTML = '<div class="loading-spinner">Loading collectibles...</div>';

    try {
        const user = auth.getCurrentUser();
        if (!user) {
            targetList.innerHTML = '<div class="empty-state"><p>Not logged in</p></div>';
            return;
        }

        // Get all collectibles
        const allCollectibles = await db.getAll('collectibles');

        // Filter by cashier and storeId
        const baseCollectibles = allCollectibles.filter(c =>
            c.cashier === user.username &&
            c.storeId === user.storeId
        );

        // Calculate Global Stats & Separate Lists
        let totalAmount = 0;
        let pendingCount = 0;
        let todayAmount = 0;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const allActive = [];
        const allArchived = [];

        baseCollectibles.forEach(c => {
            const total = parseFloat(c.totalAmount) || 0;
            const paid = parseFloat(c.paidAmount) || 0;
            const balance = total - paid;

            const createdDate = new Date(c.createdAt);
            const isToday = createdDate >= todayStart && createdDate < todayEnd;

            if (balance > 0) {
                totalAmount += balance;
                pendingCount++;
                allActive.push(c);
                if (isToday) todayAmount += balance;
            } else {
                allArchived.push(c);
            }
        });

        // Update Stats UI (Always global for the view)
        const totalEl = document.getElementById('totalCollectibles');
        const pendingEl = document.getElementById('pendingCollectibles');
        const todayEl = document.getElementById('todayCollectibles');
        if (totalEl) totalEl.textContent = formatCurrency(totalAmount);
        if (pendingEl) pendingEl.textContent = pendingCount;
        if (todayEl) todayEl.textContent = formatCurrency(todayAmount);

        // Select which list to display
        let displayList = window.currentCollectiblesTab === 'active' ? allActive : allArchived;

        // Apply Search Filter ONLY to the display list
        if (currentCollectiblesSearch) {
            const query = currentCollectiblesSearch.toLowerCase();
            displayList = displayList.filter(c =>
                (c.customerName && c.customerName.toLowerCase().includes(query))
            );
        }

        // Sort by date descending
        displayList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Render collectibles list with pagination
        if (displayList.length === 0) {
            targetList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h3>No ${window.currentCollectiblesTab === 'active' ? 'active' : 'archived'} collectibles</h3>
                    <p>No collectibles found</p>
                </div>
            `;
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(displayList.length / COLLECTIBLES_PER_PAGE);
        const startIndex = (currentCollectiblesPage - 1) * COLLECTIBLES_PER_PAGE;
        const endIndex = startIndex + COLLECTIBLES_PER_PAGE;
        const paginatedCollectibles = displayList.slice(startIndex, endIndex);

        // Render paginated collectibles
        targetList.innerHTML = paginatedCollectibles.map(c => {
            const total = parseFloat(c.totalAmount) || 0;
            const paid = parseFloat(c.paidAmount) || 0;
            const balance = total - paid;

            let status = 'UNPAID';
            let statusColor = 'var(--danger)';
            if (paid >= total && total > 0) {
                status = 'PAID';
                statusColor = 'var(--success)';
            } else if (paid > 0) {
                status = 'PARTIAL';
                statusColor = 'var(--warning)';
            }

            const date = new Date(c.createdAt);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return `
                <div class="collectible-card" onclick="viewCollectibleDetails('${c.id}', event)" style="background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-xl); padding: 1.25rem; margin-bottom: 1rem; box-shadow: var(--shadow-sm); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                        <div style="flex: 1;">
                            <div style="font-size: 1.15rem; font-weight: 700; color: var(--dark); margin-bottom: 0.2rem; line-height: 1.2;">
                                ${escapeHtml(c.customerName) || 'Unknown Customer'}
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.4rem; color: var(--gray-500); font-size: 0.8rem;">
                                <i class="ph ph-calendar-blank"></i>
                                <span>${dateStr}</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary); font-family: 'Inter', sans-serif;">
                                ${formatCurrency(balance > 0 ? balance : total)}
                            </div>
                            <div style="font-size: 0.7rem; font-weight: 600; color: var(--gray-400); text-transform: uppercase; letter-spacing: 0.5px;">Balance</div>
                        </div>
                    </div>
                    
                    <div style="padding: 0.75rem 0; border-top: 1px solid var(--gray-100); border-bottom: 1px solid var(--gray-100); margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="background: var(--light); padding: 0.4rem 0.8rem; border-radius: var(--radius-md); font-size: 0.85rem; color: var(--gray-600); font-weight: 500;">
                                <i class="ph ph-package" style="margin-right: 3px;"></i> ${c.items ? c.items.length : 0} item${c.items && c.items.length !== 1 ? 's' : ''}
                            </div>
                            <div style="font-size: 0.85rem; color: var(--gray-500);">
                                Total: <span style="font-weight: 600; color: var(--dark-light);">${formatCurrency(total)}</span>
                            </div>
                        </div>
                        <span style="padding: 0.35rem 0.8rem; border-radius: 50px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}30;">
                            ${status}
                        </span>
                    </div>

                    <div style="display: flex; gap: 0.65rem;">
                        ${balance > 0 ? `
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); addToExistingCollectible('${c.customerName}')" style="flex: 1; padding: 0.75rem; font-size: 0.85rem; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-weight: 600;">
                                <i class="ph ph-plus-circle" style="font-size: 1.1rem;"></i> Add Items
                            </button>
                            <button class="btn btn-primary" onclick="event.stopPropagation(); showCollectPaymentModal('${c.id}')" style="flex: 1; padding: 0.75rem; font-size: 0.85rem; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-weight: 600; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);">
                                <i class="ph ph-keyboard" style="font-size: 1.1rem;"></i> Collect
                            </button>
                        ` : `
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); viewCollectibleDetails('${c.id}', event)" style="flex: 1; padding: 0.75rem; font-size: 0.85rem; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-weight: 600;">
                                <i class="ph ph-eye" style="font-size: 1.1rem;"></i> View Details
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');

        // Add pagination controls if more than one page
        if (totalPages > 1) {
            const paginationHTML = `
                <div class="pagination-controls" style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.5rem; padding: 1rem;">
                    <button 
                        class="btn btn-secondary" 
                        onclick="changeCollectiblesPage(${currentCollectiblesPage - 1})"
                        ${currentCollectiblesPage === 1 ? 'disabled' : ''}
                        style="min-width: 80px; ${currentCollectiblesPage === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                    >
                        <i class="ph ph-caret-left"></i> Previous
                    </button>
                    
                    <span style="font-size: 0.9rem; color: var(--text-secondary); min-width: 100px; text-align: center;">
                        Page ${currentCollectiblesPage} of ${totalPages}
                    </span>
                    
                    <button 
                        class="btn btn-secondary" 
                        onclick="changeCollectiblesPage(${currentCollectiblesPage + 1})"
                        ${currentCollectiblesPage === totalPages ? 'disabled' : ''}
                        style="min-width: 80px; ${currentCollectiblesPage === totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                    >
                        Next <i class="ph ph-caret-right"></i>
                    </button>
                </div>
            `;
            targetList.innerHTML += paginationHTML;
        }

    } catch (error) {
        console.error('Error loading collectibles:', error);
        targetList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h3>Error loading collectibles</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Pagination function
window.changeCollectiblesPage = function (page) {
    currentCollectiblesPage = page;
    renderCollectibles();

    // Scroll to top of collectibles view
    const collectiblesView = document.getElementById('collectiblesView');
    if (collectiblesView) {
        collectiblesView.scrollTop = 0;
    }
};

window.viewCollectibleDetails = async function (id, event) {
    // If event is passed, stop propagation just in case (though we handled buttons)
    if (event) event.stopPropagation();

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
        document.body.classList.add('modal-open');

        const balance = collectible.totalAmount - (collectible.paidAmount || 0);
        const statusClass = collectible.status === 'paid' ? 'badge-success' : (collectible.paidAmount > 0 ? 'badge-warning' : 'badge-danger');
        const statusText = collectible.status === 'paid' ? 'Paid' : (collectible.paidAmount > 0 ? 'Partial' : 'Unpaid');

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Collectible Details</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove(); document.body.classList.remove('modal-open')">×</button>
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
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove(); document.body.classList.remove('modal-open')">Close</button>
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
        if (modal) {
            modal.remove();
            document.body.classList.remove('modal-open');
        }

        // Reload list for cashier view
        if (typeof loadCollectibles === 'function') {
            loadCollectibles();
        }

        showToast('Collectible deleted successfully', 'success');

    } catch (error) {
        console.error('Error deleting collectible:', error);
        showToast('Error deleting record', 'error');
    }
};

window.handleCollectiblesSearch = debounce(function () {
    const input = document.getElementById('collectiblesSearchInput');
    if (input) {
        currentCollectiblesSearch = input.value.trim();
        currentCollectiblesPage = 1; // Reset to first page when searching
        renderCollectibles();
    }
}, 150);

// Auto-bind search input if it exists
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('collectiblesSearchInput');
    if (input) {
        input.addEventListener('input', window.handleCollectiblesSearch);
    }
});
