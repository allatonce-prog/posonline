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

// Dynamic chart coloring options based on dark mode body classes
function getChartThemeOptions() {
    const isDark = document.body.classList.contains('dark-mode');
    return {
        textColor: isDark ? '#94a3b8' : '#64748b',
        gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f3f4f6',
        legendColor: isDark ? '#e2e8f0' : '#475569'
    };
}

let lastLoadedTransactions = [];
let lastLoadedProducts = [];

// Initialize or update dashboard charts
function updateDashboardCharts(transactions, products) {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded');
        return;
    }

    lastLoadedTransactions = transactions || [];
    lastLoadedProducts = products || [];

    // Determine time granularity based on transaction spread
    const dates = lastLoadedTransactions.map(t => t.date.split('T')[0]);
    const uniqueDates = new Set(dates);
    const isSingleDay = uniqueDates.size <= 1;

    renderSalesTrendChart(lastLoadedTransactions, isSingleDay);
    renderCategoryChart(lastLoadedTransactions, lastLoadedProducts);
    renderPaymentMethodChart(lastLoadedTransactions);
    renderPeakHoursChart(lastLoadedTransactions);
    renderAllSparklines(lastLoadedTransactions);
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
    const theme = getChartThemeOptions();
    const isDark = document.body.classList.contains('dark-mode');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    if (isDark) {
        gradient.addColorStop(0, 'rgba(52, 211, 153, 0.4)'); // Emerald/Green glow
        gradient.addColorStop(1, 'rgba(52, 211, 153, 0.0)');
    } else {
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)'); // Indigo/Blue glow
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    }

    const datasets = [{
        label: labelText,
        data: [...data],
        borderColor: isDark ? '#34d399' : '#6366f1',
        backgroundColor: gradient,
        borderWidth: 2,
        pointBackgroundColor: isDark ? '#111827' : '#ffffff',
        pointBorderColor: isDark ? '#34d399' : '#6366f1',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
    }];

    const showForecast = document.getElementById('enableForecastToggle')?.checked;
    if (showForecast && data.length >= 2) {
        const N = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < N; i++) {
            sumX += i;
            sumY += data[i];
            sumXY += i * data[i];
            sumXX += i * i;
        }

        const slope = (N * sumXY - sumX * sumY) / (N * sumXX - sumX * sumX || 1);
        const intercept = (sumY - slope * sumX) / N;

        // Connections & projected points padding
        const forecastData = new Array(N - 1).fill(null);
        forecastData.push(data[N - 1]); // Connect with last actual point

        const forecastSteps = 7;
        const lastLabelDate = isSingleDay ? null : new Date(sortedDates[sortedDates.length - 1]);

        for (let i = 1; i <= forecastSteps; i++) {
            const projectedIndex = (N - 1) + i;
            const projectedValue = Math.max(0, slope * projectedIndex + intercept);
            forecastData.push(projectedValue);

            if (isSingleDay) {
                // Hourly est
                const nextHourNum = i % 24;
                const hourStr = nextHourNum === 0 ? '12 AM' : nextHourNum === 12 ? '12 PM' : nextHourNum > 12 ? `${nextHourNum - 12} PM` : `${nextHourNum} AM`;
                labels.push(`${hourStr} (Est)`);
            } else {
                const nextDate = new Date(lastLabelDate);
                nextDate.setDate(nextDate.getDate() + i);
                labels.push(nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' (Est)');
            }
        }

        datasets.push({
            label: 'Forecast Projection (Est)',
            data: forecastData,
            borderColor: isDark ? '#fbbf24' : '#f59e0b',
            borderWidth: 2,
            borderDash: [6, 6],
            pointBackgroundColor: isDark ? '#111827' : '#ffffff',
            pointBorderColor: isDark ? '#fbbf24' : '#f59e0b',
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.15
        });
    }

    salesTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
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
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#1e293b',
                    bodyColor: isDark ? '#e2e8f0' : '#475569',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
                    borderWidth: 1,
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
                        color: theme.gridColor
                    },
                    ticks: {
                        color: theme.textColor,
                        callback: function (value) {
                            return '₱' + value;
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: theme.textColor
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

    const theme = getChartThemeOptions();
    const isDark = document.body.classList.contains('dark-mode');
    
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
                        color: theme.legendColor,
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        }
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#1e293b',
                    bodyColor: isDark ? '#e2e8f0' : '#475569',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
                    borderWidth: 1,
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

    const theme = getChartThemeOptions();
    const isDark = document.body.classList.contains('dark-mode');

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
                        color: theme.legendColor,
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        }
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#1e293b',
                    bodyColor: isDark ? '#e2e8f0' : '#475569',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
                    borderWidth: 1,
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

    const theme = getChartThemeOptions();
    const isDark = document.body.classList.contains('dark-mode');

    peakHoursChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hourLabels,
            datasets: [{
                label: 'Transactions',
                data: hours,
                backgroundColor: isDark ? '#34d399' : '#8b5cf6',
                borderRadius: 4,
                hoverBackgroundColor: isDark ? '#10b981' : '#7c3aed'
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
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#1e293b',
                    bodyColor: isDark ? '#e2e8f0' : '#475569',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
                    borderWidth: 1
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: theme.textColor,
                        stepSize: 1
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: theme.textColor
                    }
                }
            }
        }
    });
}

