// Admin Dashboard Main Script
let currentTab = 'dashboard';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication and role
    if (!auth.requireRole('admin')) return;

    // Display user name and store name
    const user = auth.getCurrentUser();
    document.getElementById('adminName').textContent = user.name || user.username;

    // Display store name if available
    if (user.storeName) {
        document.getElementById('adminStoreName').textContent = `📍 ${user.storeName}`;
    }

    // Identify user to Tawk.to Support
    if (typeof identifyTawkUser === 'function') {
        identifyTawkUser(user);
    }

    // Apply custom settings
    if (typeof getSettingsSync === 'function') {
        const settings = getSettingsSync();

        // Update sidebar logo
        const logoTitle = document.getElementById('adminLogoTitle');
        if (logoTitle) {
            logoTitle.textContent = `${settings.systemIcon} ${settings.systemName}`;
        }

        // Update page title
        document.title = `Admin Dashboard - ${settings.systemName}`;
    }

    // Setup mobile menu
    setupMobileMenu();

    // Initialize database
    showLoading('Loading dashboard...');
    try {
        await db.init();
        await loadDashboard();

        // Initialize store switcher
        if (typeof initStoreSwitcher === 'function') {
            await initStoreSwitcher();
        }

        // Clear error tracking on successful load
        sessionStorage.removeItem('errorReloadCount');
        sessionStorage.removeItem('lastErrorTime');

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Dashboard initialization error:', error);

        // Provide specific error messages
        let errorMessage = 'Error loading dashboard';
        if (error.message) {
            if (error.message.includes('IndexedDB')) {
                errorMessage = 'Database error. Please clear your browser cache and try again.';
            } else if (error.message.includes('Firebase') || error.message.includes('network')) {
                errorMessage = 'Connection error. Please check your internet connection.';
            } else if (error.message.includes('permission')) {
                errorMessage = 'Permission denied. Please check your account access.';
            } else {
                errorMessage = 'Error: ' + error.message;
            }
        }

        showToast(errorMessage, 'error');

        // Don't throw - let the page stay loaded so user can manually refresh
    }

    // Setup navigation
    setupNavigation();

    // Setup desktop sidebar collapse
    setupDesktopSidebarCollapse();
});

// Setup mobile menu
function setupMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('overlay');

    if (!mobileMenuToggle || !sidebar || !overlay) return;

    // Toggle button click
    mobileMenuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = sidebar.classList.contains('open');

        if (isOpen) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    });

    // Close when clicking outside sidebar (overlay area or main content)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024 && sidebar.classList.contains('open')) {
            const isClickInsideSidebar = sidebar.contains(e.target);
            const isClickOnToggle = mobileMenuToggle.contains(e.target);

            if (!isClickInsideSidebar && !isClickOnToggle) {
                closeMobileMenu();
            }
        }
    });

    // Close menu when window resizes to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            closeMobileMenu();
        }
    });
}

// Open mobile menu - SIMPLE CLASS-BASED (iOS Compatible)
function openMobileMenu() {
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('overlay');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');

    if (!sidebar || !overlay || !mobileMenuToggle) return;

    // Add classes
    sidebar.classList.add('open');
    overlay.classList.add('active');
    mobileMenuToggle.classList.add('active');

    // Update toggle icon
    const icon = mobileMenuToggle.querySelector('i');
    if (icon) {
        icon.className = 'ph ph-x';
    }
}

// Close mobile menu - SIMPLE CLASS-BASED
function closeMobileMenu() {
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('overlay');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');

    if (!sidebar || !overlay || !mobileMenuToggle) return;

    // Remove classes
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    mobileMenuToggle.classList.remove('active');

    // Update toggle icon
    const icon = mobileMenuToggle.querySelector('i');
    if (icon) {
        icon.className = 'ph ph-list';
    }
}

