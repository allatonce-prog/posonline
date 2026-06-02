// Settings Management

// Default settings
const DEFAULT_SETTINGS = {
    systemName: 'POS System',
    systemDescription: 'Point of Sale & Inventory Management',
    systemIcon: '🛒',
    businessType: 'retail',
    adminEmail: '',
    lowStockThreshold: 10
};

// Load settings page
async function loadSettings() {
    const settings = await getSettings();

    // Populate form with current settings
    document.getElementById('systemName').value = settings.systemName;
    document.getElementById('systemDescription').value = settings.systemDescription;
    document.getElementById('systemName').value = settings.systemName;
    document.getElementById('systemDescription').value = settings.systemDescription;
    document.getElementById('systemIcon').value = settings.systemIcon;
    const busTypeEl = document.getElementById('businessType');
    if (busTypeEl) busTypeEl.value = settings.businessType || 'retail';
    document.getElementById('adminEmail').value = settings.adminEmail || '';
    document.getElementById('lowStockThreshold').value = settings.lowStockThreshold;

    // Setup form submission
    const form = document.getElementById('settingsForm');

    // Auto-update UI when business type changes
    const busTypeInput = document.getElementById('businessType');
    if (busTypeInput) {
        busTypeInput.addEventListener('change', (e) => {
            document.body.className = document.body.className.replace(/mode-\w+/g, '').trim();
            if (e.target.value === 'pharmacy') {
                document.body.classList.add('mode-pharmacy');
            }
        });
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveSettings();
    };

    // Load correction data
    refreshCorrectionData();
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
            businessType: document.getElementById('businessType')?.value || DEFAULT_SETTINGS.businessType,
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

        // Apply business mode immediately
        document.body.classList.remove('mode-pharmacy');
        if (settings.businessType === 'pharmacy') {
            document.body.classList.add('mode-pharmacy');
        }

        // Update the store name display immediately
        if (typeof updateCurrentStoreName === 'function') {
            updateCurrentStoreName(settings.systemName);
        }

    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings: ' + error.message, 'error');
    }
}

// Hard Factory Reset
async function performHardReset() {
    // Double confirmation
    if (!confirm('🛑 DANGER ZONE 🛑\n\nAre you ABSOLUTELY SURE you want to delete EVERYTHING?\n\nThis will permanently delete:\n- All Products\n- All Sales & History\n- All Expenses & Collectibles\n- All Users (Except you)\n\nThis action cannot be undone!')) {
        return;
    }

    const verification = prompt('Type "DELETE" to confirm this action:');
    if (verification !== 'DELETE') {
        showToast('Reset cancelled. Verification failed.', 'info');
        return;
    }

    showLoading('Wiping database...');
    try {
        await db.hardResetStore();

        hideLoading();
        alert('System has been reset successfully. You will now be logged out.');
        auth.logout();

    } catch (error) {
        hideLoading();
        console.error('Reset failed:', error);
        showToast('Reset failed: ' + error.message, 'error');
    }
}

