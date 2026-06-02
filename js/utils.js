// Utility functions

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(amount);
}

// Format date
function formatDate(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

// Format datetime
function formatDateTime(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// Format time
function formatTime(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// Show toast notification
function showToast(message, type = 'info') {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cursor = 'grab';

    // Add to body
    document.body.appendChild(toast);

    // Swipe logic
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let autoDismissTimeout;

    const startDragging = (e) => {
        isDragging = true;
        startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        toast.style.transition = 'none';
        toast.style.cursor = 'grabbing';
        clearTimeout(autoDismissTimeout); // Pause auto-dismiss
    };

    const drag = (e) => {
        if (!isDragging) return;
        const x = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        currentX = x - startX;

        // Only allow horizontal swipe out
        toast.style.transform = `translateX(${currentX}px)`;
        toast.style.opacity = 1 - Math.abs(currentX) / 300;
    };

    const stopDragging = () => {
        if (!isDragging) return;
        isDragging = false;
        toast.style.cursor = 'grab';

        const threshold = 100;
        if (Math.abs(currentX) > threshold) {
            // Dismiss
            toast.style.transition = 'all 0.3s ease';
            toast.style.transform = `translateX(${currentX > 0 ? 500 : -500}px)`;
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        } else {
            // Reset
            toast.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';

            // Resume auto-dismiss
            autoDismissTimeout = setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    };

    toast.addEventListener('touchstart', startDragging, { passive: true });
    toast.addEventListener('touchmove', drag, { passive: true });
    toast.addEventListener('touchend', stopDragging);

    // Mouse support
    toast.addEventListener('mousedown', startDragging);
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', stopDragging);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    autoDismissTimeout = setTimeout(() => {
        if (!isDragging) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }
    }, 3000);
}

// Show loading overlay
function showLoading(message = 'Loading...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

// Hide loading overlay
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Confirm dialog
function confirmDialog(message) {
    return confirm(message);
}

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Format transaction ID to compact format
function formatTransactionId(id) {
    // Convert to string and pad with zeros to make it 3 digits minimum
    const paddedId = String(id).padStart(3, '0');
    return `TXN-${paddedId}`;
}


// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Print receipt
function printReceipt(receiptHtml) {
    const printArea = document.getElementById('receipt-printable');

    if (printArea) {
        // Use in-page printing (Better for mobile/thermal printers)

        // Wrap content in basic styling container similar to previous popup
        printArea.innerHTML = `
            <div style="font-family: 'Courier New', monospace; max-width: 300px; margin: 0 auto;">
                ${receiptHtml}
            </div>
        `;

        setTimeout(() => {
            window.print();
            // Optional: Clear after print to avoid "ghost" content if styles leak
            // setTimeout(() => printArea.innerHTML = '', 1000);
        }, 100);

    } else {
        // Fallback for pages without the print container
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to print receipt');
            return;
        }

        printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Receipt</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              max-width: 300px;
              margin: 0 auto;
              padding: 20px;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${receiptHtml}
        </body>
        </html>
      `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    }
}

// Export to CSV
function exportToCSV(data, filename) {
    if (!data || !data.length) {
        showToast('No data to export', 'warning');
        return;
    }

    // Get headers
    const headers = Object.keys(data[0]);

    // Create CSV content
    let csv = headers.join(',') + '\n';

    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csv += values.join(',') + '\n';
    });

    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);

    showToast('Export successful', 'success');
}

// Calculate percentage
function calculatePercentage(value, total) {
    if (total === 0) return 0;
    return ((value / total) * 100).toFixed(2);
}

// Get date range
function getDateRange(range) {
    const now = new Date();
    const start = new Date();

    switch (range) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'week':
            start.setDate(now.getDate() - 7);
            start.setHours(0, 0, 0, 0);
            break;
        case 'month':
            start.setMonth(now.getMonth() - 1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'year':
            start.setFullYear(now.getFullYear() - 1);
            start.setHours(0, 0, 0, 0);
            break;
        default:
            start.setHours(0, 0, 0, 0);
    }

    return { start, end: now };
}

// Reset App / Clear Cache
async function resetAppCache() {
    if (!confirm('This will clear the app cache and reload to get the latest updates. Continue?')) {
        return;
    }

    showLoading('Updating app...');

    try {
        // 1. Unregister Service Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
        }

        // 2. Clear all Caches
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
            );
        }

        // 3. Reload Page with Force Get
        window.location.reload(true);

    } catch (error) {
        console.error('Error resetting app:', error);
        showToast('Error resetting app: ' + error.message, 'error');
        hideLoading();
    }
}
