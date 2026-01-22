
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    query,
    where,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyAd7RaewTXl5kTivJQyLe_S_Pe1ViO9Syc",
    authDomain: "pos-onlone.firebaseapp.com",
    projectId: "pos-onlone",
    storageBucket: "pos-onlone.firebasestorage.app",
    messagingSenderId: "535727480126",
    appId: "1:535727480126:web:53e8256514f9b63fd7606f"
};

// ---------------------------------------------------------
// Local IndexedDB Wrapper
// ---------------------------------------------------------
const DB_NAME = 'POSDatabase_v3'; // Bump version for safety
const DB_VERSION = 1;

class LocalDB {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Products
                if (!db.objectStoreNames.contains('products')) {
                    const store = db.createObjectStore('products', { keyPath: 'id' }); // Use Firebase ID as key
                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('syncStatus', 'syncStatus', { unique: false }); // synced, pending
                }

                // Transactions (Sales)
                if (!db.objectStoreNames.contains('transactions')) {
                    const store = db.createObjectStore('transactions', { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('cashier', 'cashier', { unique: false });
                    store.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // Stock Movements (Missing causes the error!)
                if (!db.objectStoreNames.contains('stockMovements')) {
                    const store = db.createObjectStore('stockMovements', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('productId', 'productId', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                }

                // Users (for offline login support eventually)
                if (!db.objectStoreNames.contains('users')) {
                    const store = db.createObjectStore('users', { keyPath: 'id' });
                    store.createIndex('username', 'username', { unique: false });
                }

                // Stores (metadata)
                if (!db.objectStoreNames.contains('stores')) {
                    db.createObjectStore('stores', { keyPath: 'id' });
                }

                // Settings
                if (!db.objectStoreNames.contains('settings')) {
                    const store = db.createObjectStore('settings', { keyPath: 'id' });
                }

                // Sync Queue (for operations that need replay)
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const store = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('status', 'status', { unique: false }); // pending, retry
                }
            };
        });
    }

    // Generic put (add/update)
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getPendingSync(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index('syncStatus');
            const request = index.getAll('pending');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// ---------------------------------------------------------
// Offline-First Database Manager
// ---------------------------------------------------------
class OfflineDB {
    constructor() {
        this.local = new LocalDB();
        this.firebaseApp = null;
        this.firestore = null;
        this.isOnline = navigator.onLine;

        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.updateOnlineStatus(true);
            this.syncPendingData();
            // Optional: Request page data reload
            if (typeof loadDashboardStats === 'function') loadDashboardStats();
            if (typeof loadProducts === 'function') loadProducts();
        });
        window.addEventListener('offline', () => {
            this.updateOnlineStatus(false);
        });
    }

    async init() {
        // Init Local DB
        await this.local.init();

        // Init Firestore
        try {
            this.firebaseApp = initializeApp(firebaseConfig);
            this.firestore = getFirestore(this.firebaseApp);
            console.log("🔥 Firebase Initialized");
        } catch (e) {
            console.error("Firebase Init Error:", e);
        }

        // Initialize UI Status
        this.injectStatusIndicator();
        this.updateOnlineStatus(this.isOnline);

        // Initial Sync (if online)
        if (this.isOnline) {
            this.syncPendingData();
        }
    }

    // -----------------------------------------------------
    // Core CRUD
    // -----------------------------------------------------

    async add(collectionName, data) {
        const id = data.id || 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const storeId = data.storeId || this.getCurrentStoreId();

        const record = {
            ...data,
            id: id,
            storeId: storeId,
            syncStatus: this.isOnline ? 'synced' : 'pending',
            _createdAt: new Date().toISOString()
        };

        // 1. Save Local (Always succeeds)
        await this.local.put(collectionName, record);

        // 2. Try Save Cloud (If online)
        if (this.isOnline) {
            try {
                const docRef = doc(this.firestore, collectionName, id);
                // Remove local-only fields before sending to cloud
                const cloudData = { ...record };
                delete cloudData.syncStatus;

                await setDoc(docRef, cloudData);
            } catch (error) {
                console.warn("Cloud save failed, marked as pending:", error);
                // Mark as pending if failed
                record.syncStatus = 'pending';
                await this.local.put(collectionName, record);
                this.updateOnlineStatus(false); // Assume offline if write failed
            }
        }

        return id;
    }

