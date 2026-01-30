// Real-time notifications for Admin
document.addEventListener('DOMContentLoaded', () => {
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationsPanel = document.getElementById('notificationsPanel');
    const notificationsList = document.getElementById('notificationsList');
    const notificationBadge = document.getElementById('notificationBadge');
    const clearAllBtn = document.getElementById('clearAllNotifications');

    let unsubscribe = null;

    // Sound Logic (Short pleasant chime)
    const notificationSound = new Audio('data:audio/mp3;base64,SUQzBAAAAAABAFRYWFgAAAASAAADbWFqb3JfYnJhbmQAZGFzaABUWFhYAAAAEgAAAGNvbXBhdGlibGVfYnJhbmRzAGlzbzZtcDQxAFRFTkMAAAALAAADY2Fzc2FuZHJhAFRTU0UAAAAVAAADTGF2ZjYwLjMuMTAwIChtcDRhKQC/+7BkAA/+7BkAA//7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQAD/7smQADX7smQAAD8AAAAA');

    function playNotificationSound() {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => console.log('Sound interaction required:', e));
    }

    // Toggle panel
    notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationsPanel.classList.toggle('active');

        // Mark all as read when opening panel (optional, simple approach)
        if (notificationsPanel.classList.contains('active')) {
            // markAllAsRead();
        }
    });

    // Clear All
    clearAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to clear all notifications?')) {
            try {
                await db.clearNotifications();
                renderNotifications([]);
            } catch (err) {
                console.error("Failed to clear notifications:", err);
            }
        }
    });

    // Close panel on outside click
    document.addEventListener('click', () => {
        notificationsPanel.classList.remove('active');
    });

    // Start listening for notifications
    async function initNotifications() {
        if (typeof db === 'undefined') return;

        // Request Browser Notification Permission
        if ("Notification" in window) {
            if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                const permission = await Notification.requestPermission();
                if (permission === "granted") {
                    console.log("Notification permission granted.");
                }
            }
        }

        // Wait for DB to be initialized
        const checkDB = setInterval(async () => {
            if (db && db.isInitialized) {
                clearInterval(checkDB);

                unsubscribe = await db.subscribeToNotifications((notifications) => {
                    const latest = notifications[0];
                    // If there's a new unread notification, show system alert + sound
                    if (latest && latest.status === 'unread') {
                        // Avoid double-notifying (simple check based on timestamp/ID)
                        const lastNotifId = localStorage.getItem('last_received_notif');
                        if (latest.id !== lastNotifId) {
                            showSystemNotification(latest);
                            playNotificationSound();
                            localStorage.setItem('last_received_notif', latest.id);
                        }
                    }
                    renderNotifications(notifications);
                });
            }
        }, 500);
    }

    function showSystemNotification(n) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;

        const options = {
            body: n.message,
            icon: 'icons/icon-192x192.png',
            tag: n.type,
            badge: 'icons/icon-72x72.png',
            vibrate: [200, 100, 200]
        };

        new Notification(n.title, options);
    }

    function renderNotifications(notifications) {
        if (!notificationsList) return;

        if (notifications.length === 0) {
            notificationsList.innerHTML = `
                <div class="empty-notifications">
                    <i class="ph ph-bell-slash"></i>
                    <p>No new notifications</p>
                </div>
            `;
            notificationBadge.style.display = 'none';
            return;
        }

        const unreadCount = notifications.filter(n => n.status === 'unread').length;
        if (unreadCount > 0) {
            notificationBadge.textContent = unreadCount;
            notificationBadge.style.display = 'flex';
        } else {
            notificationBadge.style.display = 'none';
        }

        notificationsList.innerHTML = notifications.map(n => `
            <div class="notification-item ${n.status}" data-id="${n.id}">
                <div class="notification-icon ${n.type}">
                    <i class="ph ${getIconForType(n.type)}"></i>
                </div>
                <div class="notification-content">
                    <h4>${n.title}</h4>
                    <p>${n.message}</p>
                    <span class="notification-time">${formatTime(n.createdAt)}</span>
                </div>
            </div>
        `).join('');

        // Add click listeners to items
        document.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.dataset.id;
                await markAsRead(id);
            });
        });
    }

    function getIconForType(type) {
        switch (type) {
            case 'sale': return 'ph-shopping-cart';
            case 'stock_in': return 'ph-plus-circle';
            case 'stock_out': return 'ph-minus-circle';
            case 'low_stock': return 'ph-warning-octagon';
            default: return 'ph-bell';
        }
    }

    function formatTime(timestamp) {
        if (!timestamp) return 'Just now';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = (now - date) / 1000;

        if (diff < 60) return 'Just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return date.toLocaleDateString();
    }

    async function markAsRead(id) {
        try {
            await db.update('notifications', { id, status: 'read' });
        } catch (e) {
            console.error("Error marking as read:", e);
        }
    }

    // Initialize
    initNotifications();

    // Cleanup on page leave
    window.addEventListener('beforeunload', () => {
        if (unsubscribe) unsubscribe();
    });
});
