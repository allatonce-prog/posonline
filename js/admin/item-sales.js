// ============================================================
//  Item Sales — Units Sold per Product
//  Features:
//    • Filter: Today | This Week | This Month | Month Picker
//    • Click any row → Detail modal (units sold, revenue, target)
//    • Admin can set/edit monthly sales target per product
//    • Targets stored in Firebase 'salesTargets' collection
// ============================================================

let itemSalesCurrentFilter = 'month';
let itemSalesPickedMonthKey = ''; // 'YYYY-MM' when month picker is active
const itemSalesPaginator = new PaginationManager(15);
let itemSalesSearchTerm = '';
let itemSalesCachedData = []; // for modal lookups without re-fetch

// ---- Entry point -------------------------------------------
async function loadItemSales() {
    // Default picked month to current month
    if (!itemSalesPickedMonthKey) {
        const now = new Date();
        itemSalesPickedMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    renderItemSalesFilterButtons();
    setupItemSalesMonthPicker();
    await refreshItemSales();
    setupItemSalesSearch();
}

// ---- Core loader -------------------------------------------
async function refreshItemSales() {
    const container = document.getElementById('itemSalesTableBody');
    const statsContainer = document.getElementById('itemSalesStats');
    if (!container) return;

    // Snapshot both before any await
    const activeFilter = itemSalesCurrentFilter;
    const activeMonthKey = itemSalesPickedMonthKey;

    container.innerHTML = `<tr><td colspan="4" class="table-empty" style="padding:2rem;">
        <div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;">
            <div style="width:18px;height:18px;border:2px solid var(--primary);border-top-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite;"></div>
            Loading...
        </div>
    </td></tr>`;

    try {
        const user = auth.getCurrentUser();

        const [transactions, products, allTargets] = await Promise.all([
            db.getAll('transactions'),
            db.getAll('products'),
            db.getAll('salesTargets')
        ]);

        // Store filter + exclude voided/collectibles
        const storeTransactions = transactions.filter(t =>
            t.storeId === user.storeId &&
            t.status !== 'voided' &&
            t.type !== 'collectible_payment'
        );

        // Date range from snapshotted values
        const { startDate, endDate, dateRangeLabel, monthKey } =
            getItemSalesDateRange(activeFilter, activeMonthKey);

        // Filter by date — strict < endDate
        const rangeTransactions = storeTransactions.filter(t => {
            if (!t.date) return false;
            const d = new Date(t.date);
            return d >= startDate && d < endDate;
        });

        // Product lookup map
        const productMap = {};
        products.forEach(p => { productMap[p.id] = p; });

        // Target lookup: key = productId + '_' + monthKey
        const targetMap = {};
        allTargets.forEach(t => {
            if (t.storeId === user.storeId) {
                targetMap[`${t.productId}_${t.monthKey}`] = t;
            }
        });

        // Aggregate units sold per product
        const salesMap = {};
        rangeTransactions.forEach(t => {
            if (!t.items || !Array.isArray(t.items)) return;
            t.items.forEach(item => {
                const key = item.productId || item.name;
                if (!key) return;
                if (!salesMap[key]) {
                    salesMap[key] = {
                        productId: item.productId,
                        name: item.name || 'Unknown',
                        category: productMap[item.productId]?.category || '—',
                        image: productMap[item.productId]?.image || null,
                        unitsSold: 0,
                        revenue: 0
                    };
                }
                salesMap[key].unitsSold += Number(item.quantity) || 0;
                salesMap[key].revenue += Number(item.subtotal) || Number(item.total) || 0;
            });
        });

        // Build final array, attach target info
        let salesArray = Object.values(salesMap).map(p => {
            const tKey = `${p.productId}_${monthKey}`;
            const target = targetMap[tKey];
            return {
                ...p,
                targetQty: target ? Number(target.targetQty) : null,
                targetId: target ? target.id : null,
                monthKey: monthKey
            };
        }).sort((a, b) => b.unitsSold - a.unitsSold);

        // Cache for modal use
        itemSalesCachedData = salesArray;

        // Totals
        const totalUnitsSold = salesArray.reduce((s, p) => s + p.unitsSold, 0);
        const totalRevenue = salesArray.reduce((s, p) => s + p.revenue, 0);

        // Stats bar
        if (statsContainer) {
            const targetsSet = salesArray.filter(p => p.targetQty !== null).length;
            statsContainer.innerHTML = `
                <div class="item-sales-stat-chip">
                    <i class="ph ph-calendar-blank"></i>
                    <span>${dateRangeLabel}</span>
                </div>
                <div class="item-sales-stat-chip">
                    <i class="ph ph-package"></i>
                    <span><strong>${salesArray.length}</strong> products</span>
                </div>
                <div class="item-sales-stat-chip">
                    <i class="ph ph-shopping-bag-open"></i>
                    <span><strong>${totalUnitsSold}</strong> units sold</span>
                </div>
                <div class="item-sales-stat-chip success">
                    <i class="ph ph-currency-dollar"></i>
                    <span><strong>${formatCurrency(totalRevenue)}</strong></span>
                </div>
                ${targetsSet > 0 ? `
                <div class="item-sales-stat-chip" style="background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.25);">
                    <i class="ph ph-target" style="color:#6366f1;"></i>
                    <span style="color:#6366f1;"><strong>${targetsSet}</strong> targets set</span>
                </div>` : ''}
            `;
        }

        // Apply search
        if (itemSalesSearchTerm) {
            const q = itemSalesSearchTerm.toLowerCase();
            salesArray = salesArray.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q)
            );
        }

        if (salesArray.length === 0) {
            container.innerHTML = `<tr><td colspan="4" class="table-empty">No sales data for this period</td></tr>`;
            const pg = document.getElementById('itemSalesPagination');
            if (pg) pg.innerHTML = '';
            return;
        }

        const maxUnits = salesArray[0]?.unitsSold || 1;
        const paginated = itemSalesPaginator.paginate(salesArray);

        container.innerHTML = paginated.data.map((p, i) => {
            const rank = (itemSalesPaginator.currentPage - 1) * 15 + i + 1;
            const pct = Math.round((p.unitsSold / maxUnits) * 100);
            const imgHtml = p.image
                ? `<img src="${p.image}" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
                : `<div style="width:38px;height:38px;background:var(--gray-100);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.15rem;">📦</div>`;

            // Target progress
            let targetBadge = '';
            if (p.targetQty !== null) {
                const achieved = Math.min(100, Math.round((p.unitsSold / p.targetQty) * 100));
                const color = achieved >= 100 ? '#10b981' : achieved >= 60 ? '#f59e0b' : '#ef4444';
                targetBadge = `<div style="font-size:0.75rem;margin-top:3px;color:${color};font-weight:600;">
                    🎯 ${p.unitsSold}/${p.targetQty} (${achieved}%)
                </div>`;
            }

            return `
            <tr onclick="openItemSalesModal('${encodeURIComponent(p.productId || p.name)}')"
                style="cursor:pointer;transition:background 0.15s;"
                onmouseover="this.style.background='var(--light)'"
                onmouseout="this.style.background=''">
                <td style="width:48px;text-align:center;">
                    <span class="item-sales-rank rank-${rank <= 3 ? rank : 'rest'}">${rank}</span>
                </td>
                <td>
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        ${imgHtml}
                        <div>
                            <div style="font-weight:600;color:var(--dark);line-height:1.2;">${escapeHtml(p.name)}</div>
                            <div style="font-size:0.78rem;color:var(--gray-500);">${escapeHtml(p.category)}</div>
                            ${targetBadge}
                        </div>
                    </div>
                </td>
                <td>
                    <div style="min-width:110px;">
                        <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:3px;">
                            <span style="font-weight:700;color:var(--primary);font-size:1rem;">${p.unitsSold}</span>
                            <span style="color:var(--gray-400);">${pct}%</span>
                        </div>
                        <div style="height:5px;background:var(--gray-100);border-radius:3px;overflow:hidden;">
                            <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:3px;transition:width 0.4s;"></div>
                        </div>
                    </div>
                </td>
                <td style="text-align:right;font-weight:600;color:var(--success-dark);">
                    ${formatCurrency(p.revenue)}
                </td>
            </tr>`;
        }).join('');

        itemSalesPaginator.renderControls('itemSalesPagination', paginated.totalPages, page => {
            itemSalesPaginator.setPage(page);
            refreshItemSales();
        });

    } catch (err) {
        console.error('Error loading item sales:', err);
        container.innerHTML = `<tr><td colspan="4" class="table-empty">Error: ${err.message}</td></tr>`;
    }
}

// ---- Product Detail + Target Modal -------------------------
window.openItemSalesModal = function (encodedKey) {
    const key = decodeURIComponent(encodedKey);
    const product = itemSalesCachedData.find(p => (p.productId || p.name) === key);
    if (!product) return;

    // Remove existing modal if any
    const old = document.getElementById('itemSalesDetailModal');
    if (old) old.remove();

    const achieved = product.targetQty
        ? Math.min(100, Math.round((product.unitsSold / product.targetQty) * 100))
        : null;
    const achievedColor = achieved === null ? '' : achieved >= 100 ? '#10b981' : achieved >= 60 ? '#f59e0b' : '#ef4444';

    const imgHtml = product.image
        ? `<img src="${product.image}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:12px;">`
        : `<div style="width:64px;height:64px;background:var(--gray-100);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:2rem;">📦</div>`;

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'itemSalesDetailModal';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:420px;">
            <div class="modal-header">
                <h2>Item Detail</h2>
                <button class="modal-close" onclick="document.getElementById('itemSalesDetailModal').remove()">×</button>
            </div>
            <div class="modal-body">

                <!-- Product Header -->
                <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                    ${imgHtml}
                    <div>
                        <div style="font-size:1.15rem;font-weight:700;color:var(--dark);">${escapeHtml(product.name)}</div>
                        <div style="font-size:0.85rem;color:var(--gray-500);">${escapeHtml(product.category)}</div>
                    </div>
                </div>

                <!-- Period Stats -->
                <div style="background:var(--light);border-radius:10px;padding:1rem;margin-bottom:1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                    <div style="text-align:center;">
                        <div style="font-size:1.75rem;font-weight:800;color:var(--primary);">${product.unitsSold}</div>
                        <div style="font-size:0.8rem;color:var(--gray-500);">Units Sold</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.25rem;font-weight:700;color:var(--success-dark);">${formatCurrency(product.revenue)}</div>
                        <div style="font-size:0.8rem;color:var(--gray-500);">Revenue</div>
                    </div>
                </div>

                <!-- Target Progress (if set) -->
                ${product.targetQty !== null ? `
                <div style="margin-bottom:1.5rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                        <span style="font-size:0.85rem;font-weight:600;color:var(--gray-700);">🎯 Monthly Target Progress</span>
                        <span style="font-size:0.85rem;font-weight:700;color:${achievedColor};">${achieved}%</span>
                    </div>
                    <div style="height:10px;background:var(--gray-100);border-radius:5px;overflow:hidden;">
                        <div style="width:${achieved}%;height:100%;background:${achievedColor};border-radius:5px;transition:width 0.5s;"></div>
                    </div>
                    <div style="font-size:0.8rem;color:var(--gray-500);margin-top:4px;text-align:right;">
                        ${product.unitsSold} of ${product.targetQty} units
                    </div>
                </div>` : ''}

                <!-- Set Monthly Target -->
                <div style="border-top:1px solid var(--gray-200);padding-top:1.25rem;">
                    <label style="font-weight:600;color:var(--dark);font-size:0.9rem;display:block;margin-bottom:0.5rem;">
                        🎯 Set Monthly Sales Target
                        <span style="font-weight:400;color:var(--gray-500);font-size:0.8rem;margin-left:0.3rem;">(${formatMonthKeyLabel(product.monthKey)})</span>
                    </label>
                    <div style="display:flex;gap:0.5rem;align-items:center;">
                        <input
                            type="number"
                            id="targetQtyInput"
                            class="form-control"
                            min="1"
                            placeholder="e.g. 100"
                            value="${product.targetQty !== null ? product.targetQty : ''}"
                            style="flex:1;"
                        >
                        <button class="btn btn-primary" onclick="saveItemSalesTarget('${encodeURIComponent(key)}','${product.productId}','${product.monthKey}','${product.targetId || ''}')">
                            ${product.targetQty !== null ? 'Update' : 'Set Target'}
                        </button>
                    </div>
                    ${product.targetQty !== null ? `
                    <div style="margin-top:0.5rem;text-align:right;">
                        <button class="btn btn-sm btn-danger" onclick="removeItemSalesTarget('${product.targetId}','${encodedKey}')">Remove Target</button>
                    </div>` : ''}
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    // Close on backdrop click
    modal.addEventListener('click', e => {
        if (e.target === modal) modal.remove();
    });

    setTimeout(() => document.getElementById('targetQtyInput')?.focus(), 100);
};

// ---- Save/Update Target ------------------------------------
window.saveItemSalesTarget = async function (encodedKey, productId, monthKey, existingTargetId) {
    const input = document.getElementById('targetQtyInput');
    if (!input) return;

    const qty = parseInt(input.value);
    if (!qty || qty < 1) {
        showToast('Please enter a valid target (minimum 1)', 'warning');
        return;
    }

    showLoading('Saving target...');
    try {
        const user = auth.getCurrentUser();
        const productName = itemSalesCachedData.find(p =>
            (p.productId || p.name) === decodeURIComponent(encodedKey)
        )?.name || productId;

        if (existingTargetId) {
            // Update existing
            await db.update('salesTargets', {
                id: existingTargetId,
                targetQty: qty,
                updatedAt: new Date().toISOString(),
                updatedBy: user.username
            });
        } else {
            // Create new target document
            const targetId = `target_${productId || productName}_${monthKey}_${user.storeId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            await db.set('salesTargets', targetId, {
                id: targetId,
                productId: productId || null,
                productName: productName,
                monthKey: monthKey,
                targetQty: qty,
                storeId: user.storeId,
                storeName: user.storeName || '',
                createdAt: new Date().toISOString(),
                createdBy: user.username
            });
        }

        hideLoading();
        showToast(`Target set to ${qty} units for ${productName}`, 'success');

        // Close modal and refresh
        const modal = document.getElementById('itemSalesDetailModal');
        if (modal) modal.remove();
        await refreshItemSales();

    } catch (err) {
        hideLoading();
        console.error('Error saving target:', err);
        showToast('Error saving target: ' + err.message, 'error');
    }
};

// ---- Remove Target -----------------------------------------
window.removeItemSalesTarget = async function (targetId, encodedKey) {
    if (!confirm('Remove this sales target?')) return;
    showLoading('Removing...');
    try {
        await db.remove('salesTargets', targetId);
        hideLoading();
        showToast('Target removed', 'success');
        const modal = document.getElementById('itemSalesDetailModal');
        if (modal) modal.remove();
        await refreshItemSales();
    } catch (err) {
        hideLoading();
        showToast('Error: ' + err.message, 'error');
    }
};

// ---- Date range helper (now also handles month picker) -----
function getItemSalesDateRange(filter, pickedMonthKey) {
    const now = new Date();
    let startDate, endDate, dateRangeLabel, monthKey;

    const fmt = d => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtMonth = d => d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

    switch (filter) {
        case 'today': {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
            dateRangeLabel = fmt(startDate);
            monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            break;
        }
        case 'week': {
            const dow = now.getDay();
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 0, 0, 0, 0);
            endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 7, 0, 0, 0, 0);
            dateRangeLabel = `${fmt(startDate)} – ${fmt(new Date(endDate - 1))}`;
            monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            break;
        }
        case 'pick': {
            // Month picker mode
            const [yr, mo] = pickedMonthKey.split('-').map(Number);
            startDate = new Date(yr, mo - 1, 1, 0, 0, 0, 0);
            endDate = new Date(yr, mo, 1, 0, 0, 0, 0);
            dateRangeLabel = fmtMonth(startDate);
            monthKey = pickedMonthKey;
            break;
        }
        case 'month':
        default: {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
            dateRangeLabel = fmtMonth(startDate);
            monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            break;
        }
    }

    return { startDate, endDate, dateRangeLabel, monthKey };
}

