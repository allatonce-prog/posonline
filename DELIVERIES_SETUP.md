# 🚚 Deliveries Feature - Setup Instructions

## ⚠️ IMPORTANT: Database Update Required

The new Deliveries feature requires a database schema update. Follow these steps:

### **Option 1: Clear Cache (Recommended)**

1. **Open** `clear-cache.html` in your browser
2. **Click** "Clear Cache & Reload"
3. **Wait** for automatic redirect to admin panel
4. **Login** again (your data will be preserved)

### **Option 2: Manual Browser Cache Clear**

If Option 1 doesn't work:

**Chrome/Edge:**
1. Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
2. Select "All time"
3. Check "Cached images and files" and "Cookies and other site data"
4. Click "Clear data"
5. Reload the page

**Firefox:**
1. Press `Ctrl + Shift + Delete`
2. Select "Everything"
3. Check "Cookies" and "Cache"
4. Click "Clear Now"

**Safari (iOS):**
1. Go to Settings → Safari
2. Tap "Clear History and Website Data"
3. Confirm
4. Reopen the app

---

## 🔥 Firebase Rules Update

**IMPORTANT:** Deploy the updated Firestore rules:

```bash
firebase deploy --only firestore:rules
```

Or manually update in Firebase Console:
1. Go to Firebase Console → Firestore Database → Rules
2. Copy the content from `firestore.rules`
3. Click "Publish"

---

## ✅ Verification

After clearing cache and deploying rules:

1. **Login** to admin panel
2. **Click** "🚚 Deliveries" in sidebar
3. **Click** "Add Delivery"
4. **Enter** an amount and save
5. **Verify** it appears in the table

If you see errors, repeat the cache clearing steps.

---

## 📊 What's New

- **New Tab:** Deliveries tracking in admin panel
- **Monthly View:** Automatically shows current month
- **Statistics:** Total, count, and average per day
- **History:** View past months' delivery expenses
- **Simple Entry:** Just amount and date/time

---

## 🆘 Troubleshooting

**Error: "One of the specified object stores was not found"**
- Solution: Clear cache using `clear-cache.html`

**Error: "Missing or insufficient permissions"**
- Solution: Deploy Firestore rules with `firebase deploy --only firestore:rules`

**Data not showing:**
- Make sure you're logged in as admin
- Check browser console for errors
- Try clearing cache again

---

## 📝 Notes

- All existing data (products, sales, etc.) will be preserved
- Only the database schema is being updated
- You may need to login again after clearing cache
- The deliveries collection is now available in both IndexedDB and Firestore