    async get(collectionName, id) {
        // Read Local First
        const localDoc = await this.local.get(collectionName, id);
        if (localDoc) return localDoc;

        // Fallback to Cloud if not found locally and online
        if (this.isOnline) {
            try {
                const docRef = doc(this.firestore, collectionName, id);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = { id: snap.id, ...snap.data(), syncStatus: 'synced' };
                    // Cache it locally for next time
                    await this.local.put(collectionName, data);
                    return data;
                }
            } catch (e) {
                console.warn("Cloud fetch failed:", e);
            }
        }
        return null;
    }

    async getAll(collectionName) {
        // 1. Try Local
        let localData = await this.local.getAll(collectionName);

        // 2. If empty and online, fetch from Cloud
        if (localData.length === 0 && this.isOnline) {
            console.log(`Initial cloud fetch for ${collectionName}...`);
            await this.refreshCollectionFromCloud(collectionName, this.getCurrentStoreId());
            // Re-read local
            localData = await this.local.getAll(collectionName);
        }
        else if (this.isOnline) {
            // Background update if we already have data
            this.refreshCollectionFromCloud(collectionName, this.getCurrentStoreId());
        }

        // Filter by storeId if needed
        const storeId = this.getCurrentStoreId();
        const filtered = localData.filter(item => !item.storeId || item.storeId === storeId);

        return filtered;
    }

    async getByIndex(collectionName, indexName, value) {
        // 1. Try Local
        const localItems = await this.local.getAll(collectionName);
        const localMatch = localItems.find(item => item[indexName] === value);

        if (localMatch) return localMatch;

        // 2. If not found locally and online, try Cloud
        if (this.isOnline) {
            const colRef = collection(this.firestore, collectionName);
            let q;

            // Special case for users (no storeId filter during login if unknown)
            if (collectionName === 'users') {
                q = query(colRef, where(indexName, "==", value));
            } else {
                const storeId = this.getCurrentStoreId();
                q = query(colRef, where(indexName, "==", value), where('storeId', '==', storeId));
            }

            const snap = await getDocs(q);
            if (!snap.empty) {
                const docSnap = snap.docs[0];
                const validMatch = { id: docSnap.id, ...docSnap.data(), syncStatus: 'synced' };

                // Save to local for future offline use
                await this.local.put(collectionName, validMatch);
                return validMatch;
            }
        }

        return null;
    }

    async getAllByIndex(collectionName, indexName, value) {
        // 1. Try Local
        let all = await this.local.getAll(collectionName);

        // 2. If empty and online, trigger cloud fetch
        if (all.length === 0 && this.isOnline) {
            // Background fetch specific to this index query is better than dumping whole collection?
            // But for simplicity/robustness, refresh whole collection works
            await this.refreshCollectionFromCloud(collectionName, this.getCurrentStoreId());
            all = await this.local.getAll(collectionName);
        }

        const storeId = this.getCurrentStoreId();

        return all.filter(item =>
            item[indexName] === value &&
            (!item.storeId || item.storeId === storeId)
        );
    }

    async update(collectionName, data) {
        if (!data.id) throw new Error("ID required for update");

        // Get existing to modify or overwrite
        const existing = await this.local.get(collectionName, data.id) || data;

        const updatedRecord = {
            ...existing,
            ...data,
            syncStatus: this.isOnline ? 'synced' : 'pending',
            _updatedAt: new Date().toISOString()
        };

        // 1. Update Local
        await this.local.put(collectionName, updatedRecord);

        // 2. Update Cloud
        if (this.isOnline) {
            try {
                const docRef = doc(this.firestore, collectionName, data.id);
                // Only send fields being updated + standard fields, excluding internal
                const cloudData = { ...updatedRecord };
                delete cloudData.syncStatus;

                await setDoc(docRef, cloudData, { merge: true });
            } catch (e) {
                console.warn("Cloud update failed:", e);
                updatedRecord.syncStatus = 'pending';
                await this.local.put(collectionName, updatedRecord);
                this.updateOnlineStatus(false);
            }
        }
        return data.id;
    }

    // -----------------------------------------------------
    // Sync Logic
    // -----------------------------------------------------

    async syncPendingData() {
        console.log("🔄 Starting Sync...");
        const collections = ['products', 'transactions'];
        let syncCount = 0;

        for (const col of collections) {
            const pending = await this.local.getPendingSync(col);
            for (const item of pending) {
                try {
                    const docRef = doc(this.firestore, col, item.id);
                    const cloudData = { ...item };
                    delete cloudData.syncStatus;

                    await setDoc(docRef, cloudData, { merge: true });

                    // Mark synced
                    item.syncStatus = 'synced';
                    await this.local.put(col, item);
                    syncCount++;
                    console.log(`Synced ${col}/${item.id}`);
                } catch (e) {
                    console.error(`Failed to sync ${col}/${item.id}:`, e);
                }
            }
        }

        if (syncCount > 0) {
            showToast(`Synced ${syncCount} items to cloud`, 'success');
        }
    }

    async refreshCollectionFromCloud(collectionName, storeId) {
        try {
            const colRef = collection(this.firestore, collectionName);
            let q = query(colRef, where('storeId', '==', storeId));

            if (!storeId && collectionName === 'stores') {
                q = query(colRef);
            }

            const snap = await getDocs(q);
            const cloudItems = snap.docs.map(d => ({ id: d.id, ...d.data(), syncStatus: 'synced' }));

            // Batch save to local
            for (const item of cloudItems) {
                await this.local.put(collectionName, item);
            }
            console.log(`Updated local cache for ${collectionName}: ${cloudItems.length} items`);
        } catch (e) {
            console.warn("Background refresh failed:", e);
        }
    }

    // -----------------------------------------------------
    // Helpers
    // -----------------------------------------------------

    getCurrentStoreId() {
        if (typeof auth !== 'undefined' && auth.getCurrentUser) {
            const user = auth.getCurrentUser();
            return user?.storeId || 'default_store';
        }
        return 'default_store';
    }

    injectStatusIndicator() {
        const el = document.createElement('div');
        el.id = 'connection-status';
        // Basic Styles injected directly
        el.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
        `;
        document.body.appendChild(el);
    }

    updateOnlineStatus(isOnline) {
        this.isOnline = isOnline;
        const el = document.getElementById('connection-status');
        if (!el) return;

        if (isOnline) {
            el.innerHTML = '🟢 Online';
            el.style.background = '#d1fae5';
            el.style.color = '#065f46';
            el.style.border = '1px solid #10b981';

            // Auto hide after 3s if online
            setTimeout(() => {
                el.style.opacity = '0.5';
                el.style.transform = 'translateY(5px)';
            }, 3000);
            el.onmouseenter = () => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }

        } else {
            el.innerHTML = '🔴 Offline';
            el.style.background = '#fee2e2';
            el.style.color = '#991b1b';
            el.style.border = '1px solid #ef4444';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }
    }

    // Register Store (Special case, usually needs online)
    async registerNewStore(storeName, adminUsername, adminPassword, adminName) {
        if (!this.isOnline) throw new Error("Must be online to register a new store");

        // Use cloud logic directly or just implement manual add here
        // Re-implementing logic from original firebase-db.js roughly
        try {
            const storeId = 'store_' + Date.now();

            await this.add('stores', {
                id: storeId,
                name: storeName,
                createdAt: new Date().toISOString(),
                status: 'active',
                storeId: storeId
            });

            const userId = 'user_' + Date.now();
            await this.add('users', {
                id: userId,
                username: adminUsername,
                password: await this.hashPassword(adminPassword),
                role: 'admin',
                name: adminName,
                storeId: storeId
            });

            return { storeId, userId, storeName };
        } catch (error) {
            console.error('Error registering new store:', error);
            throw error;
        }
    }

    async hashPassword(password) {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Backward compatibility generic method if needed
    async initializeDefaults() { }
}

// Assign global
window.db = new OfflineDB();
