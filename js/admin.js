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

        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error loading dashboard: ' + error.message, 'error');
    }

    // Setup navigation
    setupNavigation();
});

// Setup mobile menu
function setupMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.querySelector('.admin-sidebar');
    const mainContent = document.querySelector('.admin-main');
    const overlay = document.getElementById('overlay');

    if (mobileMenuToggle && sidebar) {
        mobileMenuToggle.addEventListener('click', () => {
            const isOpen = sidebar.classList.contains('open');

            if (isOpen) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });

        // Close menu when clicking overlay
        if (overlay) {
            overlay.addEventListener('click', closeMobileMenu);
        }

        // Close menu when window resizes to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024) {
                closeMobileMenu();
            }
        });
    }
}

// Open mobile menu
function openMobileMenu() {
    const sidebar = document.querySelector('.admin-sidebar');
    const mainContent = document.querySelector('.admin-main');
    const overlay = document.getElementById('overlay');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');

    sidebar.classList.add('open');
    mainContent.classList.add('sidebar-open');
    overlay.classList.add('active');
    mobileMenuToggle.classList.add('active');
    mobileMenuToggle.innerHTML = '✕';
}

// Close mobile menu
function closeMobileMenu() {
    const sidebar = document.querySelector('.admin-sidebar');
    const mainContent = document.querySelector('.admin-main');
    const overlay = document.getElementById('overlay');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');

    sidebar.classList.remove('open');
    mainContent.classList.remove('sidebar-open');
    overlay.classList.remove('active');
    mobileMenuToggle.classList.remove('active');
    mobileMenuToggle.innerHTML = '☰';
}

// Setup navigation
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);

            // Close mobile menu when switching tabs
            closeMobileMenu();
        });
    });
}

