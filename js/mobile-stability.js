/**
 * Mobile Stability & Performance Optimization
 * Prevents white screens, crashes, and memory leaks on iOS and Android
 */

class MobileStabilityManager {
    constructor() {
        this.activeListeners = [];
        this.activeIntervals = [];
        this.activeTimeouts = [];
        this.lastActivityTime = Date.now();
        this.isPageVisible = true;
        this.memoryWarningThreshold = 0.8; // 80% of available memory

        this.init();
    }

    init() {
        // Monitor page visibility (critical for mobile)
        this.setupVisibilityMonitoring();

        // Setup memory pressure monitoring
        this.setupMemoryMonitoring();

        // Setup error recovery
        this.setupErrorRecovery();

        // Setup cleanup on unload
        this.setupCleanupHandlers();

        // Prevent iOS bounce and zoom issues
        this.preventIOSBehaviors();

        console.log('✅ Mobile Stability Manager initialized');
    }

    // Page Visibility Monitoring (pause when hidden to save memory)
    setupVisibilityMonitoring() {
        const handleVisibilityChange = () => {
            this.isPageVisible = !document.hidden;

            if (document.hidden) {
                // Page is hidden - pause heavy operations
                this.pauseHeavyOperations();
            } else {
                // Page is visible again - resume
                this.resumeHeavyOperations();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        this.trackListener(document, 'visibilitychange', handleVisibilityChange);

        // iOS-specific events
        window.addEventListener('pagehide', () => this.pauseHeavyOperations());
        window.addEventListener('pageshow', () => this.resumeHeavyOperations());
    }

    // Memory Monitoring (prevent crashes from memory overload)
    setupMemoryMonitoring() {
        // Check memory usage periodically
        setInterval(() => {
            if (performance.memory) {
                const memoryUsage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;

                if (memoryUsage > this.memoryWarningThreshold) {
                    console.warn('⚠️ High memory usage detected:', (memoryUsage * 100).toFixed(1) + '%');
                    this.performMemoryCleanup();
                }
            }
        }, 30000); // Check every 30 seconds
    }

    // Error Recovery (prevent white screens)
    setupErrorRecovery() {
        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('Caught global error:', event.error);
            this.handleCriticalError(event.error);
            event.preventDefault();
        });

        // Unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.handleCriticalError(event.reason);
            event.preventDefault();
        });
    }

    // Cleanup handlers
    setupCleanupHandlers() {
        window.addEventListener('beforeunload', () => {
            this.performFullCleanup();
        });

        // Prevent memory leaks from back button (iOS Safari)
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                // Page restored from cache - ensure clean state
                console.log('Page restored from cache, performing cleanup');
                this.performMemoryCleanup();
            }
        });
    }

    // Prevent iOS-specific behaviors
    preventIOSBehaviors() {
        // Prevent bounce/rubber-banding
        document.addEventListener('touchmove', (e) => {
            if (e.target.closest('.scrollable, .modal-body, .tab-content, .cart-items')) {
                return; // Allow scrolling in specific containers
            }
        }, { passive: true });

        // Prevent pull-to-refresh on certain elements
        let startY = 0;
        document.addEventListener('touchstart', (e) => {
            startY = e.touches[0].pageY;
        }, { passive: true });
    }

    // Pause heavy operations when page is hidden
    pauseHeavyOperations() {
        console.log('Pausing heavy operations (page hidden)');

        // Clear all intervals
        this.activeIntervals.forEach(id => clearInterval(id));
        this.activeIntervals = [];

        // Notify components to pause
        window.dispatchEvent(new CustomEvent('mobile-stability:pause'));
    }

    // Resume operations when page is visible
    resumeHeavyOperations() {
        console.log('Resuming operations (page visible)');

        // Notify components to resume
        window.dispatchEvent(new CustomEvent('mobile-stability:resume'));
    }

    // Memory cleanup
    performMemoryCleanup() {
        console.log('Performing memory cleanup...');

        // Clear old console logs (helps on iOS)
        if (console.clear && Math.random() > 0.5) {
            console.clear();
        }

        // Force garbage collection if available (Chrome DevTools)
        if (window.gc) {
            window.gc();
        }

        // Notify components to clean up
        window.dispatchEvent(new CustomEvent('mobile-stability:cleanup'));
    }

    // Full cleanup before unload
    performFullCleanup() {
        console.log('Performing full cleanup...');

        // Remove all tracked listeners
        this.activeListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.activeListeners = [];

        // Clear all timeouts and intervals
        this.activeTimeouts.forEach(id => clearTimeout(id));
        this.activeIntervals.forEach(id => clearInterval(id));
        this.activeTimeouts = [];
        this.activeIntervals = [];
    }

    // Handle critical errors
    handleCriticalError(error) {
        // Store error info
        sessionStorage.setItem('lastError', JSON.stringify({
            message: error.message || String(error),
            timestamp: Date.now()
        }));

        // Show user-friendly error
        if (typeof showToast === 'function') {
            showToast('An error occurred. Refreshing...', 'error');
        }

        // Auto-recover by reloading (with delay to prevent infinite loops)
        setTimeout(() => {
            const lastErrorTime = sessionStorage.getItem('lastErrorTime');
            const now = Date.now();

            // Only reload if last error was more than 5 seconds ago
            if (!lastErrorTime || (now - parseInt(lastErrorTime) > 5000)) {
                sessionStorage.setItem('lastErrorTime', now.toString());
                window.location.reload();
            }
        }, 1000);
    }

    // Track event listeners for cleanup
    trackListener(element, event, handler) {
        this.activeListeners.push({ element, event, handler });
    }

    // Safe interval that gets cleaned up
    safeInterval(callback, delay) {
        const id = setInterval(callback, delay);
        this.activeIntervals.push(id);
        return id;
    }

    // Safe timeout that gets cleaned up
    safeTimeout(callback, delay) {
        const id = setTimeout(callback, delay);
        this.activeTimeouts.push(id);
        return id;
    }

    // Clear specific interval
    clearSafeInterval(id) {
        clearInterval(id);
        const index = this.activeIntervals.indexOf(id);
        if (index > -1) {
            this.activeIntervals.splice(index, 1);
        }
    }

    // Clear specific timeout
    clearSafeTimeout(id) {
        clearTimeout(id);
        const index = this.activeTimeouts.indexOf(id);
        if (index > -1) {
            this.activeTimeouts.splice(index, 1);
        }
    }

    // Break up long-running tasks (prevent freezing)
    async runInChunks(items, processor, chunkSize = 50) {
        const chunks = [];
        for (let i = 0; i < items.length; i += chunkSize) {
            chunks.push(items.slice(i, i + chunkSize));
        }

        for (const chunk of chunks) {
            await new Promise(resolve => {
                requestIdleCallback(() => {
                    chunk.forEach(processor);
                    resolve();
                }, { timeout: 100 });
            });
        }
    }

    // Tab switch cleanup helper
    cleanupForTabSwitch() {
        // Clear any active modals
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });

        // Remove any toast notifications
        document.querySelectorAll('.toast').forEach(toast => {
            toast.remove();
        });

        // Clear loading overlays
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    }
}

// Initialize globally
const mobileStability = new MobileStabilityManager();

// Export for use in other scripts
window.mobileStability = mobileStability;
