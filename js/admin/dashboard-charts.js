// Dashboard Charts Management

// Configure Chart.js global defaults to debounce resize events.
// On mobile devices, URL/navigation bars hiding/showing during scrolling triggers window resize events,
// which causes Chart.js to recalculate and redraw charts instantly, stalling scroll animations.
if (typeof Chart !== 'undefined') {
    Chart.defaults.resizeDelay = 250;
}

let salesTrendChartInstance = null;
let categoryChartInstance = null;
let paymentMethodChartInstance = null;
let peakHoursChartInstance = null;

// Initialize or update dashboard charts
function updateDashboardCharts(transactions, products) {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded');
        return;
    }

    // Determine time granularity based on transaction spread
    const dates = transactions.map(t => t.date.split('T')[0]);
    const uniqueDates = new Set(dates);
    const isSingleDay = uniqueDates.size <= 1;

    renderSalesTrendChart(transactions, isSingleDay);
    renderCategoryChart(transactions, products);
    renderPaymentMethodChart(transactions);
    renderPeakHoursChart(transactions);
}

// 1. Sales Trend Chart (Dynamic: Hourly for single day, Daily otherwise)
function renderSalesTrendChart(transactions, isSingleDay) {
    const ctx = document.getElementById('salesTrendChart')?.getContext('2d');
    if (!ctx) return;

    let labels = [];
    let data = [];
    let labelText = '';

    // Filter out voided transactions
    const validTransactions = transactions.filter(t => t.status !== 'voided');

    if (isSingleDay) {
        // Hourly Trend
        labelText = 'Hourly Sales';
        const hours = {};
        // Initialize 6 AM to 10 PM mostly, but let's do all active hours
        // Or just 24 hours
        for (let i = 0; i < 24; i++) hours[i] = 0;

        validTransactions.forEach(t => {
            const h = new Date(t.date).getHours();
            hours[h] += (Number(t.total) || Number(t.amount) || 0);
        });

        // Determine range to show (trim empty start/end if desired, or show full day)
        // Showing full day 6am-10pm is usually better for retail, but let's show all 24h or active range?
        // Let's simple show 0-23
        labels = Array.from({ length: 24 }, (_, i) => {
            if (i === 0) return '12 AM';
            if (i === 12) return '12 PM';
            return i > 12 ? `${i - 12} PM` : `${i} AM`;
        });
        data = Object.values(hours);
    } else {
        // Daily Trend
        labelText = 'Daily Sales';
        // Group by date
        const salesByDate = {};

        // Sort transactions by date
        const sortedTxns = [...validTransactions].sort((a, b) => new Date(a.date) - new Date(b.date));

        if (sortedTxns.length > 0) {
            const startDate = new Date(sortedTxns[0].date);
            const endDate = new Date(sortedTxns[sortedTxns.length - 1].date);

            // Fill all dates in range
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                salesByDate[dateStr] = 0;
            }
        }

        validTransactions.forEach(t => {
            const dateStr = t.date.split('T')[0];
            if (salesByDate[dateStr] !== undefined) {
                salesByDate[dateStr] += (Number(t.total) || Number(t.amount) || 0);
            } else {
                // If distinct dates are sparse/outside init range (shouldn't happen with sorted logic above)
                salesByDate[dateStr] = (salesByDate[dateStr] || 0) + (Number(t.total) || Number(t.amount) || 0);
            }
        });

        // Sort keys again to be sure
        const sortedDates = Object.keys(salesByDate).sort();
        labels = sortedDates.map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        data = sortedDates.map(d => salesByDate[d]);
    }

    // Destroy existing chart if any
    if (salesTrendChartInstance) {
        salesTrendChartInstance.destroy();
    }

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)'); // Primary color
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    salesTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: data,
                borderColor: '#6366f1',
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#6366f1',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        borderDash: [2, 4],
                        color: '#f3f4f6'
                    },
                    ticks: {
                        callback: function (value) {
                            return '₱' + value;
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// 2. Sales by Category Chart
function renderCategoryChart(transactions, products) {
    const ctx = document.getElementById('categoryChart')?.getContext('2d');
    if (!ctx) return;

    // Map product IDs to Categories
    const productCategories = {};
    products.forEach(p => {
        productCategories[p.id] = p.category || 'Uncategorized';
    });

    // Filter out voided transactions
    const validTransactions = transactions.filter(t => t.status !== 'voided');

    // Aggregate sales by category
    const categorySales = {};

    validTransactions.forEach(t => {
        if (!t.items) return;
        t.items.forEach(item => {
            const category = productCategories[item.id] || item.category || 'Uncategorized';
            if (!categorySales[category]) {
                categorySales[category] = 0;
            }
            categorySales[category] += ((Number(item.price) || 0) * (Number(item.quantity) || 0));
        });
    });

    // Sort by value desc
    const sortedEntries = Object.entries(categorySales).sort((a, b) => b[1] - a[1]);

    // Limit to top 5 + Others
    let labels = [];
    let data = [];

    if (sortedEntries.length > 5) {
        const top5 = sortedEntries.slice(0, 5);
        const others = sortedEntries.slice(5);

        labels = top5.map(e => e[0]);
        data = top5.map(e => e[1]);

        const othersTotal = others.reduce((sum, e) => sum + e[1], 0);
        labels.push('Others');
        data.push(othersTotal);
    } else {
        labels = sortedEntries.map(e => e[0]);
        data = sortedEntries.map(e => e[1]);
    }

    // Modern colors array
    const backgroundColors = [
        '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#06b6d4'
    ];

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom', // Move to bottom for better space
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            },
            cutout: '65%',
        }
    });
}

