// ============================================================
//  Cashier Inventory View  —  READ-ONLY
//  Shows active (non-ingredient) products and their current
//  stock levels. No edit, no delete, view only.
//  Supports search and category/status filter.
// ============================================================

let cashierInventoryAllProducts = [];

async function loadCashierInventory() {
    const container = document.getElementById('cashierInventoryList');
    const countEl = document.getElementById('cashierInventoryCount');
    if (!container) return;

    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:0.6rem;padding:2.5rem;color:var(--gray-400);">
            <div style="width:18px;height:18px;border:2px solid #0891b2;border-top-color:transparent;border-radius:50%;animation:cashierSpin 0.7s linear infinite;"></div>
            <span>Loading inventory...</span>
        </div>`;

    try {
        const user = auth.getCurrentUser();
        if (!user) return;

        const [products, recipes, ingredients] = await Promise.all([
            db.getAll('products'),
            db.getAll('recipes'),
            db.getAll('ingredients')
        ]);

        const ingMap = {};
        (ingredients || []).forEach(i => { if (i && i.id) ingMap[i.id] = i; });

        const recipeMap = {};
        (recipes || []).forEach(r => { if (r && r.productId) recipeMap[r.productId] = r; });

        // Only show active, non-ingredient products for this store
        cashierInventoryAllProducts = products.filter(p =>
            p.storeId === user.storeId &&
            !p.isIngredient
        ).map(p => {
            const recipe = recipeMap[p.id] || (p.hasRecipe ? recipes.find(r => r.productId === p.id) : null);
            let recipeOutOfStock = false;
            let outOfStockIngs = [];

            if (recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
                for (const ingItem of recipe.ingredients) {
                    if (!ingItem || !ingItem.ingredientId) continue;
                    const ing = ingMap[ingItem.ingredientId];
                    const needed = Number(ingItem.quantity) || 1;
                    const stock = ing ? Math.max(0, Number(ing.stock) || 0) : 0;

                    if (!ing || stock <= 0 || stock < needed) {
                        recipeOutOfStock = true;
                        outOfStockIngs.push(ing ? ing.name : 'Ingredient');
                    }
                }
            }

            return {
                ...p,
                _recipeOutOfStock: recipeOutOfStock,
                _outOfStockIngs: outOfStockIngs
            };
        });

        cashierInventoryAllProducts.sort((a, b) => a.name.localeCompare(b.name));

        if (countEl) countEl.textContent = cashierInventoryAllProducts.length;

        renderCashierInventory(cashierInventoryAllProducts);
        updateCashierInventorySummary(cashierInventoryAllProducts);

    } catch (err) {
        console.error('[CashierInventory]', err);
        container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--danger);">Error: ${err.message}</div>`;
    }
}

