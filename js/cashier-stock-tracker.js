// ============================================================
//  Cashier Stock Tracker — Full View Tab
//  Displays all active modifier groups and the current stock
//  of their linked ingredients so cashiers can track levels.
//  Stock field on ingredients = `stock` (not currentStock)
// ============================================================

async function loadCashierStockTracker() {
    const container = document.getElementById('modifierStockList');
    if (!container) return;

    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:0.6rem;padding:2rem;color:var(--gray-400);">
            <div style="width:18px;height:18px;border:2px solid var(--primary);border-top-color:transparent;border-radius:50%;animation:csTrackerSpin 0.7s linear infinite;"></div>
            <span>Loading modifier stock...</span>
        </div>`;

    try {
        const user = auth.getCurrentUser();
        if (!user) return;

        // Force fresh cloud fetch for live stock data
        const [modifiers, ingredients] = await Promise.all([
            db.getAll('modifiers'),
            db.getAll('ingredients')
        ]);

        // Map ingredients by id
        const ingMap = {};
        ingredients.forEach(i => { ingMap[i.id] = i; });

        // Filter modifiers to this store
        const storeMods = modifiers.filter(m => m.storeId === user.storeId);

        if (storeMods.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem 1rem;color:var(--gray-400);">
                    <div style="font-size:2.5rem;margin-bottom:0.75rem;">📋</div>
                    <div style="font-weight:600;">No modifier groups found</div>
                    <div style="font-size:0.85rem;margin-top:0.25rem;">Ask admin to set up modifier groups first.</div>
                </div>`;
            return;
        }

        // Gather all modifier groups that have ingredient links
        let anyLinked = false;
        let html = '';

        storeMods.forEach(mod => {
            if (!mod.options || mod.options.length === 0) return;

            const linkedOptions = mod.options.filter(opt => opt.ingredientId);
            // Also show unlinked options (no stock to track)
            const allOptions = mod.options;

            anyLinked = anyLinked || linkedOptions.length > 0;

            // Render each option row
            const rows = allOptions.map(opt => {
                if (opt.ingredientId) {
                    const ing = ingMap[opt.ingredientId];
                    if (!ing) {
                        return `
                        <div class="cst-option-row cst-warning">
                            <div class="cst-option-name">
                                <i class="ph ph-link-break" style="color:var(--gray-400);"></i>
                                ${escapeHtml(opt.name)}
                            </div>
                            <span class="cst-stock-badge cst-badge-warn">Ingredient missing</span>
                        </div>`;
                    }

                    // CORRECT field: ingredient.stock (NOT currentStock)
                    const stock = Math.max(0, Number(ing.stock) || 0);
                    const lowThr = Number(ing.lowStockThreshold) || 5;
                    const isOut = stock <= 0;
                    const isLow = !isOut && stock <= lowThr;
                    const unit = ing.unit || 'pcs';

                    const statusClass = isOut ? 'cst-badge-out' : isLow ? 'cst-badge-low' : 'cst-badge-ok';
                    const rowClass = isOut ? 'cst-row-out' : isLow ? 'cst-row-low' : '';
                    const stockText = isOut ? 'Out of Stock' : `${stock} ${unit}`;
                    const icon = isOut ? 'ph-x-circle' : isLow ? 'ph-warning' : 'ph-check-circle';

                    return `
                    <div class="cst-option-row ${rowClass}">
                        <div class="cst-option-name">
                            <i class="ph ${icon} cst-icon-${isOut ? 'out' : isLow ? 'low' : 'ok'}"></i>
                            <div>
                                <div style="font-weight:600;">${escapeHtml(opt.name)}</div>
                                <div style="font-size:0.75rem;color:var(--gray-500);">→ ${escapeHtml(ing.name)}</div>
                            </div>
                        </div>
                        <span class="cst-stock-badge ${statusClass}">${stockText}</span>
                    </div>`;
                } else {
                    // Option with no linked ingredient — show price only
                    return `
                    <div class="cst-option-row">
                        <div class="cst-option-name" style="color:var(--gray-500);">
                            <i class="ph ph-circle-dashed" style="color:var(--gray-300);"></i>
                            ${escapeHtml(opt.name)}
                        </div>
                        <span class="cst-stock-badge" style="background:var(--gray-100);color:var(--gray-400);">No stock link</span>
                    </div>`;
                }
            }).join('');

            // Group header
            const typeIcon = mod.type === 'multiple' ? 'ph-checks' : 'ph-check-circle';
            html += `
            <div class="cst-group">
                <div class="cst-group-header">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <i class="ph ${typeIcon}" style="color:var(--primary);"></i>
                        <span>${escapeHtml(mod.name)}</span>
                    </div>
                    <span style="font-size:0.75rem;color:var(--gray-400);">${mod.options.length} option${mod.options.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="cst-option-list">${rows}</div>
            </div>`;
        });

        if (!html) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem 1rem;color:var(--gray-400);">
                    <div style="font-size:2.5rem;margin-bottom:0.75rem;">🔗</div>
                    <div style="font-weight:600;">No ingredients linked</div>
                    <div style="font-size:0.85rem;margin-top:0.25rem;">Link ingredients to modifier options in admin.</div>
                </div>`;
            return;
        }

        container.innerHTML = html;
        updateStockTrackerSummaryBadges(ingredients, modifiers, user.storeId, ingMap);

    } catch (err) {
        console.error('[StockTracker]', err);
        container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--danger);">Error: ${err.message}</div>`;
    }
}

// Update the summary count badges at the top
function updateStockTrackerSummaryBadges(ingredients, modifiers, storeId, ingMap) {
    const mods = modifiers.filter(m => m.storeId === storeId);

    // Collect all unique ingredientIds used across all modifier options in this store
    const linkedIngIds = new Set();
    mods.forEach(mod => {
        (mod.options || []).forEach(opt => {
            if (opt.ingredientId) linkedIngIds.add(opt.ingredientId);
        });
    });

    let outCount = 0, lowCount = 0, okCount = 0;
    linkedIngIds.forEach(id => {
        const ing = ingMap[id];
        if (!ing) return;
        const stock = Number(ing.stock) || 0;
        const lowThr = Number(ing.lowStockThreshold) || 5;
        if (stock <= 0) outCount++;
        else if (stock <= lowThr) lowCount++;
        else okCount++;
    });

    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setEl('cstCountOut', outCount);
    setEl('cstCountLow', lowCount);
    setEl('cstCountOk', okCount);
}

// Expose globally
window.loadCashierStockTracker = loadCashierStockTracker;
