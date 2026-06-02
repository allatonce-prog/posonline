// EmailJS Integration for End of Day Reports

// -------------------------------------------------------------
// CONFIGURATION: Replace these with your actual EmailJS details
// -------------------------------------------------------------
const EMAILJS_PUBLIC_KEY = "kDx6o0Gsh2ZtIqQvO";
const EMAILJS_SERVICE_ID = "service_im9hp9n";
const EMAILJS_TEMPLATE_ID = "template_wg1t9nh";

// Initialize EmailJS and Scheduled Reports
(function () {
    if (typeof emailjs !== 'undefined') {
        emailjs.init({
            publicKey: EMAILJS_PUBLIC_KEY,
        });

        // Initialize scheduler if user is logged in
        if (typeof auth !== 'undefined' && auth.isAuthenticated()) {
            scheduleDailyReport();
        }
    } else {
        console.warn("EmailJS library not loaded");
    }
})();

// Schedule the report for 6 AM
function scheduleDailyReport() {
    const now = new Date();
    let nextRun = new Date();
    nextRun.setHours(6, 0, 0, 0);

    // If 6 AM has passed today, schedule for tomorrow
    if (now > nextRun) {
        nextRun.setDate(nextRun.getDate() + 1);
    }

    const timeUntilNextRun = nextRun - now;
    console.log(`Report scheduled for: ${nextRun.toLocaleTimeString()} (in ${Math.round(timeUntilNextRun / 1000 / 60)} mins)`);

    setTimeout(async () => {
        await sendEndOfDayReport(true); // true = automated
        scheduleDailyReport(); // Reschedule for next day
    }, timeUntilNextRun);
}

// Function to gather data and send the report
async function sendEndOfDayReport(isAutomated = false, forceYesterday = false) {
    // Only proceed if authenticated
    if (!auth.isAuthenticated()) return;

    // Determine destination email
    let recipientEmail = await resolveRecipientEmail(!isAutomated);

    // If no email configured, skip (automated) or stop (manual)
    if (!recipientEmail) {
        if (isAutomated) {
            console.warn("Skipping automated report: No Admin Email configured.");
        }
    }

    const isManualYesterday = !isAutomated && forceYesterday;

    if (!isAutomated && !isManualYesterday && !confirm(`Send End of Day Report to ${recipientEmail}?`)) return;
    if (isManualYesterday && !confirm(`Send YESTERDAY'S report to ${recipientEmail}?`)) return;

    if (!isAutomated) showLoading("Sending report...");

    let templateParams; // Declare outside try/catch for scope access

    try {
        const currentUser = auth.getCurrentUser();
        const storeId = currentUser.storeId;

        // 1. Gather Data & Correct Date Range
        const targetDate = new Date();
        if (isAutomated || forceYesterday) {
            targetDate.setDate(targetDate.getDate() - 1); // Yesterday
        }
        targetDate.setHours(0, 0, 0, 0);

        // Fetch all data
        const transactions = await db.getAll('transactions');
        const expenses = await db.getAll('expenses');
        const products = await db.getAll('products');

        // Filter Data by Store ID AND Date
        const targetTrans = transactions.filter(t => {
            if (t.storeId !== storeId) return false;
            const d = new Date(t.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === targetDate.getTime();
        });

        const targetExpenses = expenses.filter(e => {
            if (e.storeId && e.storeId !== storeId) return false;
            const d = new Date(e.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === targetDate.getTime();
        });

        const storeProducts = products;

        // Calculate Stats
        const totalSales = targetTrans.reduce((sum, t) => sum + (Number(t.total) || Number(t.amount) || 0), 0);
        const totalExp = targetExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const netProfit = totalSales - totalExp;
        const transactionCount = targetTrans.length;
        const expensesCount = targetExpenses.length;

        // Low Stock Items (alert)
        let lowStockThreshold = 10;
        try {
            if (typeof getSettingsSync === 'function') {
                lowStockThreshold = getSettingsSync().lowStockThreshold || 10;
            }
        } catch (e) { }

        const lowStockItems = storeProducts
            .filter(p => p.stock <= lowStockThreshold)
            .map(p => `${p.name} (${p.stock})`)
            .join(', ');

        const dateStr = targetDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const reportTitle = (isAutomated || forceYesterday) ? `Yesterday's Summary (${dateStr})` : `End of Day Report (${dateStr})`;

        // 2. Prepare Template Params
        // We send multiple variations of the email variable to ensure one matches the template config
        templateParams = {
            to_name: currentUser.name || "Admin",
            to_email: recipientEmail,           // Standard
            recipient_email: recipientEmail,    // Common alternative
            user_email: recipientEmail,         // Common alternative
            email: recipientEmail,              // Common alternative
            reply_to: recipientEmail,           // For reply-to field

            report_date: dateStr,
            store_name: currentUser.storeName || "My Store",
            total_sales: formatCurrency(totalSales),
            total_expenses: formatCurrency(totalExp),
            net_profit: formatCurrency(netProfit),
            transaction_count: transactionCount,
            expenses_count: expensesCount,
            low_stock_alert: lowStockItems || "None",
            report_title: reportTitle
        };

        // 3. Send Email
        const response = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);

        console.log('SUCCESS!', response.status, response.text);
        if (!isAutomated) showToast("Report sent successfully!", "success");

    } catch (error) {
        console.error('FAILED...', error);

        // Specific handling for empty recipient error
        if (!isAutomated && error.text && error.text.includes("recipients address is empty")) {
            const retryEmail = prompt("The system could not detect a valid email address. Please enter the email address to send the report to:");
            if (retryEmail && retryEmail.trim() !== "") {
                // Retry sending with new email
                templateParams.to_email = retryEmail.trim();
                try {
                    const retryResponse = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
                    console.log('RETRY SUCCESS!', retryResponse.status, retryResponse.text);
                    showToast("Report sent successfully!", "success");
                    return;
                } catch (retryError) {
                    showToast("Failed again: " + (retryError.text || retryError.message), "error");
                }
            }
        } else if (!isAutomated) {
            showToast("Failed to send email: " + (error.text || error.message), "error");
        }
    } finally {
        if (!isAutomated) hideLoading();
    }
}

// Helper if not already globally available
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(amount);
}

