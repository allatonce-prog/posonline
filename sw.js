const CACHE_NAME = 'pos-system-v23';
const urlsToCache = [
  './',
  './index.html',
  './cashier.html',
  './admin.html',
  './css/styles.css',
  './css/cashier.css',
  './css/admin.css',
  './css/cashier-sidebar.css',
  './css/mobile-no-zoom.css',
  './css/recipes.css',
  './js/firebase-db.js',
  './js/offline-db.js',
  './js/auth.js',
  './js/utils.js',
  './js/mobile-stability.js',
  './js/admin/settings.js',
  './js/collectibles-payment.js',
  './js/cashier.js',
  './js/cashier-sales.js',
  './js/cashier-expenses.js',
  './js/cashier-collectibles.js',
  './js/cashier-stock-tracker.js',
  './js/cashier-recipes.js',
  './js/cashier-inventory.js',
  './js/pull-to-refresh.js',
  './js/admin.js',
  './js/admin/dashboard-charts.js',
  './js/admin/time-range.js',
  './js/admin/products.js',
  './js/admin/recipes.js',
  './js/admin/modifiers.js',
  './js/admin/inventory.js',
  './js/admin/sales.js',
  './js/admin/daily-collections.js',
  './js/admin/expenses.js',
  './js/admin/salaries.js',
  './js/admin/deliveries.js',
  './js/admin/reports.js',
  './js/admin/users.js',
  './js/admin/collectibles.js',
  './js/admin/store-switcher.js',
  './js/admin/notifications.js',
  './js/admin/item-sales.js'
];

// Domains to always bypass the service worker (pass-through to network)
const BYPASS_DOMAINS = [
  'tawk.to',
  'embed.tawk.to',
  'firebaseio.com',
  'firestore.googleapis.com',
  'googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installing v23...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('[ServiceWorker] Cache failed:', err);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Fetch event - Network first for HTML and CSS, cache first for other assets
self.addEventListener('fetch', event => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return; // Invalid URL - let browser handle it
  }

  // Skip cross-origin requests (tawk.to, Firebase, CDNs, etc.)
  // Let the browser handle them directly without SW interference
  const isCrossOrigin = url.origin !== self.location.origin;
  if (isCrossOrigin) {
    return; // Do NOT call event.respondWith() - browser handles natively
  }

  // Also skip any known external service domains by hostname
  if (BYPASS_DOMAINS.some(domain => url.hostname.includes(domain))) {
    return;
  }

  // Network first strategy for HTML and CSS files
  if (request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html') ||
    request.url.includes('.css')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache the new version
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request)
            .then(response => {
              if (response) {
                return response;
              }
              // If no cache, return to index
              return caches.match('./index.html');
            });
        })
    );
    return;
  }

  // Cache first strategy for same-origin JS and other assets
  // Strip query strings when looking up cache so ?v=6.x params don't cause misses
  event.respondWith(
    (async () => {
      // Try exact URL match first (with query string)
      let cached = await caches.match(request);
      if (cached) return cached;

      // Try without query string (handles ?v=6.x versioning)
      const urlWithoutQuery = url.origin + url.pathname;
      cached = await caches.match(urlWithoutQuery);
      if (cached) return cached;

      // Not in cache - fetch from network
      try {
        const response = await fetch(request);

        // Only cache valid same-origin responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          const cache = await caches.open(CACHE_NAME);
          // Store under pathname (without query) for future version-agnostic hits
          cache.put(urlWithoutQuery, responseToCache);
        }

        return response;
      } catch (err) {
        // Network failed - return a graceful error (no rejection)
        console.warn('[ServiceWorker] Fetch failed for:', request.url, err);
        return new Response('', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      }
    })()
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
