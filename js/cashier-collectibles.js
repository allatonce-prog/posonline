
// Collectibles View Functions
if (!window.currentCollectiblesTab) {
    window.currentCollectiblesTab = 'active';
}

// Pagination
const COLLECTIBLES_PER_PAGE = 5;
let currentCollectiblesPage = 1;

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
        let collectibles = allCollectibles.filter(c =>
            c.cashier === user.username &&
            c.storeId === user.storeId
        );

        // Calculate stats
        let totalAmount = 0;
        let pendingCount = 0;

        // Separate active and archived
        const activeCollectibles = [];
        const archivedCollectibles = [];

        collectibles.forEach(c => {
            const total = parseFloat(c.totalAmount) || 0;
            const paid = parseFloat(c.paidAmount) || 0;
            const balance = total - paid;

            if (balance > 0) {
                totalAmount += balance;
                pendingCount++;
                activeCollectibles.push(c);
            } else {
                archivedCollectibles.push(c);
            }
        });

        // Update stats
        const totalEl = document.getElementById('totalCollectibles');
        const pendingEl = document.getElementById('pendingCollectibles');
        if (totalEl) totalEl.textContent = formatCurrency(totalAmount);
        if (pendingEl) pendingEl.textContent = pendingCount;

        // Select which list to display
        const displayList = window.currentCollectiblesTab === 'active' ? activeCollectibles : archivedCollectibles;

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
                <div class="collectible-card" style="background: white; border: 1px solid var(--gray-300); border-radius: var(--radius-lg); padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 600; color: var(--dark); margin-bottom: 0.25rem;">
                                ${escapeHtml(c.customerName) || 'Unknown Customer'}
                            </div>
                            <div style="font-size: 0.85rem; color: var(--gray-500);">
                                ${dateStr}
                            </div>
                        </div>
                        <div style="font-size: 1.25rem; font-weight: 700; color: var(--primary);">
                            ${formatCurrency(balance > 0 ? balance : total)}
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid var(--gray-200);">
                        <div style="font-size: 0.9rem; color: var(--gray-600);">
                            <span>${c.items ? c.items.length : 0} item${c.items && c.items.length !== 1 ? 's' : ''}</span>
                            <span style="margin: 0 0.5rem;">•</span>
                            <span>Total: ${formatCurrency(total)}</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <span style="padding: 0.25rem 0.75rem; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600; background: ${statusColor}15; color: ${statusColor};">
                                ${status}
                            </span>
                            ${balance > 0 ? `
                                <button class="btn btn-primary btn-sm" onclick="showCollectPaymentModal('${c.id}')" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
                                    <i class="ph ph-money"></i> Collect
                                </button>
                            ` : ''}
                        </div>
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
