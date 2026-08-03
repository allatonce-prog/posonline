/**
 * Ingredient Management Module
 * Handles ingredients inventory
 */

console.log('Ingredients module loaded');

// State
let allIngredients = [];
let allRecipes = [];
let allProducts = [];
let editingIngredientId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Only load if recipes tab is active or just load in background?

    // Setup Search Listener
    const searchInput = document.getElementById('ingredientSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allIngredients.filter(i => i.name.toLowerCase().includes(term));
            renderIngredientsList(filtered);
        }, 150));
    }

    // Close all open ingredient dropdowns if clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ingredient-card')) {
            const openDropdowns = document.querySelectorAll('.ingredient-card [id^="dropdown-"]');
            openDropdowns.forEach(dd => {
                if (dd.style.display === 'flex') {
                    dd.style.display = 'none';
                    const ingId = dd.id.replace('dropdown-', '');
                    const caret = document.getElementById(`caret-${ingId}`);
                    if (caret) caret.style.transform = 'rotate(0deg)';
                    const card = dd.closest('.ingredient-card');
                    if (card) {
                        card.style.zIndex = 'auto';
                        card.classList.remove('dropdown-open');
                    }
                }
            });
        }
    });

    // Close dropdowns on resize/scroll of content area to prevent layout mismatch
    window.addEventListener('resize', () => {
        const openDropdowns = document.querySelectorAll('.ingredient-card [id^="dropdown-"]');
        openDropdowns.forEach(dd => {
            if (dd.style.display === 'flex') {
                dd.style.display = 'none';
                const ingId = dd.id.replace('dropdown-', '');
                const caret = document.getElementById(`caret-${ingId}`);
                if (caret) caret.style.transform = 'rotate(0deg)';
                const card = dd.closest('.ingredient-card');
                if (card) {
                    card.style.zIndex = 'auto';
                    card.classList.remove('dropdown-open');
                }
            }
        });
    });
});

// ---------------------------------------------------------
// INGREDIENT IMAGE UPLOAD HELPERS
// ---------------------------------------------------------

window.handleIngredientImageSelect = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast('Image size exceeds 2MB limit', 'warning');
        return;
    }

    showLoading('Uploading image...');
    try {
        let imageUrl = '';
        if (typeof CLOUDINARY_CLOUD_NAME !== 'undefined' && CLOUDINARY_CLOUD_NAME && typeof CLOUDINARY_UPLOAD_PRESET !== 'undefined' && CLOUDINARY_UPLOAD_PRESET) {
            imageUrl = await uploadToCloudinary(file);
        } else {
            imageUrl = await resizeAndCompressImage(file);
            showToast('Cloudinary not configured. Image compressed locally.', 'info');
        }
        document.getElementById('ingredientImageUrl').value = imageUrl;
        const preview = document.getElementById('ingredientImagePreview');
        preview.src = imageUrl;
        preview.style.display = 'block';
        document.getElementById('ingredientImagePlaceholderIcon').style.display = 'none';
        document.getElementById('btnRemoveIngredientImage').style.display = 'block';
        hideLoading();
        showToast('Image uploaded successfully', 'success');
    } catch (error) {
        hideLoading();
        console.error('Ingredient image upload error:', error);
        showToast('Error uploading image: ' + error.message, 'error');
    }
};

window.removeIngredientImage = function () {
    document.getElementById('ingredientImageUrl').value = '';
    document.getElementById('ingredientImageFile').value = '';
    const preview = document.getElementById('ingredientImagePreview');
    preview.src = '';
    preview.style.display = 'none';
    document.getElementById('ingredientImagePlaceholderIcon').style.display = 'block';
    document.getElementById('btnRemoveIngredientImage').style.display = 'none';
};

// Load all required data
async function loadIngredientsData() {
    showLoading('Loading ingredients...');
    try {
        const [ingredients, recipes, products] = await Promise.all([
            db.getAll('ingredients'),
            db.getAll('recipes'),
            db.getAll('products')
        ]);
        allIngredients = ingredients || [];
        allRecipes = recipes || [];
        allProducts = products || [];

        console.log('Ingredients:', allIngredients.length);

        renderIngredientsList();

    } catch (error) {
        console.error('Error loading ingredient data:', error);
        showToast('Failed to load ingredient data', 'error');
    } finally {
        hideLoading();
    }
}

