// Settings Management

// Default settings
const DEFAULT_SETTINGS = {
    systemName: 'POS System',
    systemDescription: 'Point of Sale & Inventory Management',
    systemIcon: '🛒',
    adminEmail: '',
    lowStockThreshold: 10
};

// Load settings page
async function loadSettings() {
    const settings = await getSettings();

    // Populate form with current settings
    document.getElementById('systemName').value = settings.systemName;
    document.getElementById('systemDescription').value = settings.systemDescription;
    document.getElementById('systemIcon').value = settings.systemIcon;
    document.getElementById('adminEmail').value = settings.adminEmail || '';
    document.getElementById('lowStockThreshold').value = settings.lowStockThreshold;

    // Setup form submission
    const form = document.getElementById('settingsForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveSettings();
    };
}

// Get current settings from Firebase (with localStorage fallback)
async function getSettings() {
    // Get current user's storeId
    const currentUser = auth?.getCurrentUser?.();
    const storeId = currentUser?.storeId || 'default_store';

    try {
        // Try to load from Firebase first
        if (typeof db !== 'undefined') {
            let cloudSettings = null;

            // Try settings collection first
            const settingsDoc = await db.get('settings', `settings_${storeId}`);
            if (settingsDoc && settingsDoc.data) {
                cloudSettings = { ...DEFAULT_SETTINGS, ...settingsDoc.data };
            }

            // Try stores collection if not found
            if (!cloudSettings) {
                const storeDoc = await db.get('stores', storeId);
                if (storeDoc && storeDoc.settings) {
                    cloudSettings = { ...DEFAULT_SETTINGS, ...storeDoc.settings };
                }
            }

            if (cloudSettings) {
                // Always sync with user profile email if available
                if (currentUser?.email) {
                    cloudSettings.adminEmail = currentUser.email;
                }
                return cloudSettings;
            }
        }
    } catch (error) {
        console.log('Could not load settings from Firebase, using localStorage:', error);
    }

    // Fallback to localStorage
    const settingsKey = `posSettings_${storeId}`;
    const stored = localStorage.getItem(settingsKey);
    let finalSettings = { ...DEFAULT_SETTINGS };

    if (stored) {
        try {
            finalSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        } catch (e) {
            console.error('Error parsing settings:', e);
        }
    }

    // Override with user's specific email if available in session
    if (currentUser?.email) {
        finalSettings.adminEmail = currentUser.email;
    }

    return finalSettings;
}

// Synchronous version for immediate use (uses localStorage only)
function getSettingsSync() {
    const currentUser = auth?.getCurrentUser?.();
    const storeId = currentUser?.storeId || 'default_store';
    const settingsKey = `posSettings_${storeId}`;
    const stored = localStorage.getItem(settingsKey);

    let finalSettings = { ...DEFAULT_SETTINGS };

    if (stored) {
        try {
            finalSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        } catch (e) {
            console.error('Error parsing settings:', e);
        }
    }

    // Override with user's specific email if available in session
    if (currentUser?.email) {
        finalSettings.adminEmail = currentUser.email;
    }

    return finalSettings;
}

// Save settings
async function saveSettings() {
    try {
        const lowStockThreshold = parseInt(document.getElementById('lowStockThreshold').value);

        const settings = {
            systemName: document.getElementById('systemName').value.trim() || DEFAULT_SETTINGS.systemName,
            systemDescription: document.getElementById('systemDescription').value.trim() || DEFAULT_SETTINGS.systemDescription,
            systemIcon: document.getElementById('systemIcon').value.trim() || DEFAULT_SETTINGS.systemIcon,
            adminEmail: document.getElementById('adminEmail').value.trim(),
            lowStockThreshold: isNaN(lowStockThreshold) || lowStockThreshold < 0 ? DEFAULT_SETTINGS.lowStockThreshold : lowStockThreshold
        };

        // Validate
        if (!settings.systemName) {
            showToast('System name is required', 'error');
            return;
        }

        if (isNaN(settings.lowStockThreshold) || settings.lowStockThreshold < 0) {
            showToast('Low stock threshold must be a valid number', 'error');
            return;
        }

        // Get current user's storeId
        const currentUser = auth?.getCurrentUser?.();
        const storeId = currentUser?.storeId || 'default_store';

        // Save to store-specific localStorage key (for offline access)
        const settingsKey = `posSettings_${storeId}`;
        localStorage.setItem(settingsKey, JSON.stringify(settings));

        // Save to Firebase (for cross-device sync)
        try {
            if (typeof db !== 'undefined') {
                const settingsDocId = `settings_${storeId}`;

                // 1. Update/Create the document in the 'settings' collection (Primary Source)
                await db.set('settings', settingsDocId, {
                    data: settings,
                    storeId: storeId,
                    updatedAt: new Date().toISOString()
                });

                // 2. Update the store name in the stores collection
                const storeDoc = await db.get('stores', storeId);
                if (storeDoc) {
                    await db.update('stores', {
                        ...storeDoc,
                        name: settings.systemName,
                        settings: settings,
                        updatedAt: new Date().toISOString()
                    });
                }

                // 3. Update the admin email in the users collection (The Admin Account)
                if (currentUser && currentUser.id) {
                    await db.update('users', {
                        id: currentUser.id,
                        email: settings.adminEmail,
                        updatedAt: new Date().toISOString()
                    });

                    // Update current session in memory
                    currentUser.email = settings.adminEmail;
                    auth.saveSession(currentUser);
                }

                console.log('Settings saved to Firebase (settings, stores, & users collections)');
            }
        } catch (firebaseError) {
            console.warn('Could not save to Firebase, saved to localStorage only:', firebaseError);
        }

        showToast(`Settings Saved! Email: ${settings.adminEmail || '(none)'}`, 'success');

        // Update the sidebar logo if needed
        updateSidebarLogo(settings);

        // Update the store name display immediately
        if (typeof updateCurrentStoreName === 'function') {
            updateCurrentStoreName(settings.systemName);
        }

    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings: ' + error.message, 'error');
    }
}

// Reset settings to default
function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to default values?')) {
        // Get current user's storeId
        const currentUser = auth?.getCurrentUser?.();
        const storeId = currentUser?.storeId || 'default_store';

        // Remove store-specific settings
        const settingsKey = `posSettings_${storeId}`;
        localStorage.removeItem(settingsKey);

        loadSettings();
        showToast('Settings reset to default values', 'success');

        // Update the sidebar logo
        updateSidebarLogo(DEFAULT_SETTINGS);
    }
}

// Update sidebar logo with new settings
function updateSidebarLogo(settings) {
    const logoElement = document.querySelector('.admin-logo h1');
    if (logoElement) {
        logoElement.textContent = `${settings.systemIcon} ${settings.systemName}`;
    }
}

// Apply settings to login page (called from index.html)
// Note: Login page uses static text, only update page title
function applyLoginSettings() {
    // Update page title only
    document.title = 'POS System - Login';
}

// Get low stock threshold
function getLowStockThreshold() {
    const settings = getSettingsSync();
    return settings.lowStockThreshold || DEFAULT_SETTINGS.lowStockThreshold;
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.getSettings = getSettings;
    window.getSettingsSync = getSettingsSync;
    window.getLowStockThreshold = getLowStockThreshold;
    window.applyLoginSettings = applyLoginSettings;
}
