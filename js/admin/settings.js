// Settings Management

// Default settings
const DEFAULT_SETTINGS = {
    systemName: 'POS System',
    systemDescription: 'Point of Sale & Inventory Management',
    systemIcon: '🛒',
    currencySymbol: '₱'
};

// Load settings page
async function loadSettings() {
    const settings = getSettings();

    // Populate form with current settings
    document.getElementById('systemName').value = settings.systemName;
    document.getElementById('systemDescription').value = settings.systemDescription;
    document.getElementById('systemIcon').value = settings.systemIcon;
    document.getElementById('currencySymbol').value = settings.currencySymbol;

    // Setup form submission
    const form = document.getElementById('settingsForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveSettings();
    };
}

// Get current settings from localStorage
function getSettings() {
    const stored = localStorage.getItem('posSettings');
    if (stored) {
        try {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        } catch (e) {
            console.error('Error parsing settings:', e);
            return { ...DEFAULT_SETTINGS };
        }
    }
    return { ...DEFAULT_SETTINGS };
}

// Save settings
async function saveSettings() {
    try {
        const settings = {
            systemName: document.getElementById('systemName').value.trim() || DEFAULT_SETTINGS.systemName,
            systemDescription: document.getElementById('systemDescription').value.trim() || DEFAULT_SETTINGS.systemDescription,
            systemIcon: document.getElementById('systemIcon').value.trim() || DEFAULT_SETTINGS.systemIcon,
            currencySymbol: document.getElementById('currencySymbol').value.trim() || DEFAULT_SETTINGS.currencySymbol
        };

        // Validate
        if (!settings.systemName) {
            showToast('System name is required', 'error');
            return;
        }

        // Save to localStorage
        localStorage.setItem('posSettings', JSON.stringify(settings));

        showToast('Settings saved successfully! Changes will be visible on the login page.', 'success');

        // Update the sidebar logo if needed
        updateSidebarLogo(settings);

    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings: ' + error.message, 'error');
    }
}

// Reset settings to default
function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to default values?')) {
        localStorage.removeItem('posSettings');
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
function applyLoginSettings() {
    const settings = getSettings();

    // Update logo icon
    const logoIcon = document.querySelector('.login-logo');
    if (logoIcon) {
        logoIcon.textContent = settings.systemIcon;
    }

    // Update system name
    const systemNameEl = document.querySelector('.login-header h1');
    if (systemNameEl) {
        systemNameEl.textContent = settings.systemName;
    }

    // Update description
    const descriptionEl = document.querySelector('.login-header p');
    if (descriptionEl) {
        descriptionEl.textContent = settings.systemDescription;
    }

    // Update page title
    document.title = `${settings.systemName} - Login`;
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.getSettings = getSettings;
    window.applyLoginSettings = applyLoginSettings;
}