// ---------------------------------------------------------
// INGREDIENTS MANAGEMENT
// ---------------------------------------------------------

function renderIngredientsList(ingredients = allIngredients) {
    const listContainer = document.getElementById('ingredientsList');
    const emptyState = document.getElementById('ingredientsEmpty');

    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (ingredients.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Sort by name
    const sortedDetails = [...ingredients].sort((a, b) => a.name.localeCompare(b.name));

    const fragment = document.createDocumentFragment();

    sortedDetails.forEach(ing => {
        const totalValue = (parseFloat(ing.stock) * parseFloat(ing.cost)).toFixed(2);
        const isLowStock = ing.stock <= (ing.lowStock || 10);

        // Find products using this ingredient
        const linkedRecipes = allRecipes.filter(r => r.ingredients && r.ingredients.some(ri => ri.ingredientId === ing.id));
        const linkedProducts = linkedRecipes.map(r => allProducts.find(p => p.id === r.productId)).filter(Boolean);

        let linkedProductsHtml = '';
        if (linkedProducts.length > 0) {
            linkedProductsHtml = `
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--gray-100); position: relative;">
                <button onclick="toggleLinkedProducts(event, '${ing.id}')" style="background: transparent; border: none; padding: 0; color: var(--primary); font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; transition: color 0.2s;">
                    <i class="ph ph-link" style="font-size: 0.9rem;"></i> Used in ${linkedProducts.length} Product${linkedProducts.length > 1 ? 's' : ''} <i class="ph ph-caret-down toggle-icon" id="caret-${ing.id}" style="transition: transform 0.2s;"></i>
                </button>
                <div id="dropdown-${ing.id}" style="display: none; position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 100; background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: 0.5rem; flex-direction: column; gap: 0.4rem; max-height: 160px; overflow-y: auto; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); scrollbar-width: thin;">
                    ${linkedProducts.map(p => `
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--gray-700); padding: 4px 6px; border-radius: 4px; background: var(--gray-50); border: 1px solid var(--gray-100);">
                            ${p.image ? `<img src="${p.image}" style="width: 24px; height: 24px; border-radius: 4px; object-fit: cover;">` : `<div style="width: 24px; height: 24px; border-radius: 4px; background: var(--gray-100); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--gray-400);"><i class="ph ph-package"></i></div>`}
                            <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${escapeHtml(p.name)}</span>
                            <span style="font-size: 0.7rem; color: var(--gray-400); margin-left: auto; background: var(--gray-100); padding: 1px 4px; border-radius: 3px;">${escapeHtml(p.category)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            `;
        }

        const card = document.createElement('div');
        card.className = 'ingredient-card';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h4 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--dark);">${escapeHtml(ing.name)}</h4>
                    <span style="font-size: 0.8rem; color: var(--gray-500); background: var(--gray-100); padding: 2px 6px; border-radius: 4px; margin-top: 4px; display: inline-block;">
                        ${escapeHtml(ing.unit)}
                    </span>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="editIngredient('${ing.id}')" style="background: #f59e0b; color: white; border: none; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button onclick="deleteIngredient('${ing.id}')" style="background: var(--danger-light); color: var(--danger); border: none; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: auto; padding-top: 0.75rem; border-top: 1px dashed var(--gray-200);">
                <div>
                    <div style="font-size: 0.75rem; color: var(--gray-500); margin-bottom: 2px;">Stock</div>
                    <div style="font-weight: 700; color: ${isLowStock ? 'var(--danger)' : 'var(--success)'}; font-size: 1.1rem;">
                        ${ing.stock}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; color: var(--gray-500); margin-bottom: 2px;">Cost / Unit</div>
                    <div style="font-weight: 600; color: var(--dark); font-size: 1rem;">
                        ${formatCurrency(ing.cost)}
                    </div>
                </div>
            </div>
            ${linkedProductsHtml}
        `;
        fragment.appendChild(card);
    });

    listContainer.appendChild(fragment);
}

// Toggle display of linked products under an ingredient
window.toggleLinkedProducts = function(event, ingId) {
    event.stopPropagation();
    const dropdown = document.getElementById(`dropdown-${ingId}`);
    const caret = document.getElementById(`caret-${ingId}`);
    if (!dropdown) return;

    const isHidden = dropdown.style.display === 'none';

    if (isHidden) {
        // Close all other open ingredient dropdowns
        const otherDropdowns = document.querySelectorAll('.ingredient-card [id^="dropdown-"]');
        otherDropdowns.forEach(dd => {
            if (dd.id !== `dropdown-${ingId}` && dd.style.display === 'flex') {
                dd.style.display = 'none';
                const otherIngId = dd.id.replace('dropdown-', '');
                const otherCaret = document.getElementById(`caret-${otherIngId}`);
                if (otherCaret) otherCaret.style.transform = 'rotate(0deg)';
                const otherCard = dd.closest('.ingredient-card') || dd.parentElement.parentElement;
                if (otherCard) {
                    otherCard.style.zIndex = 'auto';
                    otherCard.classList.remove('dropdown-open');
                }
            }
        });
    }

    const card = dropdown.closest('.ingredient-card') || dropdown.parentElement.parentElement;
    if (isHidden) {
        dropdown.style.display = 'flex';
        if (caret) caret.style.transform = 'rotate(180deg)';
        if (card) {
            card.style.zIndex = '10';
            card.classList.add('dropdown-open');
        }
        
        // Dynamically position dropdown: open upwards if it would go offscreen
        const cardRect = card.getBoundingClientRect();
        const spaceBelow = window.innerHeight - cardRect.bottom;
        if (spaceBelow < 180) {
            dropdown.style.top = 'auto';
            dropdown.style.bottom = 'calc(100% + 6px)';
            dropdown.style.boxShadow = '0 -10px 15px -3px rgba(0,0,0,0.1), 0 -4px 6px -2px rgba(0,0,0,0.05)';
        } else {
            dropdown.style.top = 'calc(100% + 6px)';
            dropdown.style.bottom = 'auto';
            dropdown.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
        }
    } else {
        dropdown.style.display = 'none';
        if (caret) caret.style.transform = 'rotate(0deg)';
        if (card) {
            card.style.zIndex = 'auto';
            card.classList.remove('dropdown-open');
        }
    }
};

// Ingredient Modal Functions
function showAddIngredientModal() {
    editingIngredientId = null;
    document.getElementById('ingredientModalTitle').textContent = 'Add Ingredient';
    document.getElementById('ingredientForm').reset();
    document.getElementById('ingredientId').value = '';
    document.getElementById('ingredientUnit').value = 'pieces'; // default

    const stockInGroup = document.getElementById('ingredientStockInGroup');
    if (stockInGroup) stockInGroup.style.display = 'none';
    const stockInInput = document.getElementById('ingredientStockIn');
    if (stockInInput) stockInInput.value = '';

    // Reset image
    if (typeof removeIngredientImage === 'function') removeIngredientImage();

    document.getElementById('ingredientModal').classList.add('active');
    document.body.classList.add('modal-open');
}

function closeIngredientModal() {
    document.getElementById('ingredientModal').classList.remove('active');
    document.body.classList.remove('modal-open');
}

async function editIngredient(id) {
    const ing = allIngredients.find(i => i.id === id);
    if (!ing) return;

    editingIngredientId = id;
    document.getElementById('ingredientModalTitle').textContent = 'Edit Ingredient';
    document.getElementById('ingredientId').value = ing.id;
    document.getElementById('ingredientName').value = ing.name;
    document.getElementById('ingredientUnit').value = ing.unit;
    document.getElementById('ingredientStock').value = ing.stock;
    document.getElementById('ingredientCost').value = ing.cost;

    const stockInGroup = document.getElementById('ingredientStockInGroup');
    if (stockInGroup) stockInGroup.style.display = 'block';
    const stockInInput = document.getElementById('ingredientStockIn');
    if (stockInInput) stockInInput.value = '';

    // Load existing image if any
    if (ing.image) {
        document.getElementById('ingredientImageUrl').value = ing.image;
        const preview = document.getElementById('ingredientImagePreview');
        if (preview) {
            preview.src = ing.image;
            preview.style.display = 'block';
        }
        const placeholder = document.getElementById('ingredientImagePlaceholderIcon');
        if (placeholder) placeholder.style.display = 'none';
        const removeBtn = document.getElementById('btnRemoveIngredientImage');
        if (removeBtn) removeBtn.style.display = 'block';
    } else {
        if (typeof removeIngredientImage === 'function') removeIngredientImage();
    }

    document.getElementById('ingredientModal').classList.add('active');
    document.body.classList.add('modal-open');
}

async function saveIngredient() {
    const name = document.getElementById('ingredientName').value.trim();
    const unit = document.getElementById('ingredientUnit').value;
    let stock = parseFloat(document.getElementById('ingredientStock').value) || 0;
    const cost = parseFloat(document.getElementById('ingredientCost').value) || 0;
    const image = document.getElementById('ingredientImageUrl')?.value || null;
    const lowStock = 10; // Default since field is removed

    const stockIn = parseFloat(document.getElementById('ingredientStockIn')?.value) || 0;
    if (editingIngredientId && stockIn > 0) {
        stock += stockIn;
    }

    if (!name) {
        showToast('Ingredient name is required', 'warning');
        return;
    }

    if (stock < 0 || cost < 0) {
        showToast('Stock and cost cannot be negative', 'warning');
        return;
    }

    showLoading('Saving ingredient...');

    try {
        const ingredientData = {
            name,
            unit,
            stock,
            cost,
            lowStock,
            image: image || null,
            updatedAt: new Date().toISOString()
        };

        if (editingIngredientId) {
            // Update
            await db.update('ingredients', { id: editingIngredientId, ...ingredientData });
            showToast('Ingredient updated successfully', 'success');
        } else {
            // Create
            ingredientData.createdAt = new Date().toISOString();
            await db.add('ingredients', ingredientData);
            showToast('Ingredient added successfully', 'success');
        }

        closeIngredientModal();
        await loadIngredientsData(); // Reload all to refresh UI
        if (typeof loadInventory === 'function') {
            await loadInventory();
        }

    } catch (error) {
        console.error('Error saving ingredient:', error);
        showToast('Failed to save ingredient', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteIngredient(id) {
    // Check if ingredient is used in any active product's recipe
    const [recipes, products] = await Promise.all([
        db.getAll('recipes'),
        db.getAll('products')
    ]);

    const productMap = new Map(products.map(p => [p.id, p]));
    const activeProductsUsing = [];

    for (const r of recipes) {
        if (r.ingredients.some(i => i.ingredientId === id)) {
            const product = productMap.get(r.productId);
            if (product) {
                activeProductsUsing.push(product);
            } else {
                // Automatically clean up orphaned recipe (product no longer exists)
                console.log(`Cleaning up orphaned recipe for deleted product ID: ${r.productId}`);
                db.delete('recipes', r.id).catch(err => console.error('Failed to clean up orphaned recipe:', err));
            }
        }
    }

    if (activeProductsUsing.length > 0) {
        const productNames = activeProductsUsing.map(p => p.name).join(', ');
        showToast(`Cannot delete: Ingredient is used in recipes for: ${productNames}`, 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this ingredient?')) return;

    showLoading('Deleting ingredient...');
    try {
        await db.delete('ingredients', id);
        showToast('Ingredient deleted successfully', 'success');
        await loadIngredientsData();
        if (typeof loadInventory === 'function') {
            await loadInventory();
        }
    } catch (error) {
        console.error('Error deleting ingredient:', error);
        showToast('Failed to delete ingredient', 'error');
    } finally {
        hideLoading();
    }
}

// Expose functions globally for the inventory tab access
window.editIngredient = editIngredient;
window.deleteIngredient = deleteIngredient;