function formatMonthKeyLabel(monthKey) {
    if (!monthKey) return '';
    const [yr, mo] = monthKey.split('-').map(Number);
    return new Date(yr, mo - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

// ---- Filter buttons UI -------------------------------------
function renderItemSalesFilterButtons() {
    const btns = document.querySelectorAll('.item-sales-filter-btn');
    btns.forEach(btn => {
        const isActive = btn.dataset.filter === itemSalesCurrentFilter;
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? 'var(--primary)' : 'white';
        btn.style.color = isActive ? 'white' : 'var(--gray-700)';
        btn.style.borderColor = isActive ? 'var(--primary)' : 'var(--gray-300)';
    });

    // Show/hide month picker
    const pickerWrap = document.getElementById('itemSalesMonthPickerWrap');
    if (pickerWrap) {
        pickerWrap.style.display = itemSalesCurrentFilter === 'pick' ? 'flex' : 'none';
    }
}

// Month picker switch
window.switchItemSalesFilter = function (filter) {
    itemSalesCurrentFilter = filter;
    itemSalesPaginator.setPage(1);
    renderItemSalesFilterButtons();
    if (filter !== 'pick') refreshItemSales();
};

// Month picker change
window.applyItemSalesMonthPicker = function () {
    const input = document.getElementById('itemSalesMonthPicker');
    if (!input || !input.value) return;
    itemSalesPickedMonthKey = input.value; // 'YYYY-MM'
    itemSalesCurrentFilter = 'pick';
    itemSalesPaginator.setPage(1);
    renderItemSalesFilterButtons();
    refreshItemSales();
};

// ---- Month picker DOM setup --------------------------------
function setupItemSalesMonthPicker() {
    const input = document.getElementById('itemSalesMonthPicker');
    if (!input) return;
    // Pre-fill with current month
    if (!input.value) {
        const now = new Date();
        input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
}

// ---- Search setup ------------------------------------------
function setupItemSalesSearch() {
    const input = document.getElementById('itemSalesSearch');
    if (!input) return;
    input.oninput = debounce(e => {
        itemSalesSearchTerm = e.target.value.trim();
        itemSalesPaginator.setPage(1);
        refreshItemSales();
    }, 300);
}

// Expose
window.loadItemSales = loadItemSales;
