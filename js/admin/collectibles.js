// Collectibles Management

let currentCollectiblesFilter = 'all';
let currentCollectiblesSearch = '';

// Load collectibles
async function loadCollectibles() {
    const listContainer = document.getElementById('collectiblesList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="table-empty">Loading collectibles...</div>';

    try {
        const user = auth.getCurrentUser();
        const allCollectibles = await db.getAll('collectibles');
        let storeCollectibles = allCollectibles.filter(c => c.storeId === user.storeId);

        // Apply Search
        if (currentCollectiblesSearch) {
            const query = currentCollectiblesSearch.toLowerCase();
            storeCollectibles = storeCollectibles.filter(c =>
                (c.customerName && c.customerName.toLowerCase().includes(query))
            );
        }

        // Apply Date Filter
        storeCollectibles = filterCollectiblesByDate(storeCollectibles, currentCollectiblesFilter);

        // Sort by date (newest first)
        const sortedCollectibles = storeCollectibles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Update stats
        updateCollectibleStats(sortedCollectibles);

        if (sortedCollectibles.length === 0) {
            listContainer.innerHTML = '<div class="table-empty">No collectibles found</div>';
            return;
        }

        listContainer.innerHTML = sortedCollectibles.map(c => {
            const balance = c.totalAmount - (c.paidAmount || 0);
            const statusClass = c.status === 'paid' ? 'badge-success' : (c.paidAmount > 0 ? 'badge-warning' : 'badge-danger');
            const statusText = c.status === 'paid' ? 'Paid' : (c.paidAmount > 0 ? 'Partial' : 'Unpaid');
            const dateStr = new Date(c.createdAt).toLocaleDateString();

            return `
                <div class="collectible-card" onclick="viewCollectibleDetails('${c.id}')">
                    <div class="collectible-header">
                        <div class="collectible-customer">${escapeHtml(c.customerName)}</div>
                        <div class="collectible-date">${dateStr}</div>
                    </div>
                    <div class="collectible-body">
                         <div class="collectible-items" style="font-size: 0.8rem;">${c.items.length} items</div>
                    </div>
                    <div class="collectible-footer">
                         <div style="text-align: left;">
                            <div style="font-size: 0.75rem; color: var(--gray-500);">Total</div>
                            <div class="collectible-amount" style="font-size: 0.9rem;">${formatCurrency(c.totalAmount)}</div>
                        </div>
                        <div style="text-align: right;">
                             <div style="font-size: 0.75rem; color: var(--gray-500);">Balance</div>
                             <div class="collectible-balance" style="font-size: 0.9rem; color: ${balance > 0 ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(balance)}</div>
                        </div>
                    </div>
                     <div style="margin-top: 0.5rem; text-align: right;">
                        <span class="badge ${statusClass}" style="font-size: 0.7rem; padding: 0.2rem 0.5rem;">${statusText}</span>
                    </div>
                </div>
            `;
        }).join('');

        setupCollectiblesFilters();

    } catch (error) {
        console.error('Error loading collectibles:', error);
        listContainer.innerHTML = `<div class="table-empty">Error loading data: ${error.message}</div>`;
    }
}

function updateCollectibleStats(collectibles) {
    const totalAmount = collectibles.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalPaid = collectibles.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
    const totalOutstanding = totalAmount - totalPaid;

    const outstandingEl = document.getElementById('totalOutstandingAmount');

    if (outstandingEl) outstandingEl.textContent = formatCurrency(totalOutstanding);
}

// Filter collectibles helper
function filterCollectiblesByDate(collectibles, filter) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    const last7DaysStart = new Date(todayStart);
    last7DaysStart.setDate(last7DaysStart.getDate() - 7);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return collectibles.filter(c => {
        const date = new Date(c.createdAt);

        switch (filter) {
            case 'today':
                return date >= todayStart;
            case 'yesterday':
                return date >= yesterdayStart && date < yesterdayEnd;
            case 'last7days':
                return date >= last7DaysStart;
            case 'thisMonth':
                return date >= thisMonthStart;
            case 'recent':
                // For recent, let's limit to last 30 days or just return all logic-wise if undefined limit
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
