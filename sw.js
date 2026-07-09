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

// Fetch event - Network-first for code assets (HTML, CSS, JS), Cache-first for other static resources
self.addEventListener('fetch', event => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return; // Let browser handle invalid URLs
  }

  // Skip cross-origin requests, except Cloudinary image assets
  const isCrossOrigin = url.origin !== self.location.origin;
  const isCloudinary = url.hostname.includes('cloudinary.com');
  if (isCrossOrigin && !isCloudinary) {
    return;
  }

  // Skip bypassed service domains
  if (BYPASS_DOMAINS.some(domain => url.hostname.includes(domain))) {
    return;
  }

  // Detect if this is a manual browser refresh/reload request
  const isReload = request.cache === 'reload' || request.cache === 'no-cache';

  // Code assets that change frequently and shouldn't load old cached versions when online
  const isCodeAsset = request.mode === 'navigate' ||
                      (request.headers.get('accept') || '').includes('text/html') ||
                      request.url.includes('.css') ||
                      request.url.includes('.js');

  // If manual reload or code asset, use Network-First strategy
  if (isReload || isCodeAsset) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache the new version if request succeeded
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails (offline mode)
          return caches.match(request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // If no query-matched cache, look for version-agnostic pathname matching
              const urlWithoutQuery = url.origin + url.pathname;
              return caches.match(urlWithoutQuery)
                .then(agnosticResponse => {
                  if (agnosticResponse) {
                    return agnosticResponse;
                  }
                  // Fallback for navigation requests
                  if (request.mode === 'navigate') {
                    return caches.match('./index.html');
                  }
                  return new Response('', {
                    status: 503,
                    statusText: 'Service Offline'
                  });
                });
            });
        })
    );
    return;
  }

  // Cache-First strategy for static assets (images, icons, etc.)
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;

      // Match without query string as fallback
      const urlWithoutQuery = url.origin + url.pathname;
      return caches.match(urlWithoutQuery).then(cachedAgnostic => {
        if (cachedAgnostic) return cachedAgnostic;

        // Fetch from network and cache
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(urlWithoutQuery, responseClone);
            });
          }
          return response;
        }).catch(err => {
          console.warn('[ServiceWorker] Static asset load failed:', request.url, err);
          return new Response('', { status: 404 });
        });
      });
    })
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
