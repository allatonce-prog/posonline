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

    // Setup Dark Mode toggle
    setupDarkMode();

    // Setup Sidebar Menu Search
    setupSidebarSearch();

    // Setup URL Hash-based routing
    setupHashRouting();

    // Setup Keyboard Command Palette
    setupCommandPalette();

    // Setup Connection Status Badge
    setupConnectionStatusListeners();

    // Setup Crash Recovery Boundary
    setupCrashBoundary();

    // Setup Sidebar Hover Pre-fetching
    setupHoverPrefetching();
});

// Setup mobile menu
function setupMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const bottomMenuToggle = document.getElementById('bottomMenuToggle');
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('overlay');

    if (!sidebar || !overlay) return;

    const handleToggle = (e) => {
        e.stopPropagation();
        const isOpen = sidebar.classList.contains('open');

        if (isOpen) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    };

    // Toggle button click
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', handleToggle);
    }
    if (bottomMenuToggle) {
        bottomMenuToggle.addEventListener('click', handleToggle);
    }

    // Close when clicking outside sidebar (overlay area or main content)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024 && sidebar.classList.contains('open')) {
            const isClickInsideSidebar = sidebar.contains(e.target);
            const isClickOnToggle = (mobileMenuToggle && mobileMenuToggle.contains(e.target)) || 
                                    (bottomMenuToggle && bottomMenuToggle.contains(e.target));

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

    // Update active highlight on mobile bottom nav bar
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
    });

    // Update dynamic header breadcrumbs path
    const parentSections = {
        dashboard: 'Overview',
        reports: 'Overview',
        products: 'Catalog',
        recipes: 'Catalog',
        modifiers: 'Catalog',
        inventory: 'Operations',
        history: 'Operations',
        deliveries: 'Operations',
        sales: 'Finance',
        'item-sales': 'Finance',
        collections: 'Finance',
        collectibles: 'Finance',
        expenses: 'Finance',
        salaries: 'Finance',
        users: 'Management',
        settings: 'Management'
    };
    
    const parentName = parentSections[tab] || 'System';
    const breadcrumbEl = document.getElementById('adminBreadcrumbs');
    if (breadcrumbEl) {
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
        breadcrumbEl.textContent = `${parentName} / ${displayName}`;
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

    // Update URL hash and localStorage routing preference
    if (window.location.hash.substring(1) !== tab) {
        history.replaceState(null, '', '#' + tab);
    }
    localStorage.setItem('last_admin_tab', tab);

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

/* ==========================================
   Admin Enhancements (UI/UX Tasks)
   ========================================== */

// 1. Dark Mode Setup
function setupDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (!darkModeToggle) return;

    const applyDarkMode = (isDark) => {
        if (isDark) {
            document.body.classList.add('dark-mode');
            const icon = darkModeToggle.querySelector('i');
            if (icon) {
                icon.className = 'ph ph-sun';
            }
        } else {
            document.body.classList.remove('dark-mode');
            const icon = darkModeToggle.querySelector('i');
            if (icon) {
                icon.className = 'ph ph-moon';
            }
        }
    };

    // Load initial preference (defaults to system preference)
    const storedPref = localStorage.getItem('admin_dark_mode');
    const systemPref = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = storedPref === 'true' || (storedPref === null && systemPref);
    
    applyDarkMode(initialDark);

    darkModeToggle.addEventListener('click', () => {
        const isCurrentlyDark = document.body.classList.contains('dark-mode');
        const newDarkState = !isCurrentlyDark;
        applyDarkMode(newDarkState);
        localStorage.setItem('admin_dark_mode', newDarkState);
        window.dispatchEvent(new Event('themechange'));
    });
}