// Setup navigation
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        // iOS FIX: Use both click and touchend events
        const handleNavClick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const tab = item.dataset.tab;
            switchTab(tab);

            // Close mobile menu when switching tabs
            closeMobileMenu();
        };

        // Add both click and touch events for maximum iOS compatibility
        item.addEventListener('click', handleNavClick);
        item.addEventListener('touchend', handleNavClick, { passive: false });

        // iOS: Ensure item is always interactive
        item.style.cssText = `
            cursor: pointer !important;
            -webkit-tap-highlight-color: rgba(255,255,255,0.1) !important;
            -webkit-user-select: none !important;
            user-select: none !important;
            pointer-events: auto !important;
            position: relative !important;
            z-index: 100 !important;
        `;
    });

    // Setup collapsible section toggling dynamically (prevents inline handler errors)
    const sectionHeaders = document.querySelectorAll('.nav-section-header');
    sectionHeaders.forEach(header => {
        const handleHeaderClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const section = header.closest('.nav-section');
            if (section) {
                section.classList.toggle('collapsed');
            }
        };

        header.addEventListener('click', handleHeaderClick);
        header.addEventListener('touchend', handleHeaderClick, { passive: false });

        header.style.cssText = `
            cursor: pointer !important;
            -webkit-tap-highlight-color: rgba(255,255,255,0.1) !important;
            -webkit-user-select: none !important;
            user-select: none !important;
            pointer-events: auto !important;
            position: relative !important;
            z-index: 100 !important;
        `;
    });
}

