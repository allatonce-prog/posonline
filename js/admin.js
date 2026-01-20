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

    // Apply custom settings
    if (typeof getSettings === 'function') {
        const settings = getSettings();

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

// Switch tab
async function switchTab(tab) {
    if (currentTab === tab) return;

    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Update tabs
    document.querySelectorAll('.tabs').forEach(tabContent => {
        tabContent.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');

    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        products: 'Products',
        inventory: 'Inventory Management',
        sales: 'Sales Records',
        reports: 'Reports & Analytics',
        users: 'User Management',
        settings: 'System Settings'
    };
    document.getElementById('pageTitle').textContent = titles[tab] || tab;

    currentTab = tab;

    // Load tab data
    showLoading('Loading...');
    try {
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
            case 'sales':
                await loadSales();
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
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error loading data: ' + error.message, 'error');
    }
}

// Load dashboard
async function loadDashboard() {
    const products = await db.getAll('products');
    const transactions = await db.getAll('transactions');

    // Calculate stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTransactions = transactions.filter(t => {
        const transDate = new Date(t.date);
        transDate.setHours(0, 0, 0, 0);
        return transDate.getTime() === today.getTime();
    });

    const todaySales = todayTransactions.reduce((sum, t) => sum + t.total, 0);
    const lowStockThreshold = getLowStockThreshold();
    const lowStockItems = products.filter(p => p.stock <= lowStockThreshold).length;

    // Update stats
    document.getElementById('todaySales').textContent = formatCurrency(todaySales);
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
        tbody.innerHTML = recentTransactions.map(t => `
      <tr>
        <td>${formatTransactionId(t.id)}</td>
        <td>${formatDateTime(t.date)}</td>
        <td>${escapeHtml(t.cashier)}</td>
        <td>${t.items.length} items</td>
        <td>${formatCurrency(t.total)}</td>
        <td><span class="badge badge-primary">${escapeHtml(t.paymentMethod)}</span></td>
      </tr>
    `).join('');
    }
}
