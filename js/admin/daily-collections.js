/* Daily Collections Management */

// Load Collections
async function loadCollections() {
    console.log('Loading collections...');
    const collectionsGrid = document.getElementById('collectionsGrid');
    if (!collectionsGrid) return;

    try {
        collectionsGrid.innerHTML = '<div class="table-empty">Loading collections...</div>';

        // Get transactions
        const transactions = await db.getAll('transactions');

        // Get all collectibles to calculate balances
        const allCollectibles = await db.getAll('collectibles');
        const collectiblesMap = {};
        allCollectibles.forEach(c => {
            collectiblesMap[c.id] = c;
        });

        // Determine date range (default to global currentTimeRange or just Today as requested)
        // The user specifically said "load the payments of this day".
        // Use Global Time Range if available, otherwise Today.
        let startDate, endDate;
        if (typeof getDateRange === 'function' && typeof currentTimeRange !== 'undefined') {
            const range = getDateRange(currentTimeRange);
            startDate = range.startDate;
            endDate = range.endDate;
        } else {
            // Default to Today
            const now = new Date();
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        }

        // Filter for collectible payments in range
        const payments = transactions.filter(t => {
            if (t.type !== 'collectible_payment') return false;
            const tDate = new Date(t.date);
            return tDate >= startDate && tDate < endDate;
        });

        // Update Summary Stats
        const totalCollected = payments.reduce((sum, t) => sum + (Number(t.total) || Number(t.amount) || 0), 0);

        const totalCollectedEl = document.getElementById('dailyTotalCollected');
        const countEl = document.getElementById('dailyPaymentsCount');
        const dateDisplayEl = document.getElementById('collectionsDateDisplay');

        if (totalCollectedEl) totalCollectedEl.textContent = formatCurrency(totalCollected);
        if (countEl) countEl.textContent = payments.length;
        if (dateDisplayEl) {
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            // simplified date display
            dateDisplayEl.textContent = startDate.toLocaleDateString(undefined, options);
            if (typeof currentTimeRange !== 'undefined' && currentTimeRange !== 'today') {
                dateDisplayEl.textContent += ` - ${endDate.toLocaleDateString(undefined, options)}`;
            }
        }

        if (payments.length === 0) {
            collectionsGrid.innerHTML = '<div class="table-empty">No payments found for this period</div>';
            return;
        }

        // Sort by date (newest first)
        payments.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Render Cards
        collectionsGrid.innerHTML = payments.map(p => {
            // Find associated collectible to get CURRENT balance
            // Note: This shows CURRENT balance, not balance at time of payment. 
            // User example: "Almas payed 2k, Balance: 3k". 
            // Typically this means the remaining balance NOW.

            let customerName = p.customerName || 'Unknown';
            let balance = 0;
            let collectibleId = p.collectibleId;

            // Try to find the collectible
            // Sometimes p.collectibleId might be missing in older records, but usually present.
            // If we have the ID, get the current balance from the collectible record.

            if (collectibleId && collectiblesMap[collectibleId]) {
                const c = collectiblesMap[collectibleId];
                customerName = c.customerName; // Ensure name is accurate from source
                const total = Number(c.totalAmount) || 0;
                const paid = Number(c.paidAmount) || 0;
                balance = Math.max(0, total - paid);
            } else {
                // Fallback if we can't link to a live collectible (maybe deleted?)
                // We can try to infer from the transaction note?
            }

            return `
            <div class="collectible-card" style="border-left: 4px solid var(--success);">
                <div class="collectible-header">
                    <span class="collectible-customer">${escapeHtml(customerName)}</span>
                    <span class="collectible-date">${formatDateTime(p.date)}</span>
                </div>
                <div class="collectible-body" style="display: block; padding: 10px 0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                         <span style="color: var(--gray-600); font-size: 0.9rem;">Paid Amount:</span>
                         <span style="font-weight: bold; color: var(--success); font-size: 1.1rem;">${formatCurrency(p.total || p.amount)}</span>
                    </div>
                     <div style="display: flex; justify-content: space-between;">
                         <span style="color: var(--gray-600); font-size: 0.9rem;">Remaining Balance:</span>
                         <span style="font-weight: bold; color: var(--danger);">${formatCurrency(balance)}</span>
                    </div>
                </div>
                <div class="collectible-footer">
                    <span style="font-size: 0.8rem; color: var(--gray-500);">Ref: ${formatTransactionId(p.id)}</span>
                     <button class="btn btn-sm btn-secondary btn-icon" onclick="viewTransaction('${p.id}')">
                        <i class="ph ph-eye"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading collections:', error);
        collectionsGrid.innerHTML = '<div class="table-empty" style="color: var(--danger)">Error loading data</div>';
    }
}

// Expose to window
window.loadCollections = loadCollections;