// 2. Sidebar Search
function setupSidebarSearch() {
    const sidebarSearch = document.getElementById('sidebarSearch');
    if (!sidebarSearch) return;

    sidebarSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const navSections = document.querySelectorAll('.nav-section');

        navSections.forEach(section => {
            const navItems = section.querySelectorAll('.nav-item');
            let hasVisibleItem = false;

            navItems.forEach(item => {
                const text = item.querySelector('span').textContent.toLowerCase();
                if (text.includes(query)) {
                    item.classList.remove('search-hidden');
                    hasVisibleItem = true;
                } else {
                    item.classList.add('search-hidden');
                }
            });

            // Expand and show section if matching, or hide if no matches
            if (query === '') {
                section.classList.remove('search-hidden');
            } else if (hasVisibleItem) {
                section.classList.remove('search-hidden');
                section.classList.remove('collapsed');
            } else {
                section.classList.add('search-hidden');
            }
        });
    });
}

// 3. Hash Routing Setup
function setupHashRouting() {
    const validTabs = ['dashboard', 'products', 'recipes', 'modifiers', 'inventory', 'history', 'sales', 'item-sales', 'collections', 'collectibles', 'expenses', 'salaries', 'deliveries', 'reports', 'users', 'settings'];
    
    const handleHashChange = () => {
        const hash = window.location.hash.substring(1);
        if (hash && validTabs.includes(hash)) {
            if (currentTab !== hash) {
                switchTab(hash);
            }
        }
    };

    window.addEventListener('hashchange', handleHashChange);
    
    // Navigate to hash or fallback to last active stored tab on initial load
    const initialHash = window.location.hash.substring(1);
    if (initialHash && validTabs.includes(initialHash)) {
        switchTab(initialHash);
    } else {
        const storedTab = localStorage.getItem('last_admin_tab');
        if (storedTab && validTabs.includes(storedTab) && storedTab !== 'dashboard') {
            switchTab(storedTab);
        }
    }
}

// 4. Command Palette Setup
function setupCommandPalette() {
    const palette = document.getElementById('commandPalette');
    const input = document.getElementById('commandPaletteInput');
    const list = document.getElementById('commandPaletteList');
    if (!palette || !input || !list) return;

    let selectedIndex = 0;
    let visibleCommands = [];

    const commands = [
        { name: 'Toggle Dark Mode', icon: 'ph-moon-stars', action: () => document.getElementById('darkModeToggle')?.click(), shortcut: 'Ctrl + D' },
        { name: 'Go to Dashboard', icon: 'ph-gauge', action: () => switchTab('dashboard'), shortcut: 'G + D' },
        { name: 'Go to Products', icon: 'ph-package', action: () => switchTab('products'), shortcut: 'G + P' },
        { name: 'Go to Recipes', icon: 'ph-hamburger', action: () => switchTab('recipes'), shortcut: 'G + R' },
        { name: 'Go to Inventory', icon: 'ph-clipboard-text', action: () => switchTab('inventory'), shortcut: 'G + I' },
        { name: 'Go to Sales Records', icon: 'ph-receipt', action: () => switchTab('sales'), shortcut: 'G + S' },
        { name: 'Record Expense', icon: 'ph-money', action: () => { if (typeof showAddExpenseModal === 'function') showAddExpenseModal(); }, shortcut: 'C + E' },
        { name: 'New Stock In', icon: 'ph-download-simple', action: () => { if (typeof showStockInModal === 'function') showStockInModal(); }, shortcut: 'C + I' },
        { name: 'Add Product', icon: 'ph-plus', action: () => { if (typeof showAddProductModal === 'function') showAddProductModal(); }, shortcut: 'C + P' },
        { name: 'New Delivery', icon: 'ph-truck', action: () => { if (typeof showAddDeliveryModal === 'function') showAddDeliveryModal(); }, shortcut: 'C + L' }
    ];

    const render = (query = '') => {
        list.innerHTML = '';
        visibleCommands = commands.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
        
        if (visibleCommands.length === 0) {
            list.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--gray-400);">No commands found.</div>';
            return;
        }

        visibleCommands.forEach((cmd, idx) => {
            const item = document.createElement('div');
            item.className = `command-item ${idx === selectedIndex ? 'active' : ''}`;
            item.innerHTML = `
                <div class="command-item-left">
                    <i class="ph ${cmd.icon} command-item-icon"></i>
                    <span>${cmd.name}</span>
                </div>
                <span class="command-item-shortcut">${cmd.shortcut}</span>
            `;
            item.addEventListener('click', () => {
                cmd.action();
                closePalette();
            });
            list.appendChild(item);
        });
    };

    const openPalette = () => {
        palette.style.display = 'flex';
        input.value = '';
        selectedIndex = 0;
        render();
        setTimeout(() => input.focus(), 50);
    };

    const closePalette = () => {
        palette.style.display = 'none';
    };

    // Keyboard triggers
    window.addEventListener('keydown', (e) => {
        // Ctrl + K or slash (/) if not inside input elements
        if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && document.activeElement !== input && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA')) {
            e.preventDefault();
            if (palette.style.display === 'none' || !palette.style.display) {
                openPalette();
            } else {
                closePalette();
            }
        } else if (e.key === 'Escape' && palette.style.display === 'flex') {
            closePalette();
        }
    });

    palette.addEventListener('click', (e) => {
        if (e.target === palette) {
            closePalette();
        }
    });

    // Arrow navigation inside input
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % visibleCommands.length;
            render(input.value);
            scrollToActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + visibleCommands.length) % visibleCommands.length;
            render(input.value);
            scrollToActive();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (visibleCommands[selectedIndex]) {
                visibleCommands[selectedIndex].action();
                closePalette();
            }
        }
    });

    input.addEventListener('input', (e) => {
        selectedIndex = 0;
        render(e.target.value);
    });

    function scrollToActive() {
        const active = list.querySelector('.command-item.active');
        if (active) {
            active.scrollIntoView({ block: 'nearest' });
        }
    }
}

