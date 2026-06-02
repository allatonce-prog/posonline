// ============================================================
//  Cashier Recipes Stock View  —  READ-ONLY
//  Shows active product recipes and the current stock level
//  of each ingredient they use. No editing allowed.
//  Uses ingredient.stock (same field deducted at checkout).
// ============================================================

async function loadCashierRecipes() {
    const container = document.getElementById('recipesStockList');
    if (!container) return;

    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:0.6rem;padding:2.5rem;color:var(--gray-400);">
            <div style="width:18px;height:18px;border:2px solid var(--primary);border-top-color:transparent;border-radius:50%;animation:cashierSpin 0.7s linear infinite;"></div>
            <span>Loading recipes...</span>
        </div>`;

    try {
        const user = auth.getCurrentUser();
        if (!user) return;

        // Fetch everything in parallel
        const [recipes, ingredients, products] = await Promise.all([
            db.getAll('recipes'),
            db.getAll('ingredients'),
            db.getAll('products')
        ]);

        // Maps
        const ingMap = {};
        ingredients.forEach(i => { ingMap[i.id] = i; });

        const prodMap = {};
        products.forEach(p => { prodMap[p.id] = p; });

        // Filter recipes for this store (via product's storeId)
        const storeRecipes = recipes.filter(r => {
            const product = prodMap[r.productId];
            return product && product.storeId === user.storeId;
        });

        if (storeRecipes.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem 1rem;color:var(--gray-400);">
                    <div style="font-size:2.5rem;margin-bottom:0.75rem;">🍳</div>
                    <div style="font-weight:600;">No recipes found</div>
                    <div style="font-size:0.85rem;margin-top:0.25rem;">Ask admin to create product recipes first.</div>
                </div>`;
            updateRecipeSummaryBadges([], {});
            return;
        }

        // Collect all ingredient stocks for badge counts
        const allIngIds = new Set();
        storeRecipes.forEach(r => {
            (r.ingredients || []).forEach(i => { if (i.ingredientId) allIngIds.add(i.ingredientId); });
        });

        updateRecipeSummaryBadges([...allIngIds], ingMap);

        // Sort recipes: products with any out-of-stock ingredient first, then low, then ok
        storeRecipes.sort((a, b) => {
            const scoreRecipe = (r) => {
                let worst = 0; // 0=ok, 1=low, 2=out
                (r.ingredients || []).forEach(i => {
                    const ing = ingMap[i.ingredientId];
                    if (!ing) return;
                    const stock = Number(ing.stock) || 0;
                    const low = Number(ing.lowStock) || 10;
                    if (stock <= 0) worst = Math.max(worst, 2);
                    else if (stock <= low) worst = Math.max(worst, 1);
                });
                return worst;
            };
            return scoreRecipe(b) - scoreRecipe(a);
        });

        let html = '';

        storeRecipes.forEach(recipe => {
            const product = prodMap[recipe.productId];
            if (!product) return;
            if (!recipe.ingredients || recipe.ingredients.length === 0) return;

            // Determine worst status for the recipe header badge
            let recipeBadgeClass = 'cst-badge-ok';
            let recipeBadgeText = 'OK';
            let anyIssue = false;

            const ingredientRows = recipe.ingredients.map(ingItem => {
                if (!ingItem.ingredientId) return '';
                const ing = ingMap[ingItem.ingredientId];
                if (!ing) {
                    return `
                    <div class="cst-option-row cst-row-warn">
                        <div class="cst-option-name">
                            <i class="ph ph-link-break cst-icon-warn"></i>
                            <span style="color:var(--gray-500);font-style:italic;">Unknown ingredient</span>
                        </div>
                        <span class="cst-stock-badge cst-badge-warn">Missing</span>
                    </div>`;
                }

                const stock = Math.max(0, Number(ing.stock) || 0);
                const lowThr = Number(ing.lowStock) || 10;
                const needed = Number(ingItem.quantity) || 1;
                const unit = ing.unit || 'pcs';
                const isOut = stock <= 0;
                const isLow = !isOut && stock <= lowThr;

                if (isOut) { recipeBadgeClass = 'cst-badge-out'; recipeBadgeText = 'Out'; anyIssue = true; }
                else if (isLow && recipeBadgeClass !== 'cst-badge-out') { recipeBadgeClass = 'cst-badge-low'; recipeBadgeText = 'Low'; anyIssue = true; }

                const rowClass = isOut ? 'cst-row-out' : isLow ? 'cst-row-low' : '';
                const iconClass = isOut ? 'cst-icon-out ph-x-circle' : isLow ? 'cst-icon-low ph-warning' : 'cst-icon-ok ph-check-circle';
                const badgeCls = isOut ? 'cst-badge-out' : isLow ? 'cst-badge-low' : 'cst-badge-ok';
                const stockText = isOut ? 'Out of Stock' : `${stock} ${unit}`;

                // How many portions can be made?
                const portions = needed > 0 ? Math.floor(stock / needed) : '∞';
                const portionColor = portions === 0 ? '#ef4444' : portions <= 5 ? '#f59e0b' : '#10b981';

                return `
                <div class="cst-option-row ${rowClass}">
                    <div class="cst-option-name">
                        <i class="ph ${iconClass}"></i>
                        <div style="min-width:0;">
                            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(ing.name)}</div>
                            <div style="font-size:0.72rem;color:var(--gray-400);">Uses ${needed} ${unit} per serving</div>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;">
                        <span class="cst-stock-badge ${badgeCls}">${stockText}</span>
                        ${!isOut ? `<span style="font-size:0.7rem;color:${portionColor};font-weight:700;">≈ ${portions} servings</span>` : ''}
                    </div>
                </div>`;
            }).filter(Boolean).join('');

            if (!ingredientRows) return;

            // Product image or emoji
            const imgHtml = product.image
                ? `<img src="${product.image}" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
                : `<div style="width:32px;height:32px;background:var(--gray-100);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">🍳</div>`;

            html += `
            <div class="cst-group">
                <div class="cst-group-header">
                    <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;">
                        ${imgHtml}
                        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(product.name)}</span>
                    </div>
                    <span class="cst-stock-badge ${recipeBadgeClass}" style="flex-shrink:0;">${recipeBadgeText}</span>
                </div>
                <div class="cst-option-list">${ingredientRows}</div>
            </div>`;
        });

        container.innerHTML = html || `<div style="text-align:center;padding:2rem;color:var(--gray-400);">No recipe ingredients to display.</div>`;

    } catch (err) {
        console.error('[RecipesStock]', err);
        container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--danger);">Error: ${err.message}</div>`;
    }
}

function updateRecipeSummaryBadges(ingIds, ingMap) {
    let outCount = 0, lowCount = 0, okCount = 0;
    ingIds.forEach(id => {
        const ing = ingMap[id];
        if (!ing) return;
        const stock = Number(ing.stock) || 0;
        const low = Number(ing.lowStock) || 10;
        if (stock <= 0) outCount++;
        else if (stock <= low) lowCount++;
        else okCount++;
    });
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('recipesCountOut', outCount);
    set('recipesCountLow', lowCount);
    set('recipesCountOk', okCount);
}

window.loadCashierRecipes = loadCashierRecipes;
