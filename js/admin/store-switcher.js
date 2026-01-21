// Store Switcher Functionality
// Allows admins to switch between stores they manage

// Initialize store switcher
async function initStoreSwitcher() {
    try {
        const currentUser = auth.getCurrentUser();
        if (!currentUser) return;

        // Fetch the actual store name from Firebase
        let storeName = 'Unknown Store';
        try {
            const store = await db.get('stores', currentUser.storeId);
            if (store && store.name) {
                storeName = store.name;

                // Update session with the latest store name
                const updatedUser = {
                    ...currentUser,
                    storeName: storeName
                };
                auth.saveSession(updatedUser);
            }
        } catch (error) {
            console.warn('Could not fetch store name from Firebase:', error);
            // Fallback to session storeName
            storeName = currentUser.storeName || 'Unknown Store';
        }

        // Update current store name display
        updateCurrentStoreName(storeName);

        // Load all stores (for future super admin feature)
        // For now, just show the current store
        await loadUserStores();
    } catch (error) {
        console.error('Error initializing store switcher:', error);
    }
}

// Update the current store name display
function updateCurrentStoreName(storeName) {
    const storeNameElement = document.getElementById('currentStoreName');
    if (storeNameElement) {
        storeNameElement.textContent = `📍 ${storeName}`;
    }

    // Also update in sidebar
    const sidebarStoreName = document.getElementById('adminStoreName');
    if (sidebarStoreName) {
        sidebarStoreName.textContent = `📍 ${storeName}`;
    }
}

// Load stores that the current user has access to
async function loadUserStores() {
    try {
        const currentUser = auth.getCurrentUser();
        if (!currentUser) return;

        // Get all stores from Firebase
        const stores = await db.getAll('stores');

        // For now, users can only access their own store
        // In the future, super admins could access multiple stores
        const userStores = stores.filter(store => store.id === currentUser.storeId || store.storeId === currentUser.storeId);

        // If user has access to multiple stores, show the switcher
        if (userStores.length > 1) {
            populateStoreSwitcher(userStores, currentUser.storeId);
        } else {
            // Hide the switcher if only one store
            const switcherContainer = document.getElementById('storeSwitcherContainer');
            if (switcherContainer) {
                switcherContainer.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading user stores:', error);
    }
}

// Populate the store switcher dropdown
function populateStoreSwitcher(stores, currentStoreId) {
    const switcher = document.getElementById('storeSwitcher');
    const container = document.getElementById('storeSwitcherContainer');

    if (!switcher || !container) return;

    // Clear existing options
    switcher.innerHTML = '';

    // Add stores
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store.id || store.storeId;
        option.textContent = store.name;
        option.selected = (store.id === currentStoreId || store.storeId === currentStoreId);
        switcher.appendChild(option);
    });

    // Show the container
    container.style.display = 'block';

    // Add change event listener
    switcher.addEventListener('change', handleStoreSwitch);
}

// Handle store switch
async function handleStoreSwitch(event) {
    const newStoreId = event.target.value;
    const currentUser = auth.getCurrentUser();

    if (!newStoreId || newStoreId === currentUser.storeId) {
        return;
    }

    // Confirm switch
    if (!confirm('Switch to this store? The page will reload.')) {
        // Reset to current store
        event.target.value = currentUser.storeId;
        return;
    }

    try {
        // Get the new store details
        const newStore = await db.get('stores', newStoreId);
        if (!newStore) {
            showToast('Store not found', 'error');
            return;
        }

        // Update user session with new store
        const updatedUser = {
            ...currentUser,
            storeId: newStoreId,
            storeName: newStore.name
        };

        // Save updated session
        auth.saveSession(updatedUser);

        // Reload the page to reflect new store
        showToast('Switching store...', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 500);

    } catch (error) {
        console.error('Error switching store:', error);
        showToast('Error switching store: ' + error.message, 'error');
        // Reset to current store
        event.target.value = currentUser.storeId;
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.initStoreSwitcher = initStoreSwitcher;
    window.updateCurrentStoreName = updateCurrentStoreName;
}