// 5. Connection Status Setup
function setupConnectionStatusListeners() {
    const badge = document.getElementById('connectionStatusBadge');
    if (!badge) return;

    const updateStatus = () => {
        const isOnline = navigator.onLine;
        if (isOnline) {
            badge.className = 'connection-status-badge online';
            badge.title = 'Connection: Online';
            badge.querySelector('.status-text').textContent = 'Online';
            showToast('Connection restored. Database features are fully syncable.', 'success');
        } else {
            badge.className = 'connection-status-badge offline';
            badge.title = 'Connection: Offline';
            badge.querySelector('.status-text').textContent = 'Offline';
            showToast('You are offline. Data is saved locally in IndexedDB.', 'warning');
        }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    // Initial check
    if (!navigator.onLine) {
        badge.className = 'connection-status-badge offline';
        badge.title = 'Connection: Offline';
        badge.querySelector('.status-text').textContent = 'Offline';
    }
}

// 6. Global JS Crash Recovery Boundary Setup
function setupCrashBoundary() {
    const handleGlobalError = (errorMsg, url, lineNumber, column, errorObj) => {
        // Prevent duplicate overlays
        if (document.querySelector('.recovery-overlay')) return false;

        const backdrop = document.createElement('div');
        backdrop.className = 'recovery-overlay';
        backdrop.innerHTML = `
            <div class="recovery-card">
                <i class="ph ph-warning-octagon recovery-icon"></i>
                <h3 class="recovery-title">App Interface Error</h3>
                <p class="recovery-desc">An unexpected script execution error has occurred. Your local store transactions and inventory data remain safe in local storage.</p>
                <div class="recovery-details">
                    <strong>Error:</strong> ${errorMsg}<br>
                    <strong>Location:</strong> ${url}:${lineNumber}:${column}
                </div>
                <button class="btn btn-primary" onclick="window.location.reload(true)" style="width: 100%; justify-content: center; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="ph ph-arrow-clockwise"></i> Reload Dashboard
                </button>
            </div>
        `;
        document.body.appendChild(backdrop);
        return false;
    };

    window.onerror = handleGlobalError;
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason ? (event.reason.message || event.reason) : 'Promise rejection';
        handleGlobalError(reason, 'Promise Rejection', 0, 0, event.reason);
    });
}