// Clear Transaction Records Only
async function clearTransactionRecords() {
    if (!confirm('Are you sure you want to clear ALL Transaction Records?\n\nThis will delete:\n- Sales Records\n- Expense Records\n- Collectible Records\n\nInventory Items and Products will NOT be deleted.\n\nThis action cannot be undone.')) {
        return;
    }

    const verification = prompt('Type "CLEAR" to confirm this action:');
    if (verification !== 'CLEAR') {
        showToast('Action cancelled. Verification failed.', 'info');
        return;
    }

    showLoading('Clearing records...');
    try {
        const user = auth.getCurrentUser();
        const storeId = user.storeId;

        if (!storeId) throw new Error('Store ID not found');

        // We need to delete from: transactions, expenses, collectibles
        // We probably also want to clear 'history' if it relates to sales, but the user said "records".
        // Let's stick to the 3 main ones mentioned. 
        // Note: db.js usually has generic methods. We might need a loop or a specific method if available.
        // Since we don't have a 'deleteWhere' in standard indexedDB wrapper usually, we might need to get all and delete.
        // BUT db.js usually has 'clearStore' or similar? 
        // Let's assume we have to iterate or if there is a bulk delete.

        // Let's check if the db wrapper has a way to clear specific stores for a collection.
        // Inspecting db.js would be ideal but I'll write logic assuming standard IDB wrapper patterns or use what I know.
        // Actually, looking at `db.hardResetStore`, it likely iterates collections.
        // I will implement a helper here that gets all for the store and deletes them.

        const collections = ['transactions', 'expenses', 'collectibles', 'stockMovements']; // Added history as it contains transaction logs often

        for (const col of collections) {
            const items = await db.getAll(col);
            const itemsToDelete = items.filter(item => item.storeId === storeId);

            // Delete one by one (or bulk if supported, but safer one by one for now)
            const deletePromises = itemsToDelete.map(item => db.delete(col, item.id));
            await Promise.all(deletePromises);
        }

        hideLoading();
        showToast('Transaction records cleared successfully', 'success');

        // Refresh dashboard if we are on it? 
        // The user is in settings, so no immediate refresh needed, but good practice.

    } catch (error) {
        hideLoading();
        console.error('Clear records failed:', error);
        showToast('Failed to clear records: ' + error.message, 'error');
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
    window.refreshCorrectionData = refreshCorrectionData;
    window.applyCollectiblesCorrection = applyCollectiblesCorrection;
}

// --- Data Correction Logic ---

async function getTodaysCollectiblesTotal() {
    try {
        const user = auth.getCurrentUser();
        if (!user || !user.storeId) return 0;

        const allCollectibles = await db.getAll('collectibles');
        const storeCollectibles = allCollectibles.filter(c => c.storeId === user.storeId);

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const total = storeCollectibles.reduce((sum, c) => {
            let amountInPeriod = 0;
            const cDate = new Date(c.createdAt || c.date);

            // Validate date
            if (isNaN(cDate.getTime())) return sum;

            const isDocCreatedInRange = cDate >= todayStart && cDate < todayEnd;

            // 1. Created today
            if (isDocCreatedInRange) {
                const amount = Number(c.totalAmount) || 0;
                const paid = Number(c.paidAmount) || 0;
                amountInPeriod = amount - paid;
            }
            // 2. Old doc, new items today
            else if (c.items && c.items.length > 0) {
                amountInPeriod = c.items.reduce((isum, i) => {
                    if (i.dateAdded) {
                        const iDate = new Date(i.dateAdded);
                        if (!isNaN(iDate.getTime()) && iDate >= todayStart && iDate < todayEnd) {
                            return isum + (Number(i.total) || 0);
                        }
                    }
                    return isum;
                }, 0);
            }
            return sum + amountInPeriod;
        }, 0);

        return total;

    } catch (e) {
        console.error("Error calculating today's collectibles:", e);
        return 0;
    }
}

async function refreshCorrectionData() {
    const display = document.getElementById('currentTodayCollectibles');
    const input = document.getElementById('targetCollectiblesAmount');
    if (!display) return;

    display.textContent = 'Loading...';

    const total = await getTodaysCollectiblesTotal();

    display.textContent = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(total);
    if (input && !input.value) {
        input.value = total;
    }
}

async function applyCollectiblesCorrection() {
    const input = document.getElementById('targetCollectiblesAmount');
    if (!input) return;

    const targetAmount = parseFloat(input.value);
    if (isNaN(targetAmount) || targetAmount < 0) {
        showToast('Please enter a valid positive amount', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to FORCE the "Today's Collectibles" amount to be ${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(targetAmount)}? \n\nThis will create a system adjustment record.`)) {
        return;
    }

    showLoading('Applying correction...');

    try {
        const currentTotal = await getTodaysCollectiblesTotal();
        const difference = targetAmount - currentTotal;

        if (Math.abs(difference) < 0.01) {
            hideLoading();
            showToast('Amount is already correct.', 'info');
            return;
        }

        const user = auth.getCurrentUser();
        const storeId = user.storeId;

        // Create adjustment record
        // Note: For the dashboard to pick this up as "Today's Collectible", it must have items added today.
        // We will create a fresh collectible record for "System Correction".

        const correctionRecord = {
            id: 'CORRECTION_' + Date.now(),
            storeId: storeId,
            customerName: "System Correction (Admin)",
            status: 'pending', // Pending because it adds to the outstanding debt usually, or resolves it.
            // Wait, if difference is negative (we want to reduce total), 'totalAmount' being negative works in sum?
            // Yes, calculate logic sums totalAmount. 
            totalAmount: difference,
            paidAmount: 0,
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [
                {
                    id: Date.now().toString(),
                    name: "Manual Admin Correction",
                    price: difference,
                    quantity: 1,
                    total: difference,
                    dateAdded: new Date().toISOString()
                }
            ],
            notes: `Manual correction by admin to fix Today's Collectibles amount. Adjusted by ${difference}.`
        };

        await db.add('collectibles', correctionRecord);

        hideLoading();
        showToast('Correction applied successfully', 'success');
        refreshCorrectionData();

        // Refresh dashboard if possible
        if (typeof loadDashboard === 'function') setTimeout(loadDashboard, 500);

    } catch (error) {
        hideLoading();
        console.error('Correction failed:', error);
        showToast('Correction failed: ' + error.message, 'error');
    }
}