// Helper to resolve the best possible email address
async function resolveRecipientEmail(isManual) {
    let email = "";

    // 1. Try DOM input (most immediate user intent)
    const emailInput = document.getElementById('adminEmail');
    if (emailInput && emailInput.value.trim() !== "") {
        console.log("Using email from DOM:", emailInput.value);
        return emailInput.value.trim();
    }

    // 2. Try Global Async Settings (Firebase)
    try {
        if (typeof window.getSettings === 'function') {
            const settings = await window.getSettings();
            if (settings && settings.adminEmail && settings.adminEmail.trim() !== "") {
                console.log("Using email from DB:", settings.adminEmail);
                return settings.adminEmail.trim();
            }
        }
    } catch (e) { console.warn("Async settings fetch failed:", e); }

    // 3. Try Sync Settings (LocalStorage)
    try {
        if (typeof getSettingsSync === 'function') {
            const settings = getSettingsSync();
            if (settings && settings.adminEmail && settings.adminEmail.trim() !== "") {
                console.log("Using email from LocalStorage:", settings.adminEmail);
                return settings.adminEmail.trim();
            }
        }
    } catch (e) { console.warn("Sync settings fetch failed:", e); }

    // 4. Prompt if Manual
    if (isManual) {
        const manualEmail = prompt("No Admin Email configured. Please enter the recipient email:", "admin@example.com");
        if (manualEmail && manualEmail.trim() !== "") {
            return manualEmail.trim();
        }
    }

    return "";
}

// Manual trigger for yesterday's report
function sendManualYesterdayReport() {
    sendEndOfDayReport(false, true); // Not automated (show UI), Force Yesterday
}

