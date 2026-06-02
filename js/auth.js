// Authentication and session management
class Auth {
    constructor() {
        this.currentUser = null;
        this.loadSession();
    }

    // Load session from localStorage
    loadSession() {
        const sessionData = localStorage.getItem('pos_session');
        if (sessionData) {
            try {
                this.currentUser = JSON.parse(sessionData);
            } catch (e) {
                console.error('Error loading session:', e);
                this.clearSession();
            }
        }
    }

    // Save session to localStorage
    saveSession(user) {
        this.currentUser = user;
        localStorage.setItem('pos_session', JSON.stringify(user));
    }

    // Update last active activity
    async updateActivity() {
        if (!this.currentUser) return;

        const now = Date.now();
        // Throttle updates: only update if last update was > 1 minute ago
        if (this.lastActivityUpdate && (now - this.lastActivityUpdate < 60000)) {
            return;
        }

        this.lastActivityUpdate = now;

        try {
            // Update local session
            this.currentUser.lastActive = new Date().toISOString();
            this.saveSession(this.currentUser);

            // Update database (fire and forget to not block UI)
            if (this.currentUser.id && db) {
                const userRef = await db.get('users', this.currentUser.id);
                if (userRef) {
                    userRef.lastActive = this.currentUser.lastActive;
                    await db.update('users', userRef);
                }
            }
        } catch (e) {
            console.warn('Failed to update activity status', e);
        }
    }

    // Clear session
    clearSession() {
        this.currentUser = null;
        localStorage.removeItem('pos_session');
    }

    // Login
    async login(username, password) {
        try {
            // Get user by username
            const user = await db.getByIndex('users', 'username', username);

            if (!user) {
                throw new Error('Invalid username or password');
            }

            // Hash the provided password
            const hashedPassword = await db.hashPassword(password);

            // Compare passwords
            if (user.password !== hashedPassword) {
                throw new Error('Invalid username or password');
            }

            // Get store name from stores collection
            let storeName = null;
            if (user.storeId) {
                try {
                    const store = await db.get('stores', user.storeId);
                    if (store && store.name) {
                        storeName = store.name;
                    }
                } catch (error) {
                    console.warn('Could not fetch store name:', error);
                }
            }

            // Create session (exclude password, include storeId and storeName)
            const sessionUser = {
                id: user.id,
                username: user.username,
                email: user.email || '', // Include email in session
                name: user.name || user.username, // Fallback to username if name is not set
                role: user.role,
                storeId: user.storeId
            };

            // Only add storeName if it was successfully retrieved
            if (storeName) {
                sessionUser.storeName = storeName;
            }

            this.saveSession(sessionUser);
            return sessionUser;
        } catch (error) {
            throw error;
        }
    }

    // Logout
    async logout() {
        if (this.currentUser && this.currentUser.id && db) {
            try {
                const userRef = await db.get('users', this.currentUser.id);
                if (userRef) {
                    // Set timestamp to far past or null to indicate offline
                    userRef.lastActive = null;
                    await db.update('users', userRef);
                }
            } catch (e) {
                console.warn('Failed to update logout status', e);
            }
        }
        this.clearSession();
        window.location.href = 'index.html';
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null;
    }

    // Check if user has specific role
    hasRole(role) {
        return this.currentUser && this.currentUser.role === role;
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Require authentication
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }

    // Require specific role
    requireRole(role) {
        if (!this.requireAuth()) {
            return false;
        }
        if (!this.hasRole(role)) {
            showToast('Access denied. Insufficient permissions.', 'error');
            this.logout();
            return false;
        }
        return true;
    }
}

// Create global auth instance
const auth = new Auth();

// Track activity
document.addEventListener('click', () => auth.updateActivity());
document.addEventListener('keypress', () => auth.updateActivity());
document.addEventListener('touchstart', () => auth.updateActivity());
