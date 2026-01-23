// Dashboard Charts Management

let salesTrendChartInstance = null;
let categoryChartInstance = null;
let peakHoursChartInstance = null;

// Initialize or update dashboard charts
function updateDashboardCharts(transactions, products) {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded');
        return;
    }

    renderSalesTrendChart(transactions);
    renderCategoryChart(transactions, products);
    renderPeakHoursChart(transactions);
}

// 1. Sales Trend Chart (Last 7 Days)
function renderSalesTrendChart(transactions) {
    const ctx = document.getElementById('salesTrendChart')?.getContext('2d');
    if (!ctx) return;

    // Process data: Get last 7 days sales
    const last7Days = [];
    const salesData = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        last7Days.push(label);

        // Sum sales for this day
        const dayTotal = transactions
            .filter(t => t.date.startsWith(dateStr))
            .reduce((sum, t) => sum + t.total, 0);

        salesData.push(dayTotal);
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
            labels: last7Days,
            datasets: [{
                label: 'Daily Sales',
                data: salesData,
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

    // Aggregate sales by category
    const categorySales = {};

    transactions.forEach(t => {
        t.items.forEach(item => {
            const category = productCategories[item.id] || item.category || 'Uncategorized';
            if (!categorySales[category]) {
                categorySales[category] = 0;
            }
            categorySales[category] += (item.price * item.quantity);
        });
    });

    const labels = Object.keys(categorySales);
    const data = Object.values(categorySales);

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
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: {
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
            cutout: '70%',
        }
    });
}

// 3. Peak Hours Chart
function renderPeakHoursChart(transactions) {
    const ctx = document.getElementById('peakHoursChart')?.getContext('2d');
    if (!ctx) return;

    // Initialize 24-hour array
    const hours = Array(24).fill(0);

    transactions.forEach(t => {
        const date = new Date(t.date);
        const hour = date.getHours();
        hours[hour]++;
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