// 3. Payment Method Chart (New)
function renderPaymentMethodChart(transactions) {
    const ctx = document.getElementById('paymentMethodChart')?.getContext('2d');
    if (!ctx) return;

    // Filter out voided transactions
    const validTransactions = transactions.filter(t => t.status !== 'voided');

    const methodStats = {};

    validTransactions.forEach(t => {
        if (t.paymentMethod === 'split') {
            // Attribute each portion to its actual method
            const cash  = Number(t.cashAmount)  || 0;
            const gcash = Number(t.gcashAmount) || 0;
            if (cash  > 0) { methodStats['Cash']  = (methodStats['Cash']  || 0) + cash; }
            if (gcash > 0) { methodStats['GCash'] = (methodStats['GCash'] || 0) + gcash; }
        } else {
            const method = t.paymentMethod || 'Cash';
            if (!methodStats[method]) methodStats[method] = 0;
            methodStats[method] += (Number(t.total) || Number(t.amount) || 0);
        }
    });

    const labels = Object.keys(methodStats);
    const data = Object.values(methodStats);

    const backgroundColors = [
        '#10b981', // Emerald (Cash)
        '#3b82f6', // Blue (Gcash etc)
        '#f59e0b', // Amber
        '#6366f1', // Indigo
        '#ec4899'  // Pink
    ];

    if (paymentMethodChartInstance) {
        paymentMethodChartInstance.destroy();
    }

    paymentMethodChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// 4. Peak Hours Chart
function renderPeakHoursChart(transactions) {
    const ctx = document.getElementById('peakHoursChart')?.getContext('2d');
    if (!ctx) return;

    // Filter out voided transactions
    const validTransactions = transactions.filter(t => t.status !== 'voided');

    // Initialize 24-hour array
    const hours = Array(24).fill(0);

    validTransactions.forEach(t => {
        const date = new Date(t.date);
        const hour = date.getHours();
        hours[hour]++; // Count transactions
    });

    // Create labels (12 AM, 1 AM, ...)
    const hourLabels = hours.map((_, i) => {
        if (i === 0) return '12 AM';
        if (i === 12) return '12 PM';
        return i > 12 ? `${i - 12} PM` : `${i} AM`;
    });

    if (peakHoursChartInstance) {
        peakHoursChartInstance.destroy();
    }

    peakHoursChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hourLabels,
            datasets: [{
                label: 'Transactions',
                data: hours,
                backgroundColor: '#8b5cf6',
                borderRadius: 4,
                hoverBackgroundColor: '#7c3aed'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Export for usage
if (typeof window !== 'undefined') {
    window.updateDashboardCharts = updateDashboardCharts;
}
