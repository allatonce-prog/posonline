/**
 * Modifier Management Module
 * Handles modifiers and extras (variants)
 */

console.log('Modifiers module loaded');

// State
let allModifiers = [];
let editingModifierId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Setup Search Listener
    const searchInput = document.getElementById('modifierSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allModifiers.filter(m => m.name.toLowerCase().includes(term));
            renderModifiersList(filtered);
        }, 150));
    }
});

// Load all required data
async function loadModifiers() {
    showLoading('Loading modifiers...');
    try {
        console.log("Fetching modifiers...");
        let modifiers = [];

        // 1. Try to get fresh from cloud if online
        if (db && db.isOnline) {
            console.log("Online: Fetching from cloud...");
            try {
                // Use the explicit refresh method which we know works
                if (typeof db.refreshCollectionFromCloud === 'function') {
                    // Force a refresh based on current store
                    await db.refreshCollectionFromCloud('modifiers', db.getCurrentStoreId());
                }
                // Then get from local which is now updated
                modifiers = await db.getAll('modifiers');
            } catch (e) {
                console.warn("Cloud fetch failed, falling back to local", e);
                modifiers = await db.getAll('modifiers');
            }
        } else {
            // 2. Offline: Get from local
            console.log("Offline: Fetching from local DB...");
            modifiers = await db.getAll('modifiers');
        }

        allModifiers = modifiers || [];
        console.log('Modifiers loaded:', allModifiers.length, allModifiers);

        renderModifiersList();

    } catch (error) {
        console.error('Error loading modifier data:', error);
        showToast('Failed to load modifiers: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ---------------------------------------------------------
// MODIFIERS MANAGEMENT
// ---------------------------------------------------------

function renderModifiersList(modifiers = allModifiers) {
    const listContainer = document.getElementById('modifiersList');
    const emptyState = document.getElementById('modifiersEmpty');

    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (modifiers.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Sort by name
    const sortedModifiers = [...modifiers].sort((a, b) => a.name.localeCompare(b.name));

    const fragment = document.createDocumentFragment();

    sortedModifiers.forEach(mod => {
        const optionCount = mod.options ? mod.options.length : 0;
        const typeLabel = mod.type === 'multiple' ? 'Multi Select' : 'Single Select';
        const typeIcon = mod.type === 'multiple' ? 'ph-checks' : 'ph-check-circle';
        const typeColor = mod.type === 'multiple' ? 'var(--success)' : 'var(--primary)';

        const card = document.createElement('div');
        card.style.cssText = `
            background: white; 
            border-radius: var(--radius-md); 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
            padding: 1rem; 
            display: flex; 
            flex-direction: column; 
            gap: 1rem;
            position: relative;
            border: 1px solid var(--gray-200);
            transition: transform 0.2s, box-shadow 0.2s;
        `;
        card.onmouseover = () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        };
        card.onmouseout = () => {
            card.style.transform = 'none';
            card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        };

        // Render options preview (first 3)
        let optionsPreview = '';
        if (mod.options && mod.options.length > 0) {
            optionsPreview = mod.options.slice(0, 3).map(opt => `
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 2px 0; border-bottom: 1px dashed var(--gray-100);">
                    <span style="color: var(--gray-700);">${escapeHtml(opt.name)}</span>
                    <span style="font-weight: 600; color: var(--dark);">+${formatCurrency(opt.price)}</span>
                </div>
            `).join('');
            if (mod.options.length > 3) {
                optionsPreview += `<div style="font-size: 0.8rem; color: var(--gray-500); margin-top: 4px;">+ ${mod.options.length - 3} more options</div>`;
            }
        } else {
            optionsPreview = '<div style="font-size: 0.85rem; color: var(--gray-400); font-style: italic;">No options added</div>';
        }

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h4 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--dark);">${escapeHtml(mod.name)}</h4>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 6px;">
                        <i class="ph ${typeIcon}" style="color: ${typeColor};"></i>
                        <span style="font-size: 0.85rem; color: var(--gray-600); font-weight: 500;">${typeLabel}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="editModifier('${mod.id}')" style="background: #f59e0b; color: white; border: none; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button onclick="deleteModifier('${mod.id}')" style="background: var(--danger-light); color: var(--danger); border: none; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>

            <div style="background: var(--gray-50); border-radius: 6px; padding: 0.75rem;">
                <div style="font-size: 0.75rem; font-weight: 700; color: var(--gray-500); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Options</div>
                ${optionsPreview}
            </div>
        `;
        fragment.appendChild(card);
    });

    listContainer.appendChild(fragment);
}

// UI Helpers for Modal
window.updateModifierTypeUI = function () {
    const type = document.querySelector('input[name="modifierType"]:checked').value;
    const maxSelDiv = document.getElementById('maxSelectionDev');

    // Highlight selected card styling logic could go here if using CSS classes
    // For now simple display toggle
    if (type === 'multiple') {
        maxSelDiv.style.display = 'block';
    } else {
        maxSelDiv.style.display = 'none';
        document.getElementById('modifierMaxSelections').value = '';
    }
}

// Local ingredients cache for modifiers module
let availableIngredients = [];

// Helper to ensure ingredients are loaded
async function ensureIngredientsLoaded() {
    console.log('Ensuring ingredients loaded...');

    // Try to load from DB directly
    try {
        const ingredients = await db.getAll('ingredients');
        if (ingredients && ingredients.length > 0) {
            availableIngredients = ingredients;
            console.log('Ingredients loaded from DB for modifiers:', availableIngredients.length);
        } else if (typeof allIngredients !== 'undefined' && allIngredients.length > 0) {
            // Fallback to global if DB returns empty (maybe sync issue?)
            availableIngredients = allIngredients;
            console.log('Ingredients loaded from global for modifiers:', availableIngredients.length);
        } else {
            console.warn('No ingredients found in DB or global scope.');
            availableIngredients = [];
        }
    } catch (e) {
        console.error('Failed to load ingredients for modifiers', e);
        availableIngredients = [];
    }
}

window.addModifierOptionRow = async function (name = '', price = '', ingredientId = '') {
    await ensureIngredientsLoaded();

    // Generate ingredient options
    let ingredientOptions = '<option value="">-- No Ingredient (Price only) --</option>';

    if (availableIngredients && availableIngredients.length > 0) {
        // Sort for easier finding
        const sorted = [...availableIngredients].sort((a, b) => a.name.localeCompare(b.name));
        sorted.forEach(ing => {
            const selected = ing.id === ingredientId ? 'selected' : '';
            const unit = ing.unit ? `(${ing.unit})` : '';
            // Determine current stock if available
            let stockInfo = '';
            if (ing.currentStock !== undefined) {
                stockInfo = ` [Stock: ${ing.currentStock}]`;
            }

            ingredientOptions += `<option value="${ing.id}" ${selected}>${escapeHtml(ing.name)} ${unit}${stockInfo}</option>`;
        });
    } else {
        ingredientOptions += '<option value="" disabled>No ingredients available</option>';
    }

    const list = document.getElementById('modifierOptionsList');
    const div = document.createElement('div');
    div.className = 'modifier-option-row';
    div.style.cssText = `display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; background: var(--gray-50); border-radius: 8px; border: 1px solid var(--gray-200); position: relative;`;

    div.innerHTML = `
        <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
            <div style="flex: 1;">
                <label style="font-size: 0.7rem; color: var(--gray-500); margin-bottom: 2px; font-weight: 600;">Display Name</label>
                <input type="text" class="form-control form-control-sm option-name" placeholder="e.g. Cheese" value="${escapeHtml(name)}" required>
            </div>
            <div style="width: 100px;">
                <label style="font-size: 0.7rem; color: var(--gray-500); margin-bottom: 2px; font-weight: 600;">Price (+)</label>
                <input type="number" class="form-control form-control-sm option-price" placeholder="0.00" value="${price}" min="0" step="0.01">
            </div>
        </div>
        
        <div style="display: flex; gap: 0.5rem; align-items: center;">
            <div style="flex: 1;">
                 <label style="font-size: 0.7rem; color: var(--gray-500); margin-bottom: 2px; font-weight: 600;">Linked Ingredient (Deducts 1 Stock)</label>
                <select class="form-control form-control-sm option-ingredient" style="width: 100%;">
                    ${ingredientOptions}
                </select>
            </div>
            <button type="button" class="btn-icon" onclick="this.closest('.modifier-option-row').remove()" style="color: var(--danger); height: 32px; width: 32px; display: flex; align-items: center; justify-content: center; background: white; border: 1px solid var(--danger-light); border-radius: 6px; margin-top: 18px;">
                <i class="ph ph-trash"></i>
            </button>
        </div>
    `;
    list.appendChild(div);

    // Focus new name input if added manually (empty)
    if (!name) {
        div.querySelector('.option-name').focus();
    }
}

// Modal Functions
window.showAddModifierModal = function () {
    editingModifierId = null;
    document.getElementById('modifierModalTitle').textContent = 'Add Modifier Group';
    document.getElementById('modifierForm').reset();
    document.getElementById('modifierId').value = '';

    // Reset options
    document.getElementById('modifierOptionsList').innerHTML = '';
    addModifierOptionRow(); // Add one empty row

    // Reset radio
    const radios = document.getElementsByName('modifierType');
    radios[0].checked = true; // Default SINGLE
    updateModifierTypeUI();

    document.getElementById('btnDeleteModifier').style.display = 'none';
    document.getElementById('modifierModal').classList.add('active');
    document.body.classList.add('modal-open');
}

window.closeModifierModal = function () {
    document.getElementById('modifierModal').classList.remove('active');
    document.body.classList.remove('modal-open');
}

window.editModifier = function (id) {
    const mod = allModifiers.find(m => m.id === id);
    if (!mod) return;

    editingModifierId = id;
    document.getElementById('modifierModalTitle').textContent = 'Edit Modifier Group';
    document.getElementById('modifierId').value = mod.id;
    document.getElementById('modifierName').value = mod.name;

    // Set type
    const radios = document.getElementsByName('modifierType');
    for (let r of radios) {
        if (r.value === mod.type) r.checked = true;
    }
    updateModifierTypeUI();

    if (mod.type === 'multiple' && mod.maxSelections) {
        document.getElementById('modifierMaxSelections').value = mod.maxSelections;
    }

    // Load options
    const list = document.getElementById('modifierOptionsList');
    list.innerHTML = '';
    if (mod.options && mod.options.length > 0) {
        mod.options.forEach(opt => {
            // Pass ingredientId (quantity ignored/defaulted)
            addModifierOptionRow(opt.name, opt.price, opt.ingredientId);
        });
    } else {
        addModifierOptionRow();
    }

    document.getElementById('btnDeleteModifier').style.display = 'block';
    document.getElementById('modifierModal').classList.add('active');
    document.body.classList.add('modal-open');
}

window.saveModifier = async function () {
    const name = document.getElementById('modifierName').value.trim();
    const type = document.querySelector('input[name="modifierType"]:checked').value;
    const maxSelections = document.getElementById('modifierMaxSelections').value;

    // Collect options
    const options = [];
    const rows = document.querySelectorAll('#modifierOptionsList .modifier-option-row');
    rows.forEach(row => {
        const optName = row.querySelector('.option-name').value.trim();
        const optPrice = parseFloat(row.querySelector('.option-price').value) || 0;
        const optIngId = row.querySelector('.option-ingredient').value;
        const optQty = 1; // Default to 1 as requested ("NAME, INGREDIENT, PRICE")

        if (optName) {
            const optData = {
                name: optName,
                price: optPrice
            };
            // Only add ingredient data if selected
            if (optIngId) {
                optData.ingredientId = optIngId;
                optData.quantity = optQty;
            }
            options.push(optData);
        }
    });

    if (!name) {
        showToast('Modifier Group Name is required', 'warning');
        return;
    }

    if (options.length === 0) {
        showToast('At least one option is required', 'warning');
        return;
    }

    showLoading('Saving modifier...');

    try {
        const modifierData = {
            name,
            type,
            options,
            storeId: db.getCurrentStoreId(),
            updatedAt: new Date().toISOString()
        };

        if (type === 'multiple' && maxSelections) {
            modifierData.maxSelections = parseInt(maxSelections);
        } else {
            modifierData.maxSelections = null;
        }

        if (editingModifierId) {
            // Update
            await db.update('modifiers', { id: editingModifierId, ...modifierData });
            showToast('Modifier updated successfully', 'success');
        } else {
            // Create
            modifierData.createdAt = new Date().toISOString();
            await db.add('modifiers', modifierData);
            showToast('Modifier added successfully', 'success');
        }

        closeModifierModal();
        await loadModifiers(); // Reload UI

    } catch (error) {
        console.error('Error saving modifier:', error);
        showToast('Failed to save modifier', 'error');
    } finally {
        hideLoading();
    }
}

window.deleteModifier = async function (id) {
    // If id not passed, check editingModifierId (for modal button)
    const targetId = id || editingModifierId;
    if (!targetId) return;

    if (!confirm('Are you sure you want to delete this modifier group? This cannot be undone.')) return;

    showLoading('Deleting modifier...');
    try {
        await db.delete('modifiers', targetId);
        showToast('Modifier deleted successfully', 'success');

        if (editingModifierId) {
            closeModifierModal(); // close if deleted from modal
        }

        await loadModifiers();
    } catch (error) {
        console.error('Error deleting modifier:', error);
        showToast('Failed to delete modifier', 'error');
    } finally {
        hideLoading();
    }
}