// Switch tab (optimized for mobile stability and white screen prevention)
async function switchTab(tab) {
    if (currentTab === tab) {
        // If already on this tab, force reload to fix white screen
        console.log('Force reloading current tab:', tab);
    }

    // Cleanup before switching (prevent memory leaks)
    try {
        if (window.mobileStability && typeof window.mobileStability.cleanupForTabSwitch === 'function') {
            window.mobileStability.cleanupForTabSwitch();
        }
    } catch (e) {
        console.warn('Mobile stability cleanup failed:', e);
    }

    // Clear any active charts/intervals from previous tab
    try {
        if (window.activeChartInstances) {
            window.activeChartInstances.forEach(chart => {
                try {
                    chart.destroy();
                } catch (e) {
                    console.warn('Error destroying chart:', e);
                }
            });
            window.activeChartInstances = [];
        }
    } catch (e) {
        console.warn('Chart cleanup failed:', e);
    }

    // Update navigation and auto-expand parent section
    document.querySelectorAll('.nav-item').forEach(item => {
        const isActive = item.dataset.tab === tab;
        item.classList.toggle('active', isActive);
        if (isActive) {
            const section = item.closest('.nav-section');
            if (section) {
                section.classList.remove('collapsed');
            }
        }
    });

    // Update sidebar subtitle with smooth slide/fade animation
    const sidebarSubTitle = document.getElementById('adminSidebarSubTitle');
    if (sidebarSubTitle) {
        sidebarSubTitle.classList.add('text-transitioning');
        
        setTimeout(() => {
            const tabNames = {
                dashboard: 'Dashboard',
                products: 'Products',
                recipes: 'Recipes',
                modifiers: 'Modifiers',
                inventory: 'Inventory',
                history: 'History',
                sales: 'Sales',
                'item-sales': 'Item Sales',
                collections: 'Collections',
                collectibles: 'Collectibles',
                expenses: 'Expenses',
                salaries: 'Salaries',
                deliveries: 'Deliveries',
                reports: 'Reports',
                users: 'Users',
                settings: 'Settings'
            };
            const displayName = tabNames[tab] || (tab.charAt(0).toUpperCase() + tab.slice(1));
            sidebarSubTitle.textContent = `Admin ${displayName}`;
            sidebarSubTitle.classList.remove('text-transitioning');
        }, 150);
    }

    // Update tabs with smooth transition
    const allTabs = document.querySelectorAll('.tabs');
    allTabs.forEach(tabContent => {
        tabContent.classList.remove('active');
        tabContent.style.display = 'none'; // CRITICAL FIX: Explicitly hide previous tabs

        // Store scroll position
        if (tabContent.scrollTop > 0) {
            tabContent.dataset.scrollTop = tabContent.scrollTop;
        }
    });

    // Hide all tabs
    document.querySelectorAll('.tabs').forEach(t => t.classList.remove('active'));

    // Stop dashboard auto-refresh when leaving dashboard
    if (currentTab === 'dashboard' && tab !== 'dashboard') {
        if (typeof stopDashboardAutoRefresh === 'function') {
            stopDashboardAutoRefresh();
        }
    }

    // Show selected tab
    const selectedTab = document.getElementById(`${tab}-tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
        // Force display to ensure visibility
        selectedTab.style.display = 'block';
        selectedTab.style.opacity = '1';

        // Reset scroll position of the main container
        const adminMain = document.querySelector('.admin-main');
        if (adminMain) {
            adminMain.scrollTop = 0;
        }
    } else {
        console.error(`Tab element not found: ${tab}-tab`);
        showToast('Error loading tab. Please refresh.', 'error');
        return;
    }

    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        products: 'Products',
        recipes: 'Recipe Management',
        inventory: 'Inventory Management',
        sales: 'Sales Records',
        'item-sales': 'Item Sales',
        collections: 'Daily Collections',
        expenses: 'Expenses Tracking',
        salaries: 'Staff Salaries',
        collectibles: 'Collectibles Monitoring',
        reports: 'Reports & Analytics',
        users: 'User Management',
        settings: 'System Settings',
        history: 'Stock Movement History'
    };
    document.getElementById('pageTitle').textContent = titles[tab] || tab;

    currentTab = tab;

    // Toggle Chat and Connection Status (Only visible on Dashboard)
    const connStatus = document.getElementById('connection-status');
    const isDashboard = (tab === 'dashboard');

    if (connStatus) {
        connStatus.style.display = isDashboard ? 'flex' : 'none';
    }

    if (window.Tawk_API) {
        if (isDashboard) {
            if (window.Tawk_API.showWidget) window.Tawk_API.showWidget();
        } else {
            if (window.Tawk_API.hideWidget) window.Tawk_API.hideWidget();
        }
    }

    // Load tab data with retry mechanism
    // showLoading('Loading...'); // REMOVED for faster feel

    let retryCount = 0;
    const maxRetries = 2;

    const loadWithRetry = async () => {
        try {
            await loadTabContent(tab);
            // hideLoading(); // REMOVED

            // Verify content was actually loaded
            if (selectedTab && !selectedTab.hasChildNodes()) {
                throw new Error('Tab content empty after load');
            }

        } catch (error) {
            console.error('Tab loading error (attempt ' + (retryCount + 1) + '):', error);

            if (retryCount < maxRetries) {
                retryCount++;
                console.log('Retrying tab load...');
                setTimeout(() => loadWithRetry(), 500);
            } else {
                // hideLoading(); // REMOVED
                showToast('Error loading data. Swipe down to refresh.', 'error');

                // Show error state in tab
                if (selectedTab) {
                    selectedTab.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; color: var(--gray-600); padding: 2rem;">
                            <i class="ph ph-warning-circle" style="font-size: 4rem; margin-bottom: 1rem; color: var(--warning);"></i>
                            <h3>Failed to Load</h3>
                            <p style="margin-bottom: 1rem; text-align: center;">An error occurred while loading this page.</p>
                            <button class="btn btn-primary" onclick="switchTab('${tab}')">
                                <i class="ph ph-arrow-clockwise"></i> Try Again
                            </button>
                            <p style="margin-top: 1rem; font-size: 0.85rem; color: var(--gray-500);">Or swipe down to refresh</p>
                        </div>
                    `;
                }
            }
        }
    };

    // Execute immediately without idle callback for instant feel
    loadWithRetry();
}