window.switchSettingsTab = function (sectionId) {
    // Switch active state for nav buttons
    const btns = document.querySelectorAll('.settings-nav-btn');
    btns.forEach(btn => {
        if (btn.getAttribute('onclick').includes(sectionId)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Switch active state for settings cards
    const cards = document.querySelectorAll('.settings-card');
    cards.forEach(card => {
        if (card.id === sectionId) {
            card.classList.add('active');
        } else if (card.id === 'settings-form-actions-wrapper') {
            if (sectionId === 'settings-general' || sectionId === 'settings-inventory') {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        } else {
            card.classList.remove('active');
        }
    });
};

/* ==========================================
   Table Column Visibility Controllers
   ========================================== */
window.toggleColumnDropdown = function (dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    const isHidden = dropdown.style.display === 'none';
    dropdown.style.display = isHidden ? 'flex' : 'none';
    
    if (isHidden) {
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target) && !e.target.closest('.col-visibility-dropdown')) {
                dropdown.style.display = 'none';
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 50);
    }
};

window.toggleTableColumn = function (tableKey, colClass, checkbox) {
    const isHidden = !checkbox.checked;
    
    const hiddenCols = JSON.parse(localStorage.getItem(`hidden_cols_${tableKey}`) || '{}');
    hiddenCols[colClass] = isHidden;
    localStorage.setItem(`hidden_cols_${tableKey}`, JSON.stringify(hiddenCols));
    
    const elements = document.querySelectorAll(`.${colClass}`);
    elements.forEach(el => {
        if (isHidden) {
            el.classList.add('hidden-col');
        } else {
            el.classList.remove('hidden-col');
        }
    });
};

window.applyStoredColumnVisibility = function (tableKey) {
    const hiddenCols = JSON.parse(localStorage.getItem(`hidden_cols_${tableKey}`) || '{}');
    Object.keys(hiddenCols).forEach(colClass => {
        const isHidden = hiddenCols[colClass];
        const elements = document.querySelectorAll(`.${colClass}`);
        elements.forEach(el => {
            if (isHidden) {
                el.classList.add('hidden-col');
            } else {
                el.classList.remove('hidden-col');
            }
        });
        
        const checkbox = document.querySelector(`input[onchange*="${colClass}"]`);
        if (checkbox) {
            checkbox.checked = !isHidden;
        }
    });
};

/* ==========================================
   Intelligent Sidebar Hover Pre-fetching
   ========================================== */
function setupHoverPrefetching() {
    const navItems = document.querySelectorAll('.nav-item, .bottom-nav-item');
    navItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            const tabId = item.getAttribute('data-tab');
            if (!tabId || typeof db === 'undefined' || typeof db.getAll !== 'function') return;

            // Trigger background fetches to warm IndexedDB optimization cache
            if (tabId === 'products') {
                db.getAll('products').catch(() => {});
                db.getAll('recipes').catch(() => {});
                db.getAll('ingredients').catch(() => {});
            } else if (tabId === 'recipes') {
                db.getAll('recipes').catch(() => {});
                db.getAll('ingredients').catch(() => {});
            } else if (tabId === 'inventory') {
                db.getAll('products').catch(() => {});
                db.getAll('ingredients').catch(() => {});
            } else if (tabId === 'history' || tabId === 'sales' || tabId === 'item-sales') {
                db.getAll('transactions').catch(() => {});
            } else if (tabId === 'expenses') {
                db.getAll('expenses').catch(() => {});
            } else if (tabId === 'salaries') {
                db.getAll('salaries').catch(() => {});
            } else if (tabId === 'deliveries') {
                db.getAll('deliveries').catch(() => {});
            } else if (tabId === 'users') {
                db.getAll('users').catch(() => {});
            }
        });
    });
}