// Switch tab (optimized for mobile stability and white screen prevention)
async function switchTab(tab) {
    if (currentTab === tab) {
        // If already on this tab, force reload to fix white screen
        console.log('Force reloading current tab:', tab);
    }

    // Cleanup before switching (prevent memory leaks)
    if (window.mobileStability) {
        window.mobileStability.cleanupForTabSwitch();
    }

    // Clear any active charts/intervals from previous tab
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

    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Update tabs with smooth transition
    const allTabs = document.querySelectorAll('.tabs');
    allTabs.forEach(tabContent => {
        tabContent.classList.remove('active');
        // Store scroll position
        if (tabContent.scrollTop > 0) {
            tabContent.dataset.scrollTop = tabContent.scrollTop;
        }
    });

    const selectedTab = document.getElementById(`${tab}-tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
        // Restore scroll position if exists
        const savedScroll = selectedTab.dataset.scrollTop;
        if (savedScroll) {
            selectedTab.scrollTop = parseInt(savedScroll);
        }

        // Force display to ensure visibility
        selectedTab.style.display = 'block';
        selectedTab.style.opacity = '1';
    } else {
        console.error(`Tab element not found: ${tab}-tab`);
        showToast('Error loading tab. Please refresh.', 'error');
        return;
    }

    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        products: 'Products',
        inventory: 'Inventory Management',
        sales: 'Sales Records',
        expenses: 'Expenses Tracking',
        collectibles: 'Collectibles Monitoring',
        reports: 'Reports & Analytics',
        users: 'User Management',
        settings: 'System Settings',
        history: 'Stock Movement History'
    };
    document.getElementById('pageTitle').textContent = titles[tab] || tab;

    currentTab = tab;

    // Load tab data with retry mechanism
    showLoading('Loading...');

    let retryCount = 0;
    const maxRetries = 2;

    const loadWithRetry = async () => {
        try {
            await loadTabContent(tab);
            hideLoading();

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
                hideLoading();
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

    // Execute with idle callback for better performance
    if (window.requestIdleCallback && tab !== 'dashboard') {
        requestIdleCallback(() => loadWithRetry(), { timeout: 2000 });
    } else {
        await loadWithRetry();
    }
}

// Separate function for loading tab content
async function loadTabContent(tab) {
    switch (tab) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'products':
            await loadProducts();
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
        case 'expenses':
            await loadExpenses();
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
async function loadDashboard() {
    const products = await db.getAll('products');
    const transactions = await db.getAll('transactions');
    const expenses = await db.getAll('expenses');
    const collectibles = await db.getAll('collectibles');
    const users = await db.getAll('users');
    const userMap = {};
    users.forEach(u => {
        userMap[u.username] = u.name || u.username;
    });

    // Calculate stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTransactions = transactions.filter(t => {
        const transDate = new Date(t.date);
        transDate.setHours(0, 0, 0, 0);
        return transDate.getTime() === today.getTime();
    });

    const todayExpensesList = expenses.filter(e => {
        const expenseDate = new Date(e.date);
        expenseDate.setHours(0, 0, 0, 0);
        return expenseDate.getTime() === today.getTime();
    });

    // Filter today's collectibles (unpaid only)
    const todayCollectiblesList = collectibles.filter(c => {
        const colDate = new Date(c.date);
        colDate.setHours(0, 0, 0, 0);
        return colDate.getTime() === today.getTime() && c.status !== 'paid';
    });

    const todaySales = todayTransactions.reduce((sum, t) => {
        // Handle both standard sales and collectible payments
        // Ensure values are numbers and default to 0 if invalid
        const total = Number(t.total) || Number(t.amount) || 0;
        return sum + total;
    }, 0);

    // Ensure expenses amount is treated as a number
    const todayExpensesTotal = todayExpensesList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Calculate today's collectibles outstanding balance
    const todayCollectiblesTotal = todayCollectiblesList.reduce((sum, c) => {
        const totalAmount = Number(c.totalAmount) || 0;
        const paidAmount = Number(c.paidAmount) || 0;
        const balance = totalAmount - paidAmount;
        return sum + balance;
    }, 0);

    // Net Profit = Sales - Expenses - Collectibles
    const todayNetProfit = todaySales - todayExpensesTotal - todayCollectiblesTotal;

    const lowStockThreshold = getLowStockThreshold();
    const lowStockItems = products.filter(p => p.stock <= lowStockThreshold).length;

    // Update stats
    const todaySalesEl = document.getElementById('todaySales');
    const todayExpensesEl = document.getElementById('todayExpensesDash');
    const todayNetProfitEl = document.getElementById('todayNetProfit');
    const netProfitIcon = document.getElementById('netProfitIcon');

    if (todaySalesEl) todaySalesEl.textContent = formatCurrency(todaySales);
    if (todayExpensesEl) todayExpensesEl.textContent = formatCurrency(todayExpensesTotal);

    // Update today's collectibles
    const todayCollectiblesEl = document.getElementById('todayCollectibles');
    if (todayCollectiblesEl) {
        todayCollectiblesEl.textContent = formatCurrency(todayCollectiblesTotal);
    }

    if (todayNetProfitEl) {
        todayNetProfitEl.textContent = formatCurrency(todayNetProfit);
        if (todayNetProfit < 0) {
            todayNetProfitEl.style.color = 'var(--danger)';
            if (netProfitIcon) {
                netProfitIcon.className = 'stat-icon danger';
                netProfitIcon.innerHTML = '<i class="ph ph-trend-down"></i>';
            }
        } else {
            todayNetProfitEl.style.color = 'var(--success-dark)';
            if (netProfitIcon) {
                netProfitIcon.className = 'stat-icon success';
                netProfitIcon.innerHTML = '<i class="ph ph-trend-up"></i>';
            }
        }
    }

    document.getElementById('totalProducts').textContent = products.length;
    document.getElementById('lowStockItems').textContent = lowStockItems;
    document.getElementById('totalTransactions').textContent = transactions.length;

    // Load recent transactions
    const recentTransactions = transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    const tbody = document.getElementById('recentTransactions');
    if (recentTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No transactions yet</td></tr>';
    } else {
        tbody.innerHTML = recentTransactions.map(t => {
            // Determine cashier display name
            const cashierDisplay = t.cashierName || userMap[t.cashier] || t.cashier;

            return `
      <tr>
        <td>${formatTransactionId(t.id)}</td>
        <td>${formatDateTime(t.date)}</td>
        <td>${escapeHtml(cashierDisplay)}</td>
        <td>${t.items.length} items</td>
        <td>${formatCurrency(t.total)}</td>
        <td><span class="badge badge-primary">${escapeHtml(t.paymentMethod)}</span></td>
      </tr>
    `;
        }).join('');
    }

    // Initialize Charts
    if (typeof updateDashboardCharts === 'function') {
        updateDashboardCharts(transactions, products);
    }
}