// Separate function for loading tab content
async function loadTabContent(tab) {
    switch (tab) {
        case 'dashboard':
            // Always refresh dashboard to get latest data including deliveries
            // Use current range or default to today to keep labels consistent
            // If already loaded once, do it silently to prevent annoying loading screens
            const isSilent = window.dashboardLoadedOnce || false;
            await loadDashboardWithRange((typeof currentTimeRange !== 'undefined') ? currentTimeRange : 'today', isSilent);
            window.dashboardLoadedOnce = true;
            break;
        case 'products':
            await loadProducts();
            break;
        case 'recipes':
            if (typeof loadIngredientsData === 'function') {
                await loadIngredientsData();
            } else if (typeof loadRecipeData === 'function') {
                // Fallback if rename didn't propagate
                await loadRecipeData();
            }
            break;
        case 'modifiers':
            if (typeof loadModifiers === 'function') {
                await loadModifiers();
            } else {
                console.error('loadModifiers function not found');
            }
            break;
        case 'inventory':
            await loadInventory();
            break;
        case 'history':
            if (typeof loadStockMovements === 'function') {
                await loadStockMovements();
            } else {
                console.warn('loadStockMovements not found');
            }
            break;
        case 'sales':
            await loadSales();
            break;
        case 'item-sales':
            if (typeof loadItemSales === 'function') {
                await loadItemSales();
            }
            break;
        case 'collections':
            if (typeof loadCollections === 'function') {
                await loadCollections();
            } else {
                console.warn('loadCollections not found');
            }
            break;
        case 'expenses':
            await loadExpenses();
            break;
        case 'salaries':
            await loadSalaries();
            break;
        case 'deliveries':
            await loadDeliveries();
            break;
        case 'collectibles':
            await loadCollectibles();
            break;
        case 'reports':
            await loadReports();
            break;
        case 'users':
            await loadUsers();
            break;
        case 'settings':
            await loadSettings();
            break;
    }
}

// Load dashboard
// Load dashboard
// Load dashboard
async function loadDashboard() {
    // Rely on the robust implementation in time-range.js which handles:
    // - Date filtering (defaults to 'today')
    // - Store filtering (unlike old admin.js implementation)
    // - Stats calculation
    // - Charts update
    // - Transactions table update

    // Ensure we start with 'today' as requested
    if (typeof loadDashboardWithRange === 'function') {
        // We set the global variable if accessible, though time-range.js manages its own state
        // Re-setting it here guarantees consistency
        if (typeof currentTimeRange !== 'undefined') {
            currentTimeRange = 'today';
        }

        // Update the display text to match
        if (typeof updateRangeDisplay === 'function') {
            updateRangeDisplay('today');
        }

        await loadDashboardWithRange('today');
        window.dashboardLoadedOnce = true;
    } else {
        console.error('loadDashboardWithRange is not available');
        showToast('Error loading dashboard modules', 'error');
    }

    // Start auto-refresh for real-time updates
    if (typeof startDashboardAutoRefresh === 'function') {
        startDashboardAutoRefresh();
    }
}

// Navigate to specific transaction
window.viewTransactionFromDashboard = function (id) {
    // 1. Switch to Sales tab
    switchTab('sales');

    // 2. Wait a moment for the tab to activate and potentially load data
    // Then trigger viewTransaction which is defined in js/admin/sales.js
    setTimeout(() => {
        if (typeof viewTransaction === 'function') {
            viewTransaction(id);
        } else {
            console.error('viewTransaction function not found');
            showToast('Error opening transaction details', 'error');
        }
    }, 100);
};

// Setup desktop sidebar collapse with persistence
function setupDesktopSidebarCollapse() {
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const adminLayout = document.querySelector('.admin-layout');

    if (!sidebarToggleBtn || !adminLayout) return;

    // Load initial state from localStorage
    const isCollapsed = localStorage.getItem('admin_sidebar_collapsed') === 'true';
    if (isCollapsed) {
        adminLayout.classList.add('sidebar-collapsed');
    }

    sidebarToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const collapsed = adminLayout.classList.toggle('sidebar-collapsed');
        localStorage.setItem('admin_sidebar_collapsed', collapsed);

        // Dispatch window resize events smoothly during the 350ms transition
        // to force Chart.js and other responsive elements to redraw dynamically.
        const duration = 380; // slightly longer than 350ms CSS transition
        const start = performance.now();
        
        function tick(now) {
            window.dispatchEvent(new Event('resize'));
            if (now - start < duration) {
                requestAnimationFrame(tick);
            }
        }
        requestAnimationFrame(tick);
    });
}

// Toggle nav section accordion
window.toggleNavSection = function(sectionId) {
    const section = document.getElementById(`section-${sectionId}`);
    if (section) {
        section.classList.toggle('collapsed');
    }
};
