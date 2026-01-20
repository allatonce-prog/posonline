# Multi-Store Setup Guide

## Overview
Your POS system now supports multiple stores with isolated data. Each store has its own products, transactions, and users, all sharing the same Firebase database but completely separated.

## How It Works

### Data Isolation
- Every document in Firebase has a `storeId` field
- Users are assigned to a specific store via their `storeId`
- All queries automatically filter by the logged-in user's `storeId`
- Stores cannot see or access each other's data

### Store Structure
```
Store 1 (storeId: "store_1234567890")
├── Products (filtered by storeId)
├── Transactions (filtered by storeId)
├── Users (filtered by storeId)
└── Stock Movements (filtered by storeId)

Store 2 (storeId: "store_9876543210")
├── Products (filtered by storeId)
├── Transactions (filtered by storeId)
├── Users (filtered by storeId)
└── Stock Movements (filtered by storeId)
```

## Registering a New Store

### Option 1: Using the Registration Page
1. Open `register-store.html` in your browser
2. Fill in the form:
   - **Store Name**: The name of the client's store
   - **Admin Username**: Username for the store admin
   - **Admin Full Name**: Full name of the admin
   - **Admin Password**: Secure password (min 6 characters)
3. Click "Register Store"
4. The system will create:
   - A new store record with unique `storeId`
   - An admin user account linked to that store
5. Share the credentials with your client

### Option 2: Using Browser Console
```javascript
// Open browser console and run:
await db.init();
const result = await db.registerNewStore(
    'ABC Grocery Store',  // Store name
    'abc_admin',          // Admin username
    'securepass123',      // Admin password
    'John Doe'            // Admin name
);
console.log('Store registered:', result);
```

## Default Store

The system comes with a default store:
- **Store ID**: `default_store`
- **Admin Username**: `admin`
- **Admin Password**: `admin123`
- **Cashier Username**: `cashier`
- **Cashier Password**: `cashier123`

## How Users Login

1. User enters username and password
2. System finds the user and retrieves their `storeId`
3. All subsequent database queries filter by that `storeId`
4. User only sees data from their store

## Firebase Security Rules

Update your Firestore rules to enforce data isolation:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user belongs to the store
    function belongsToStore(storeId) {
      let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return userData.storeId == storeId;
    }
    
    // Products - only access own store's products
    match /products/{productId} {
      allow read, write: if request.auth != null 
        && resource.data.storeId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId;
    }
    
    // Transactions - only access own store's transactions
    match /transactions/{transactionId} {
      allow read, write: if request.auth != null 
        && resource.data.storeId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId;
    }
    
    // Stock Movements - only access own store's movements
    match /stockMovements/{movementId} {
      allow read, write: if request.auth != null 
        && resource.data.storeId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId;
    }
    
    // Users - only access users from same store
    match /users/{userId} {
      allow read: if request.auth != null 
        && resource.data.storeId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId;
      allow write: if request.auth != null 
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Stores - read only for authenticated users
    match /stores/{storeId} {
      allow read: if request.auth != null;
      allow write: if false; // Only through backend
    }
  }
}
```

## Managing Multiple Stores

### View All Stores (Super Admin Only)
To see all registered stores, you can query the `stores` collection directly in Firebase Console.

### Adding Users to a Store
Admins can add users (cashiers) to their store through the Users tab in the admin panel. All new users automatically get the admin's `storeId`.

### Data Migration
If you need to migrate existing data to a specific store:
1. Go to Firebase Console
2. Select your Firestore database
3. For each collection (products, transactions, etc.):
   - Add a `storeId` field with value `default_store`
4. Existing data will now belong to the default store

## Testing Multi-Store Setup

1. **Register Store 1**:
   ```javascript
   await db.registerNewStore('Store A', 'storea_admin', 'pass123', 'Admin A');
   ```

2. **Register Store 2**:
   ```javascript
   await db.registerNewStore('Store B', 'storeb_admin', 'pass456', 'Admin B');
   ```

3. **Login as Store A Admin**:
   - Add products, make sales
   - Note the data

4. **Logout and Login as Store B Admin**:
   - You should see NO products or transactions from Store A
   - Add different products
   - Make different sales

5. **Verify Isolation**:
   - Check Firebase Console
   - Each document should have a different `storeId`
   - Queries should filter correctly

## Troubleshooting

### Issue: Can't see any data after login
**Solution**: Make sure the user has a `storeId` field. Check Firebase Console → users collection.

### Issue: Seeing data from other stores
**Solution**: 
1. Check that `storeId` is being added to all documents
2. Verify Firestore security rules are deployed
3. Clear browser cache and re-login

### Issue: Registration fails
**Solution**:
1. Check Firebase Console for errors
2. Ensure Firestore rules allow writes to `stores` and `users` collections
3. Check browser console for detailed error messages

## Best Practices

1. **Unique Usernames**: Ensure usernames are unique across ALL stores
2. **Secure Passwords**: Use strong passwords for admin accounts
3. **Regular Backups**: Export Firestore data regularly
4. **Monitor Usage**: Check Firebase usage to avoid quota limits
5. **Document Store Info**: Keep a record of store IDs and admin credentials

## Support

For issues or questions:
1. Check browser console for errors
2. Check Firebase Console → Firestore for data
3. Verify security rules are correctly deployed
4. Test with default store first before creating new stores
