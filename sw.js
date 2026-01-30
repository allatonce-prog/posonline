const CACHE_NAME = 'pos-system-v8';
const urlsToCache = [
  './',
  './index.html',
  './cashier.html',
  './admin.html',
  './css/styles.css',
  './css/cashier.css',
  './css/admin.css',
  './js/firebase-db.js',
  './js/auth.js',
  './js/utils.js',
  './js/cashier.js',
  './js/admin.js',
  './js/admin/products.js',
  './js/admin/inventory.js',
  './js/admin/sales.js',
  './js/admin/reports.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installing v7...');
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

// Fetch event - Network first for HTML, cache first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network first strategy for HTML files to prevent 404 errors
  if (event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the new version
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request)
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

  // Cache first strategy for other resources
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
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
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
