// Pull-to-Refresh Functionality
// Simple, efficient pull-to-refresh for mobile PWA

let pullToRefresh = {
    enabled: false,
    startY: 0,
    currentY: 0,
    pulling: false,
    refreshing: false,
    threshold: 80, // pixels to pull before refresh triggers
    maxPull: 120,

    init(containerSelector = 'body') {
        if (this.enabled) return; // Already initialized

        this.container = document.querySelector(containerSelector);
        if (!this.container) return;

        // Create refresh indicator
        this.createIndicator();

        // Add touch listeners
        this.container.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
        this.container.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.container.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });

        this.enabled = true;
        console.log('Pull-to-refresh initialized');
    },

    createIndicator() {
        // Create refresh indicator element
        this.indicator = document.createElement('div');
        this.indicator.id = 'pullRefreshIndicator';
        this.indicator.innerHTML = `
            <div class="refresh-spinner">
                <i class="ph ph-arrow-clockwise"></i>
            </div>
            <div class="refresh-text">Pull to refresh</div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #pullRefreshIndicator {
                position: fixed;
                top: -80px;
                left: 0;
                right: 0;
                height: 80px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, var(--primary), var(--secondary));
                color: white;
                z-index: 10000;
                transition: transform 0.2s ease-out;
                font-size: 0.9rem;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            
            #pullRefreshIndicator.pulling {
                transition: none;
            }
            
            #pullRefreshIndicator.refreshing {
                transform: translateY(80px);
            }
            
            #pullRefreshIndicator .refresh-spinner {
                font-size: 1.5rem;
                margin-bottom: 0.25rem;
            }
            
            #pullRefreshIndicator.refreshing .refresh-spinner i {
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            #pullRefreshIndicator .refresh-text {
                font-size: 0.85rem;
                opacity: 0.9;
            }
        `;

        document.head.appendChild(style);
        document.body.insertBefore(this.indicator, document.body.firstChild);
    },

    onTouchStart(e) {
        // Only allow pull-to-refresh if at top of page
        const scrollContainer = this.getScrollContainer();
        if (scrollContainer.scrollTop > 0) return;

        this.startY = e.touches[0].pageY;
        this.pulling = true;
    },

    onTouchMove(e) {
        if (!this.pulling || this.refreshing) return;

        const scrollContainer = this.getScrollContainer();
        if (scrollContainer.scrollTop > 0) {
            this.pulling = false;
            return;
        }

        this.currentY = e.touches[0].pageY;
        const pullDistance = this.currentY - this.startY;

        if (pullDistance > 0 && pullDistance < this.maxPull) {
            e.preventDefault(); // Prevent default scroll

            const translateY = Math.min(pullDistance, this.maxPull);
            this.indicator.style.transform = `translateY(${translateY}px)`;
            this.indicator.classList.add('pulling');

            // Update text based on threshold
            if (pullDistance >= this.threshold) {
                this.indicator.querySelector('.refresh-text').textContent = 'Release to refresh';
            } else {
                this.indicator.querySelector('.refresh-text').textContent = 'Pull to refresh';
            }
        }
    },

    onTouchEnd(e) {
        if (!this.pulling || this.refreshing) return;

        const pullDistance = this.currentY - this.startY;

        this.pulling = false;
        this.indicator.classList.remove('pulling');

        if (pullDistance >= this.threshold) {
            this.triggerRefresh();
        } else {
            // Reset indicator
            this.indicator.style.transform = '';
        }
    },

    getScrollContainer() {
        // Get the main scrollable container
        const adminMain = document.querySelector('.admin-main');
        const cashierMain = document.querySelector('.cashier-main');
        return adminMain || cashierMain || document.documentElement;
    },

    async triggerRefresh() {
        if (this.refreshing) return;

        this.refreshing = true;
        this.indicator.classList.add('refreshing');
        this.indicator.querySelector('.refresh-text').textContent = 'Refreshing...';

        try {
            // Hard refresh: sync all data from cloud
            showLoading('Refreshing data...');

            // Force cloud sync for all collections
            if (typeof db !== 'undefined' && db.syncPendingData) {
                await db.syncPendingData();
            }

            // Reload current view/tab
            if (typeof currentTab !== 'undefined' && currentTab) {
                // Admin view - reload current tab
                await this.reloadCurrentTab(currentTab);
            } else if (typeof loadProducts === 'function') {
                // Cashier view - reload products
                await loadProducts();
                if (typeof loadSalesHistory === 'function') {
                    await loadSalesHistory();
                }
            }

            hideLoading();
            showToast('Data refreshed successfully!', 'success');

        } catch (error) {
            console.error('Refresh error:', error);
            hideLoading();
            showToast('Refresh failed. Please try again.', 'error');
        } finally {
            // Reset indicator after delay
            setTimeout(() => {
                this.indicator.classList.remove('refreshing');
                this.indicator.style.transform = '';
                this.refreshing = false;
                this.indicator.querySelector('.refresh-text').textContent = 'Pull to refresh';
            }, 500);
        }
    },

    async reloadCurrentTab(tab) {
        // Reload the current admin tab
        try {
            switch (tab) {
                case 'dashboard':
                    if (typeof loadDashboard === 'function') await loadDashboard();
                    break;
                case 'products':
                    if (typeof loadProducts === 'function') await loadProducts();
                    break;
                case 'inventory':
                    if (typeof loadInventory === 'function') await loadInventory();
                    break;
                case 'history':
                    if (typeof loadStockMovements === 'function') await loadStockMovements();
                    break;
                case 'sales':
                    if (typeof loadSales === 'function') await loadSales();
                    break;
                case 'expenses':
                    if (typeof loadExpenses === 'function') await loadExpenses();
                    break;
                case 'collectibles':
                    if (typeof loadCollectibles === 'function') await loadCollectibles();
                    break;
                case 'reports':
                    if (typeof loadReports === 'function') await loadReports();
                    break;
                case 'users':
                    if (typeof loadUsers === 'function') await loadUsers();
                    break;
                case 'settings':
                    if (typeof loadSettings === 'function') await loadSettings();
                    break;
            }
        } catch (error) {
            console.error('Tab reload error:', error);
        }
    }
};

// Auto-initialize on DOM load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        pullToRefresh.init();
    });
} else {
    pullToRefresh.init();
}
