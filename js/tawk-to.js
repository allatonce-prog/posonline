/**
 * Tawk.to Live Chat Integration
 * 
 * INSTRUCTIONS:
 * 1. Go to https://dashboard.tawk.to/
 * 2. Sign up or Log in.
 * 3. Add a new property (your app name).
 * 4. Go to Administration > Chat Widget.
 * 5. Copy the 'Direct Chat Link' or look at the 'Widget Code'.
 *    You need two values from the URL:
 *    https://tawk.to/chat/[PROPERTY_ID]/[WIDGET_ID]
 * 
 *    Example: https://tawk.to/chat/65b12345/1h7j8k9l
 *    Property ID: 65b12345
 *    Widget ID: 1h7j8k9l
 */

const TAWK_PROPERTY_ID = '6972524c194607197bcce7e1';
const TAWK_WIDGET_ID = '1jfj92ulp';

var Tawk_API = Tawk_API || {};
// Offset the widget so it doesn't block the "Online" indicator
Tawk_API.customStyle = {
    visibility: {
        desktop: { position: 'br', xOffset: '20px', yOffset: '60px' },
        mobile: { position: 'br', xOffset: '10px', yOffset: '70px' }
    }
};
var Tawk_LoadStart = new Date();

(function () {
    if (TAWK_PROPERTY_ID === 'YOUR_PROPERTY_ID') {
        console.warn('Tawk.to: Please set your PROPERTY_ID in js/tawk-to.js');
        return;
    }

    var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
    s1.charset = 'UTF-8';
    s1.setAttribute('crossorigin', '*');
    s0.parentNode.insertBefore(s1, s0);
})();

// Function to identify the user in Tawk.to
// Call this after login or when user data is available
// Function to identify the user in Tawk.to
window.identifyTawkUser = function (user) {
    if (!user) return;

    const attributes = {
        name: user.name || user.username
    };

    if (user.storeName) {
        attributes.name = `${attributes.name} (${user.storeName})`;
    }

    if (user.email) {
        attributes.email = user.email;
    }

    // Use callback to ensure API is ready
    if (window.Tawk_API && window.Tawk_API.setAttributes) {
        window.Tawk_API.setAttributes(attributes, function (error) {
            if (error) console.warn('Tawk setAttributes failed:', error);
        });
    } else {
        // If API not loaded yet, push to onRefresh or onLoad queue (simplified here to just setting visitor as fallback)
        // But for "Bad Request" 400, cleanest is to just set visitor property cleanly before load if possible, 
        // or rely on setAttributes if after.
        window.Tawk_API = window.Tawk_API || {};
        window.Tawk_API.visitor = attributes;
    }
};
