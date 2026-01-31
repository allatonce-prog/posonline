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

        // Add touchstart listener (passive is fine here)
        this.container.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });

        // Prepare bound listeners for dynamic adding/removing
        this.onTouchMoveBound = this.onTouchMove.bind(this);
        this.onTouchEndBound = this.onTouchEnd.bind(this);

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

    getScrollContainer() {
        const cashierView = document.querySelector('.cashier-main > div:not([style*="display: none"])');
        if (cashierView) return cashierView;

        const adminTab = document.querySelector('.tabs.active');
        if (adminTab) return adminTab;

        return document.querySelector('.admin-main') ||
            document.querySelector('.cashier-main') ||
            document.documentElement;
    },

    onTouchStart(e) {
        // 1. Only allow if we are near the top of the viewport
        const touchY = e.touches[0].clientY;
        if (touchY > 150) return;

        // 2. Only allow if at top of ACTIVE container
        const scrollContainer = this.getScrollContainer();
        if (scrollContainer.scrollTop > 0) return;

        // 3. Check for nested scrolling
        let parent = e.target.parentElement;
        while (parent && parent !== document.body) {
            if (parent.scrollTop > 0) return;
            parent = parent.parentElement;
        }

        // START PULL GESTURE
        this.startY = e.touches[0].pageY;
        this.pulling = true;

        // Dynamically add heavier listeners ONLY when needed
        // this improves general scrolling performance significantly
        document.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
        document.addEventListener('touchend', this.onTouchEndBound, { passive: true });
    },

    onTouchMove(e) {
        if (!this.pulling || this.refreshing) return;

        const currentY = e.touches[0].pageY;
        const pullDistance = currentY - this.startY;

        if (pullDistance <= 0) {
            // User is scrolling UP, abort pull
            this.abortPull();
            return;
        }

        const scrollContainer = this.getScrollContainer();
        if (scrollContainer.scrollTop > 0) {
            this.abortPull();
            return;
        }

        if (pullDistance > 0 && pullDistance < this.maxPull) {
            if (e.cancelable) e.preventDefault();

            this.currentY = currentY;
            const translateY = Math.min(pullDistance, this.maxPull);
            this.indicator.style.transform = `translateY(${translateY}px)`;
            this.indicator.classList.add('pulling');

            if (pullDistance >= this.threshold) {
                this.indicator.querySelector('.refresh-text').textContent = 'Release to refresh';
            } else {
                this.indicator.querySelector('.refresh-text').textContent = 'Pull to refresh';
            }
        }
    },

    onTouchEnd(e) {
        if (!this.pulling) return;

        const pullDistance = this.currentY - this.startY;

        // Clean up listeners
        this.abortPull(false); // false = don't reset pulling state yet

        if (this.refreshing) return;

        if (pullDistance >= this.threshold) {
            this.triggerRefresh();
        } else {
            this.indicator.style.transform = '';
        }

        this.pulling = false;
        this.indicator.classList.remove('pulling');
    },

    abortPull(resetState = true) {
        // Remove heavy listeners
        document.removeEventListener('touchmove', this.onTouchMoveBound);
        document.removeEventListener('touchend', this.onTouchEndBound);

        if (resetState) {
            this.pulling = false;
            this.indicator.classList.remove('pulling');
            this.indicator.style.transform = '';
        }
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
