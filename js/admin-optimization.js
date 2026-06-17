// Admin Dashboard Performance & Reliability Optimizations
(function() {
    console.log("🚀 Admin Dashboard optimization active!");

    // Dynamic Pagination Limit for Desktop Mode to occupy empty space via Prototype Interception
    if (typeof PaginationManager !== 'undefined') {
        const originalPaginate = PaginationManager.prototype.paginate;
        PaginationManager.prototype.paginate = function(items) {
            if (window.innerWidth >= 1025 && this.itemsPerPage === 5) {
                this.itemsPerPage = 12;
            }
            return originalPaginate.apply(this, arguments);
        };
        console.log("📈 PaginationManager.prototype.paginate successfully intercepted");
    }

    const cache = new Map();
    const CACHE_TTL = 15000; // 15 seconds TTL for database reads

    // Helper to get cache key
    function getCacheKey(method, storeName, args) {
        return `${method}:${storeName}:${JSON.stringify(args)}`;
    }

    // Helper to clear cache for a specific storeName
    function invalidateCache(storeName) {
        console.log(`🧹 Invalidating cache for store: ${storeName}`);
        for (const key of cache.keys()) {
            if (key.includes(`:${storeName}:`)) {
                cache.delete(key);
            }
        }
    }

    // Clear all caches
    window.clearDbCache = function() {
        console.log("🧹 Clearing all database read caches...");
        cache.clear();
    };

    // Intercept and throttle window resize dispatching
    const originalDispatchEvent = window.dispatchEvent;
    let lastResizeTime = 0;
    window.dispatchEvent = function(event) {
        if (event.type === 'resize') {
            const now = performance.now();
            if (now - lastResizeTime < 60) {
                // Throttle resize events to at most once per 60ms (approx 16fps)
                return true;
            }
            lastResizeTime = now;
        }
        return originalDispatchEvent.apply(this, arguments);
    };

    // Wait for db to be initialized
    function initOptimization() {
        const db = window.db;
        if (!db) {
            // Retry if db is not ready yet
            setTimeout(initOptimization, 50);
            return;
        }

        console.log("🎯 Wrapping db instance for read-caching...");

        // Wrap getAll
        const originalGetAll = db.getAll;
        db.getAll = async function(collectionName, forceCloud = false) {
            if (forceCloud) {
                invalidateCache(collectionName);
            }
            const key = getCacheKey('getAll', collectionName, [forceCloud]);
            const cached = cache.get(key);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                // Return a deep/shallow clone to prevent accidental mutations of cached objects
                return JSON.parse(JSON.stringify(cached.data));
            }
            
            const result = await originalGetAll.apply(this, arguments);
            cache.set(key, {
                timestamp: Date.now(),
                data: result
            });
            return result;
        };

        // Wrap getAllByIndex
        const originalGetAllByIndex = db.getAllByIndex;
        db.getAllByIndex = async function(collectionName, indexName, value, forceCloud = false) {
            if (forceCloud) {
                invalidateCache(collectionName);
            }
            const key = getCacheKey('getAllByIndex', collectionName, [indexName, value, forceCloud]);
            const cached = cache.get(key);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return JSON.parse(JSON.stringify(cached.data));
            }
            
            const result = await originalGetAllByIndex.apply(this, arguments);
            cache.set(key, {
                timestamp: Date.now(),
                data: result
            });
            return result;
        };

        // Wrap get
        const originalGet = db.get;
        db.get = async function(collectionName, id) {
            const key = getCacheKey('get', collectionName, [id]);
            const cached = cache.get(key);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return JSON.parse(JSON.stringify(cached.data));
            }
            
            const result = await originalGet.apply(this, arguments);
            cache.set(key, {
                timestamp: Date.now(),
                data: result
            });
            return result;
        };

        // Wrap getByIndex
        const originalGetByIndex = db.getByIndex;
        db.getByIndex = async function(collectionName, indexName, value) {
            const key = getCacheKey('getByIndex', collectionName, [indexName, value]);
            const cached = cache.get(key);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                return JSON.parse(JSON.stringify(cached.data));
            }
            
            const result = await originalGetByIndex.apply(this, arguments);
            cache.set(key, {
                timestamp: Date.now(),
                data: result
            });
            return result;
        };

        // Wrap write operations to invalidate cache
        const writeMethods = ['add', 'update', 'set', 'remove', 'delete', 'put'];
        writeMethods.forEach(methodName => {
            if (typeof db[methodName] === 'function') {
                const originalMethod = db[methodName];
                db[methodName] = async function(collectionName) {
                    invalidateCache(collectionName);
                    return await originalMethod.apply(this, arguments);
                };
            }
        });

        // Intercept pullToRefresh if it exists
        if (window.pullToRefresh && typeof window.pullToRefresh.triggerRefresh === 'function') {
            const originalTriggerRefresh = window.pullToRefresh.triggerRefresh;
            window.pullToRefresh.triggerRefresh = async function() {
                window.clearDbCache();
                return await originalTriggerRefresh.apply(this, arguments);
            };
            console.log("🔄 pullToRefresh hook successfully injected");
        } else {
            // Keep checking for pullToRefresh to register hook
            const ptrInterval = setInterval(() => {
                if (window.pullToRefresh && typeof window.pullToRefresh.triggerRefresh === 'function') {
                    const originalTriggerRefresh = window.pullToRefresh.triggerRefresh;
                    window.pullToRefresh.triggerRefresh = async function() {
                        window.clearDbCache();
                        return await originalTriggerRefresh.apply(this, arguments);
                    };
                    clearInterval(ptrInterval);
                    console.log("🔄 pullToRefresh hook successfully injected (deferred)");
                }
            }, 500);
            
            // Clean up interval after 10s to prevent leak
            setTimeout(() => clearInterval(ptrInterval), 10000);
        }
    }

    // Run when DOM is ready or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOptimization);
    } else {
        initOptimization();
    }
})();