function renderCashierInventory(products) {
    const container = document.getElementById('cashierInventoryList');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:3rem 1rem;color:var(--gray-400);">
                <div style="font-size:2.5rem;margin-bottom:0.75rem;">📦</div>
                <div style="font-weight:600;">No products found</div>
                <div style="font-size:0.85rem;margin-top:0.25rem;">Try a different search or filter.</div>
            </div>`;
        return;
    }

    container.innerHTML = products.map(p => {
        const isAvailMode = p.stockMode === 'availability';
        const stock = isAvailMode ? null : (Number(p.stock) || 0);
        const lowThr = Number(p.lowStockThreshold) || 10;

        let statusClass, statusText, stockDisplay;
        if (p._recipeOutOfStock) {
            statusClass = 'cinv-badge-out';
            statusText = `Ingredient Out (${p._outOfStockIngs.join(', ')})`;
            stockDisplay = `
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
                    <span class="cinv-stock-badge ${statusClass}">
                        <i class="ph ph-x-circle cinv-icon-out" style="font-size:0.85rem;"></i>
                        ${statusText}
                    </span>
                </div>`;
        } else if (isAvailMode) {
            const avail = p.isAvailable !== false;
            statusClass = avail ? 'cinv-badge-ok' : 'cinv-badge-out';
            statusText = avail ? 'Available' : 'Unavailable';
            stockDisplay = `<span class="cinv-stock-badge ${statusClass}">${statusText}</span>`;
        } else {
            const isOut = stock <= 0;
            const isLow = !isOut && stock <= lowThr;
            statusClass = isOut ? 'cinv-badge-out' : isLow ? 'cinv-badge-low' : 'cinv-badge-ok';
            statusText = isOut ? 'Out of Stock' : isLow ? `Low (${stock})` : `${stock} in stock`;
            const icon = isOut ? 'ph-x-circle' : isLow ? 'ph-warning' : 'ph-check-circle';
            const icoCls = isOut ? 'cinv-icon-out' : isLow ? 'cinv-icon-low' : 'cinv-icon-ok';
            stockDisplay = `
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
                    <span class="cinv-stock-badge ${statusClass}">
                        <i class="ph ${icon} ${icoCls}" style="font-size:0.85rem;"></i>
                        ${statusText}
                    </span>
                    ${!isOut && !isAvailMode ? `<span style="font-size:0.7rem;color:var(--gray-400);">Low at ≤ ${lowThr}</span>` : ''}
                </div>`;
        }

        const imgHtml = p.image
            ? `<img src="${p.image}" alt="" class="cinv-product-img">`
            : `<div class="cinv-product-img cinv-img-placeholder">📦</div>`;

        return `
        <div class="cinv-row">
            ${imgHtml}
            <div class="cinv-product-info">
                <div class="cinv-product-name">${escapeHtml(p.name)}</div>
                <div class="cinv-product-meta">
                    ${p.category ? `<span class="cinv-cat-badge">${escapeHtml(p.category)}</span>` : ''}
                    <span style="font-size:0.75rem;color:var(--gray-400);">${formatCurrency(p.price)}</span>
                    ${isAvailMode ? `<span class="cinv-mode-label">Availability</span>` : ''}
                </div>
            </div>
            ${stockDisplay}
        </div>`;
    }).join('');
}

function updateCashierInventorySummary(products) {
    let outCount = 0, lowCount = 0, okCount = 0;
    products.forEach(p => {
        if (p.stockMode === 'availability') {
            if (p.isAvailable === false) outCount++; else okCount++;
            return;
        }
        const stock = Number(p.stock) || 0;
        const lowThr = Number(p.lowStockThreshold) || 10;
        if (stock <= 0) outCount++;
        else if (stock <= lowThr) lowCount++;
        else okCount++;
    });
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('cinvCountOut', outCount);
    set('cinvCountLow', lowCount);
    set('cinvCountOk', okCount);
}

// Search + filter
window.filterCashierInventory = function (searchTerm, statusFilter) {
    const term = (searchTerm || document.getElementById('cinvSearch')?.value || '').toLowerCase().trim();
    const status = (statusFilter || document.getElementById('cinvStatusFilter')?.value || 'all');

    let filtered = cashierInventoryAllProducts;

    if (term) {
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(term) ||
            (p.category && p.category.toLowerCase().includes(term))
        );
    }

    if (status === 'out') {
        filtered = filtered.filter(p => {
            if (p.stockMode === 'availability') return p.isAvailable === false;
            return (Number(p.stock) || 0) <= 0;
        });
    } else if (status === 'low') {
        filtered = filtered.filter(p => {
            if (p.stockMode === 'availability') return false;
            const stock = Number(p.stock) || 0;
            const low = Number(p.lowStockThreshold) || 10;
            return stock > 0 && stock <= low;
        });
    } else if (status === 'ok') {
        filtered = filtered.filter(p => {
            if (p.stockMode === 'availability') return p.isAvailable !== false;
            const stock = Number(p.stock) || 0;
            const low = Number(p.lowStockThreshold) || 10;
            return stock > low;
        });
    }

    renderCashierInventory(filtered);

    // Update visible count
    const countEl = document.getElementById('cashierInventoryCount');
    if (countEl) countEl.textContent = filtered.length;
};

const debouncedFilterCashierInventoryInput = debounce((searchTerm, statusFilter) => {
    window.filterCashierInventory(searchTerm, statusFilter);
}, 150);

window.filterCashierInventoryInput = debouncedFilterCashierInventoryInput;
window.loadCashierInventory = loadCashierInventory;
