// Real-time notifications for Admin
document.addEventListener('DOMContentLoaded', () => {
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationsPanel = document.getElementById('notificationsPanel');
    const notificationsList = document.getElementById('notificationsList');
    const notificationBadge = document.getElementById('notificationBadge');
    const clearAllBtn = document.getElementById('clearAllNotifications');

    let unsubscribe = null;

    // Toggle panel
    notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationsPanel.classList.toggle('active');

        // Mark all as read when opening panel (optional, simple approach)
        if (notificationsPanel.classList.contains('active')) {
            // markAllAsRead();
        }
    });

    // Close panel on outside click
    document.addEventListener('click', () => {
        notificationsPanel.classList.remove('active');
    });

    // Start listening for notifications
    async function initNotifications() {
        if (typeof db === 'undefined') return;

        // Wait for DB to be initialized
        const checkDB = setInterval(async () => {
            if (db.isOnline !== undefined) {
                clearInterval(checkDB);

                unsubscribe = await db.subscribeToNotifications((notifications) => {
                    renderNotifications(notifications);
                });
            }
        }, 500);
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