// Global listener to redraw charts automatically when theme is toggled
window.addEventListener('themechange', () => {
    const dashboardTab = document.getElementById('dashboard-tab');
    if (dashboardTab && dashboardTab.classList.contains('active')) {
        if (typeof currentTimeRange !== 'undefined' && typeof loadDashboardWithRange === 'function') {
            loadDashboardWithRange(currentTimeRange, true);
        }
    }
});

let sparklineChartInstances = {};

function drawSparkline(canvasId, data, color) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    
    if (sparklineChartInstances[canvasId]) {
        sparklineChartInstances[canvasId].destroy();
    }
    
    // Create gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 35);
    gradient.addColorStop(0, color + '33'); // 20% opacity
    gradient.addColorStop(1, color + '00'); // 0% opacity
    
    sparklineChartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: new Array(data.length).fill(''),
            datasets: [{
                data: data,
                borderColor: color,
                backgroundColor: gradient,
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            layout: {
                padding: { top: 2, bottom: 2, left: 2, right: 2 }
            }
        }
    });
}

async function renderAllSparklines(transactions) {
    const validTxns = (transactions || []).filter(t => t.status !== 'voided');
    
    // Default time range boundaries (e.g. today or last 7 days if empty)
    let startRangeTime = new Date().getTime() - 24 * 60 * 60 * 1000;
    let endRangeTime = new Date().getTime();
    
    if (validTxns.length > 0) {
        const sortedTxns = [...validTxns].sort((a, b) => new Date(a.date) - new Date(b.date));
        startRangeTime = new Date(sortedTxns[0].date).getTime();
        endRangeTime = new Date(sortedTxns[sortedTxns.length - 1].date).getTime();
    }
    
    // Fetch expenses
    let rangeExpenses = [];
    try {
        if (typeof db !== 'undefined') {
            const allExpenses = await db.getAll('expenses');
            rangeExpenses = allExpenses.filter(e => {
                const eTime = new Date(e.date).getTime();
                return eTime >= startRangeTime && eTime <= endRangeTime;
            });
        }
    } catch (e) {
        console.error('Error loading expenses for sparklines:', e);
    }
    
    // Binning helper
    const numBins = 8;
    function binData(items, valueExtractor) {
        const bins = new Array(numBins).fill(0);
        const duration = endRangeTime - startRangeTime;
        if (duration <= 0) {
            bins[numBins - 1] = items.reduce((sum, item) => sum + valueExtractor(item), 0);
            return bins;
        }
        items.forEach(item => {
            const time = new Date(item.date || item.createdAt).getTime();
            let binIdx = Math.floor(((time - startRangeTime) / duration) * numBins);
            if (binIdx >= numBins) binIdx = numBins - 1;
            if (binIdx < 0) binIdx = 0;
            bins[binIdx] += valueExtractor(item);
        });
        return bins;
    }
    
    const salesBins = binData(validTxns, t => Number(t.total) || Number(t.amount) || 0);
    const expensesBins = binData(rangeExpenses, e => Number(e.amount) || 0);
    const netProfitBins = salesBins.map((s, idx) => s - expensesBins[idx]);
    
    // Render sparklines
    drawSparkline('salesSparkline', salesBins, '#ffffff'); // White line on green card background
    
    // Dynamic color for net profit (green if positive/zero, red if negative)
    const isNetProfitPositive = netProfitBins[netProfitBins.length - 1] >= 0;
    drawSparkline('netProfitSparkline', netProfitBins, isNetProfitPositive ? '#10b981' : '#ef4444');
    
    drawSparkline('expensesSparkline', expensesBins, '#f59e0b');
}

// Export for usage
if (typeof window !== 'undefined') {
    window.updateDashboardCharts = updateDashboardCharts;
    window.renderAllSparklines = renderAllSparklines;
    window.toggleSalesForecast = function () {
        const dates = lastLoadedTransactions.map(t => t.date.split('T')[0]);
        const uniqueDates = new Set(dates);
        const isSingleDay = uniqueDates.size <= 1;
        renderSalesTrendChart(lastLoadedTransactions, isSingleDay);
    };
}
