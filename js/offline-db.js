
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
    setDoc,
    onSnapshot,
    orderBy,
    limit,
    serverTimestamp,
    writeBatch
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
const DB_VERSION = 5; // Incremented for notifications

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

                // Expenses
                if (!db.objectStoreNames.contains('expenses')) {
                    const store = db.createObjectStore('expenses', { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('cashier', 'cashier', { unique: false });
                    store.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // Collectibles
                if (!db.objectStoreNames.contains('collectibles')) {
                    const store = db.createObjectStore('collectibles', { keyPath: 'id' });
                    store.createIndex('customerName', 'customerName', { unique: false });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // Sync Queue (for operations that need replay)
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const store = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('status', 'status', { unique: false }); // pending, retry
                }

                // Notifications
                if (!db.objectStoreNames.contains('notifications')) {
                    const store = db.createObjectStore('notifications', { keyPath: 'id' });
                    store.createIndex('storeId', 'storeId', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('status', 'status', { unique: false }); // unread, read
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

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);
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
        this.isInitialized = false;

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

        this.isInitialized = true;
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
        // 1. Try Cloud First (if online)
        if (this.isOnline) {
            try {
                const docRef = doc(this.firestore, collectionName, String(id));
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = { id: snap.id, ...snap.data(), syncStatus: 'synced' };
                    // Update Local Cache
                    await this.local.put(collectionName, data);
                    return data;
                }
            } catch (e) {
                console.warn("Cloud fetch failed, falling back to local:", e);
            }
        }

        // 2. Fallback to Local
        return await this.local.get(collectionName, id);
    }

    async getAll(collectionName, forceCloud = false) {
        // 1. Try Cloud First (if online)
        if (this.isOnline) {
            try {
                const storeId = this.getCurrentStoreId();
                const colRef = collection(this.firestore, collectionName);
                let q = query(colRef, where('storeId', '==', storeId));

                if (!storeId && collectionName === 'stores') {
                    q = query(colRef);
                }

                const snap = await getDocs(q);
                const cloudItems = snap.docs.map(d => ({ id: d.id, ...d.data(), syncStatus: 'synced' }));

                // Batch update local cache
                for (const item of cloudItems) {
                    await this.local.put(collectionName, item);
                }

                // If we fetched everything, we should ideally clear local items that are no longer in cloud 
                // but for an offline-enabled POS, we keep them or mark them. 
                // For now, we just return the fresh cloud data.
                return cloudItems;
            } catch (e) {
                console.warn(`Cloud getAll failed for ${collectionName}, falling back to local:`, e);
            }
        }

        // 2. Fallback to Local
        const localData = await this.local.getAll(collectionName);
        const storeId = this.getCurrentStoreId();
        return localData.filter(item => !item.storeId || item.storeId === storeId);
    }

    async getByIndex(collectionName, indexName, value) {
        // 1. Try Cloud First (if online)
        if (this.isOnline) {
            try {
                const colRef = collection(this.firestore, collectionName);
                let q;

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
                    // Update Local
                    await this.local.put(collectionName, validMatch);
                    return validMatch;
                }
            } catch (e) {
                console.warn("Cloud getByIndex failed, falling back to local:", e);
            }
        }

        // 2. Fallback to Local
        const localItems = await this.local.getAll(collectionName);
        return localItems.find(item => item[indexName] === value);
    }

    async getAllByIndex(collectionName, indexName, value, forceCloud = false) {
        // 1. Try Cloud First (if online)
        if (this.isOnline) {
            try {
                const storeId = this.getCurrentStoreId();
                const colRef = collection(this.firestore, collectionName);
                const q = query(
                    colRef,
                    where(indexName, "==", value),
                    where('storeId', '==', storeId)
                );

                const snap = await getDocs(q);
                const cloudItems = snap.docs.map(d => ({ id: d.id, ...d.data(), syncStatus: 'synced' }));

                // Update local cache with matches
                for (const item of cloudItems) {
                    await this.local.put(collectionName, item);
                }

                return cloudItems;
            } catch (e) {
                console.warn(`Cloud getAllByIndex failed for ${collectionName}, falling back to local:`, e);
            }
        }

        // 2. Fallback to Local
        const all = await this.local.getAll(collectionName);
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

    // Generic set method (for compatibility)
    async set(collectionName, id, data) {
        const record = {
            ...data,
            id: id,
            syncStatus: this.isOnline ? 'synced' : 'pending',
            _updatedAt: new Date().toISOString()
        };

        // 1. Save Local
        await this.local.put(collectionName, record);

        // 2. Save Cloud
        if (this.isOnline) {
            try {
                const docRef = doc(this.firestore, collectionName, id);
                const cloudData = { ...record };
                delete cloudData.syncStatus;
                await setDoc(docRef, cloudData, { merge: true });
            } catch (e) {
                console.warn("Cloud set failed:", e);
                record.syncStatus = 'pending';
                await this.local.put(collectionName, record);
            }
        }
        return id;
    }

    async remove(collectionName, id) {
        // 1. Delete Local
        await this.local.delete(collectionName, id);

        // 2. Delete Cloud
        if (this.isOnline) {
            try {
                // Ensure ID is a string for Firebase doc reference
                const docRef = doc(this.firestore, collectionName, String(id));
                await deleteDoc(docRef);
                console.log(`Deleted ${collectionName}/${id} from cloud`);
            } catch (e) {
                console.warn("Cloud delete failed:", e);
                // In a production app, we would queue this deletion for sync
                // For now, we rely on the user being online or sync logic.
            }
        }
    }

    // Alias for compatibility
    async delete(collectionName, id) {
        return this.remove(collectionName, id);
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
        // Premium Styles for the Status Indicator
        el.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 8px 15px;
            border-radius: 50px;
            font-size: 13px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            overflow: hidden;
            white-space: nowrap;
            max-width: 200px;
        `;
        document.body.appendChild(el);

        // Add hover functionality to re-expand
        el.onmouseenter = () => {
            if (this.isOnline) {
                el.style.maxWidth = '200px';
                el.style.padding = '8px 15px';
                const text = el.querySelector('.status-text');
                if (text) text.style.opacity = '1';
            }
        };
        el.onmouseleave = () => {
            if (this.isOnline) {
                this.scheduleStatusCollapse();
            }
        };
    }

    scheduleStatusCollapse() {
        if (this._statusTimeout) clearTimeout(this._statusTimeout);
        this._statusTimeout = setTimeout(() => {
            const el = document.getElementById('connection-status');
            if (el && this.isOnline) {
                el.style.maxWidth = '38px'; // Enough for just the dot
                el.style.padding = '8px 12px';
                const text = el.querySelector('.status-text');
                if (text) text.style.opacity = '0';
            }
        }, 3000);
    }

    updateOnlineStatus(isOnline) {
        this.isOnline = isOnline;
        const el = document.getElementById('connection-status');
        if (!el) return;

        if (isOnline) {
            el.innerHTML = `
                <div style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; flex-shrink: 0;"></div>
                <span class="status-text" style="transition: opacity 0.3s ease;">Online</span>
            `;
            el.style.background = 'rgba(209, 250, 229, 0.9)';
            el.style.color = '#065f46';
            el.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            el.style.backdropFilter = 'blur(8px)';

            // Expand first when status changes
            el.style.maxWidth = '200px';
            el.style.padding = '8px 15px';

            this.scheduleStatusCollapse();
        } else {
            if (this._statusTimeout) clearTimeout(this._statusTimeout);
            el.innerHTML = `
                <div style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 8px #ef4444; flex-shrink: 0; animation: statusPulse 2s infinite;"></div>
                <span class="status-text">Offline</span>
            `;
            el.style.background = 'rgba(254, 226, 226, 0.9)';
            el.style.color = '#991b1b';
            el.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            el.style.backdropFilter = 'blur(8px)';
            el.style.maxWidth = '200px';
            el.style.padding = '8px 15px';

            // Ensure pulse animation exists
            if (!document.getElementById('status-anim-style')) {
                const style = document.createElement('style');
                style.id = 'status-anim-style';
                style.innerHTML = `
                    @keyframes statusPulse {
                        0% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.5; transform: scale(1.2); }
                        100% { opacity: 1; transform: scale(1); }
                    }
                `;
                document.head.appendChild(style);
            }
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
    // Real-time notifications listener
    async subscribeToNotifications(callback) {
        if (!this.isOnline) return null;

        const storeId = this.getCurrentStoreId();
        const q = query(
            collection(this.firestore, 'notifications'),
            where('storeId', '==', storeId),
            orderBy('createdAt', 'desc'),
            limit(5) // Only show latest 5
        );

        return onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sync to local
            notifications.forEach(async (n) => {
                await this.local.put('notifications', n);
            });

            callback(notifications);
        }, (error) => {
            console.error("Notification listener error:", error);
        });
    }

    // Helper to send a notification
    async notify(type, title, message, metadata = {}) {
        const storeId = this.getCurrentStoreId();
        const notification = {
            storeId: storeId,
            type: type, // 'sale', 'stock_in', 'stock_out', 'low_stock'
            title: title,
            message: message,
            metadata: metadata,
            status: 'unread',
            createdAt: new Date().toISOString(),
            _serverTime: serverTimestamp()
        };

        try {
            // Priority 1: Cloud if online
            if (this.isOnline) {
                await addDoc(collection(this.firestore, 'notifications'), notification);
                // Auto prune after adding new one
                this.pruneOldNotifications();
            } else {
                // Priority 2: Local if offline (will need sync later if we implement notification queue)
                notification.id = 'notif_' + Date.now();
                await this.local.put('notifications', notification);
            }
        } catch (e) {
            console.error("Failed to create notification:", e);
        }
    }

    // Automatically delete notifications exceeding 5
    async pruneOldNotifications() {
        if (!this.isOnline) return;

        const storeId = this.getCurrentStoreId();
        try {
            const q = query(
                collection(this.firestore, 'notifications'),
                where('storeId', '==', storeId),
                orderBy('createdAt', 'desc')
            );

            const snap = await getDocs(q);
            if (snap.size > 5) {
                const batch = writeBatch(this.firestore);
                // Keep the first 5, delete the rest
                const toDelete = snap.docs.slice(5);
                toDelete.forEach(d => {
                    batch.delete(d.ref);
                    this.local.delete('notifications', d.id); // Also clear local
                });
                await batch.commit();
                console.log(`Pruned ${toDelete.length} old notifications`);
            }
        } catch (e) {
            console.warn("Failed to prune notifications:", e);
        }
    }

    async clearNotifications() {
        const storeId = this.getCurrentStoreId();

        // 1. Clear Local
        const localItems = await this.local.getAll('notifications');
        for (const item of localItems) {
            if (item.storeId === storeId) {
                await this.local.delete('notifications', item.id);
            }
        }

        // 2. Clear Cloud
        if (this.isOnline) {
            try {
                const q = query(collection(this.firestore, 'notifications'), where('storeId', '==', storeId));
                const snap = await getDocs(q);

                if (!snap.empty) {
                    const batch = writeBatch(this.firestore);
                    snap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            } catch (e) {
                console.error("Cloud clear notifications failed:", e);
            }
        }
    }

    // Backward compatibility generic method if needed
    async initializeDefaults() { }
}

// Assign global
window.db = new OfflineDB();
