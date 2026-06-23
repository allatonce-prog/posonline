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
        // Useless scroll and touch listeners removed to prevent main-thread JS execution during scrolling.
        // Modern iOS scroll behaves correctly natively.
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
        const errorMessage = error.message || String(error);

        // Store error info
        sessionStorage.setItem('lastError', JSON.stringify({
            message: errorMessage,
            timestamp: Date.now()
        }));

        // Check for database initialization errors (don't auto-reload for these)
        const isDbError = errorMessage.includes('IndexedDB') ||
            errorMessage.includes('Firebase') ||
            errorMessage.includes('database') ||
            errorMessage.includes('init');

        // Check reload loop prevention
        const lastErrorTime = sessionStorage.getItem('lastErrorTime');
        const reloadCount = parseInt(sessionStorage.getItem('errorReloadCount') || '0');
        const now = Date.now();

        // If we've reloaded more than 3 times in the last 30 seconds, stop auto-reloading
        if (reloadCount >= 3 && lastErrorTime && (now - parseInt(lastErrorTime) < 30000)) {
            console.error('Too many errors detected. Stopping auto-reload to prevent loop.');
            if (typeof showToast === 'function') {
                showToast('Multiple errors detected. Please check your connection and refresh manually.', 'error');
            }
            sessionStorage.removeItem('errorReloadCount');
            return;
        }

        // Show user-friendly error based on type
        if (typeof showToast === 'function') {
            if (isDbError) {
                showToast('Database initialization error. Please refresh the page.', 'error');
            } else {
                showToast('An error occurred. The page will refresh shortly.', 'error');
            }
        }

        // Don't auto-reload for database errors - let user manually refresh
        if (isDbError) {
            console.error('Database error detected:', errorMessage);
            return;
        }

        // Auto-recover by reloading (with delay to prevent infinite loops)
        setTimeout(() => {
            // Only reload if last error was more than 5 seconds ago
            if (!lastErrorTime || (now - parseInt(lastErrorTime) > 5000)) {
                sessionStorage.setItem('lastErrorTime', now.toString());
                sessionStorage.setItem('errorReloadCount', (reloadCount + 1).toString());
                window.location.reload();
            }
        }, 1500);
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
