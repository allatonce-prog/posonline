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
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// TODO: Replace with your actual Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAd7RaewTXl5kTivJQyLe_S_Pe1ViO9Syc",
    authDomain: "pos-onlone.firebaseapp.com",
    projectId: "pos-onlone",
    storageBucket: "pos-onlone.firebasestorage.app",
    messagingSenderId: "535727480126",
    appId: "1:535727480126:web:53e8256514f9b63fd7606f"
};

class FirebaseDatabase {
    constructor() {
        this.db = null;
        this.app = null;
    }

    // Get current user's storeId
    getCurrentStoreId() {
        // Check if auth is available and user is logged in
        if (typeof auth !== 'undefined' && auth.getCurrentUser) {
            const user = auth.getCurrentUser();
            return user?.storeId || 'default_store';
        }
        // Return null if no auth (e.g., during registration)
        return null;
    }

    // Initialize database
    async init() {
        try {
            this.app = initializeApp(firebaseConfig);
            this.db = getFirestore(this.app);
            console.log("Firebase Initialized");
            return this.db;
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            throw error;
        }
    }

    // Generic add method
    async add(storeName, data) {
        try {
            const colRef = collection(this.db, storeName);

            // Use provided storeId if exists, otherwise get from current user
            const storeId = data.storeId || this.getCurrentStoreId();

            // Add storeId and timestamp
            const dataWithMetadata = {
                ...data,
                storeId: storeId,
                _createdAt: new Date().toISOString()
            };
            const docRef = await addDoc(colRef, dataWithMetadata);

            // Return the new ID (matching IndexedDB behavior where add returns the key)
            return docRef.id;
        } catch (error) {
            console.error(`Error adding to ${storeName}:`, error);
            throw error;
        }
    }

    // Generic get method
    async get(storeName, id) {
        try {
            const docRef = doc(this.db, storeName, id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            } else {
                return null;
            }
        } catch (error) {
            console.error(`Error getting from ${storeName}:`, error);
            throw error;
        }
    }

    // Generic getAll method
    async getAll(storeName) {
        try {
            const storeId = this.getCurrentStoreId();
            const colRef = collection(this.db, storeName);

            // If no storeId (not logged in) or accessing 'stores' collection, don't filter
            if (!storeId || storeName === 'stores') {
                const querySnapshot = await getDocs(colRef);
                return querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            }

            // Otherwise filter by storeId
            const q = query(colRef, where('storeId', '==', storeId));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error(`Error getting all from ${storeName}:`, error);
            throw error;
        }
    }

    // Generic update method
    async update(storeName, data) {
        try {
            if (!data.id) throw new Error("Document ID is required for update matches");

            const docRef = doc(this.db, storeName, data.id);
            // Create a copy to remove the ID from the payload if strict, 
            // but Firestore updateDoc ignores fields not in the dict so it's fine.
            // We should ensure we don't overwrite the ID with itself effectively.
            const { id, ...updateData } = data;

            await updateDoc(docRef, updateData);
            return data.id;
        } catch (error) {
            console.error(`Error updating ${storeName}:`, error);
            throw error;
        }
    }

    // Generic delete method
    async delete(storeName, id) {
        try {
            const docRef = doc(this.db, storeName, id);
            await deleteDoc(docRef);
            return true;
        } catch (error) {
            console.error(`Error deleting from ${storeName}:`, error);
            throw error;
        }
    }

    // Get by index (simulated with where query)
    async getByIndex(storeName, indexName, value) {
        try {
            const storeId = this.getCurrentStoreId();
            const colRef = collection(this.db, storeName);

            // For users collection (login), don't filter by storeId
            // We need to search all users to find the username
            if (storeName === 'users') {
                const q = query(colRef, where(indexName, "==", value));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
                return null;
            }

            // For other collections, filter by storeId if available
            if (storeId) {
                const q = query(
                    colRef,
                    where(indexName, "==", value),
                    where('storeId', '==', storeId)
                );
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
                return null;
            }

            // If no storeId, just search by index
            const q = query(colRef, where(indexName, "==", value));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error(`Error getting by index from ${storeName}:`, error);
            throw error;
        }
    }

    // Get all by index
    async getAllByIndex(storeName, indexName, value) {
        try {
            const storeId = this.getCurrentStoreId();
            const colRef = collection(this.db, storeName);
            const q = query(
                colRef,
                where(indexName, "==", value),
                where('storeId', '==', storeId)
            );
            const querySnapshot = await getDocs(q);

            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error(`Error getting all by index from ${storeName}:`, error);
            throw error;
        }
    }

    // Clear store (Dangerous in Firestore - deletes one by one)
    async clear(storeName) {
        try {
            const colRef = collection(this.db, storeName);
            const snapshot = await getDocs(colRef);
            const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            return true;
        } catch (error) {
            console.error(`Error clearing ${storeName}:`, error);
            throw error;
        }
    }

    // Initialize default data
    async initializeDefaults() {
        // No default users - stores must be registered via register-store.html
        // This prevents credential conflicts when multiple stores are created
        console.log("Database initialized. Register a new store to create admin account.");
    }

    // Register a new store
    async registerNewStore(storeName, adminUsername, adminPassword, adminName = 'Store Admin') {
        try {
            const storeId = 'store_' + Date.now();

            // Create store record
            await this.add('stores', {
                id: storeId,
                name: storeName,
                createdAt: new Date().toISOString(),
                status: 'active',
                storeId: storeId
            });

            // Create admin user for this store
            const userId = await this.add('users', {
                username: adminUsername,
                password: await this.hashPassword(adminPassword),
                role: 'admin',
                name: adminName,
                storeId: storeId
            });

            console.log(`New store registered: ${storeName} (${storeId})`);
            return { storeId, userId, storeName };
        } catch (error) {
            console.error('Error registering new store:', error);
            throw error;
        }
    }

    // Hash password (reusing existing SHA-256 logic)
    async hashPassword(password) {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}

// Create global database instance attached to window for compatibility
window.db = new FirebaseDatabase();
