# Collectibles Firebase Structure

## Firebase Collection: `collectibles`

The collectibles feature is fully integrated with Firebase Firestore. Here's the complete structure:

### Collection Name
```
collectibles
```

### Document Structure

Each collectible document contains the following fields:

```javascript
{
  // Customer Information
  customerName: "John Doe",              // String - Customer's name
  
  // Items Array
  items: [                                // Array of selected products
    {
      productId: "abc123",               // String - Product ID reference
      name: "Product Name",              // String - Product name
      price: 100.00,                     // Number - Price per unit
      quantity: 2,                       // Number - Quantity ordered
      total: 200.00,                     // Number - Total for this item (price × quantity)
      maxStock: 50                       // Number - Available stock at time of order
    }
  ],
  
  // Financial Information
  totalAmount: 200.00,                   // Number - Total amount owed
  paidAmount: 0,                         // Number - Amount already paid (default 0)
  status: "pending",                     // String - "pending", "partial", or "paid"
  
  // Additional Information
  notes: "Optional notes here",          // String - Optional notes
  
  // Tracking Information
  cashier: "carmen",                     // String - Cashier username
  cashierName: "Carmen",                 // String - Cashier display name
  storeId: "store123",                   // String - Store ID for multi-store support
  
  // Timestamps
  createdAt: "2026-01-31T00:00:00.000Z", // ISO String - Creation timestamp
  updatedAt: "2026-01-31T00:00:00.000Z"  // ISO String - Last update timestamp
}
```

### Related Collections

When a collectible is saved, it also affects:

1. **`products` collection** - Stock is automatically deducted
2. **`stockMovements` collection** - A record is created for each item

#### Stock Movement Record
```javascript
{
  productId: "abc123",
  productName: "Product Name",
  type: "out",
  quantity: 2,
  reason: "Collectible - John Doe",
  date: "2026-01-31T00:00:00.000Z",
  user: "carmen",
  storeId: "store123"
}
```

### Firestore Security Rules

The collectibles collection has the following security rules:

```javascript
match /collectibles/{collectibleId} {
  allow read: if resource.data.storeId != null;
  allow create: if request.resource.data.storeId != null 
                && isValidStoreAccess(request.resource.data.storeId);
  allow update: if resource.data.storeId == request.resource.data.storeId;
  allow delete: if resource.data.storeId != null;
}
```

### How It Works

1. **Creating a Collectible:**
   - User selects products from dropdown
   - Enters customer name and optional notes
   - Clicks "Save Collectible"
   - Data is saved to Firebase `collectibles` collection
   - Stock is automatically deducted from products
   - Stock movements are recorded

2. **Loading Collectibles:**
   - Fetches all collectibles for the current store
   - Filters by `storeId`
   - Sorts by creation date (newest first)
   - Displays in the collectibles list

3. **Multi-Store Support:**
   - Each collectible is tied to a specific `storeId`
   - Cashiers only see collectibles for their store
   - Data isolation is maintained

### Status Values

- **`pending`** - No payment received yet
- **`partial`** - Some payment received (paidAmount > 0 but < totalAmount)
- **`paid`** - Fully paid (paidAmount >= totalAmount)

### Future Enhancements

Possible features to add:
- Payment recording functionality
- Collectible editing
- Collectible deletion
- Payment history tracking
- Customer contact information
- Due date tracking
- Reminder notifications
