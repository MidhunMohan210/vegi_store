# Opening Balance Edit Dialog - API Integration Summary

## 📋 Overview

Successfully integrated real API data into the OpeningBalanceEditDialog component, replacing dummy data with TanStack Query-powered recalculation impact summary.

## ✅ What Was Implemented

### 1. **Backend Service Layer**

**File:** `/frontend/src/api/services/openingBalance.service.js`

#### New Method Added:

```javascript
getRecalculationImpact: async(entityType, entityId, companyId, branchId);
```

**Endpoint:** `GET /opening-balance/{entityType}/{entityId}/recalculation-impact`

**Query Parameters:**

- `companyId` - Company identifier
- `branchId` - Branch identifier

**Expected Response:**

```json
{
  "maxYears": 10,
  "totalTransactions": 2081,
  "estimatedTimeSeconds": 12,
  "years": [
    { "financialYear": "2025", "transactions": 834 },
    { "financialYear": "2026", "transactions": 1247 },
    { "financialYear": "2027", "transactions": 500 }
  ]
}
```

---

### 2. **Query Builder Layer**

**File:** `/frontend/src/hooks/queries/openingBalance.queries.js`

#### New Query Added:

```javascript
recalculationImpact: (entityType, entityId, companyId, branchId);
```

**Features:**

- ✅ Query key includes all parameters for proper caching
- ✅ Enabled only when required params are present
- ✅ 60-second stale time for performance
- ✅ Retry logic (2 retries on failure)
- ✅ No refetch on window focus

**Query Key Structure:**

```javascript
[
  "openingBalance",
  "recalculationImpact",
  entityType,
  entityId,
  companyId,
  branchId,
];
```

---

### 3. **UI Component Updates**

**File:** `/frontend/src/components/modals/OpeningBalanceEditDialog.jsx`

#### New Props Added:

```javascript
{
  entityType: "party",  // Type of entity (party, item, etc.)
  entityId,             // ID of the entity being edited
  companyId,            // Company context
  branchId,             // Branch context
}
```

#### Features Implemented:

##### 🔄 **Loading State**

- Shows spinner with "Loading impact data..." message
- Centered in the impact analysis section
- Amber color scheme matching the warning card

##### ❌ **Error State**

- Displays error message from API
- Shows "Retry" button with RefreshCw icon
- Allows manual refetch on failure
- User-friendly error handling

##### ✅ **Success State**

- Displays up to **3 latest financial years**
- Shows transaction count per year (formatted with locale)
- **Overflow indicator**: "+X more years affected" when > 3 years
- Total transactions count (formatted)
- Estimated recalculation time in seconds

#### UI Layout:

```
┌─────────────────────────────────────────┐
│ ⚠️  Recalculation Required              │
│                                         │
│ 📈 Impact Analysis                      │
│ ┌─────────────────────────────────────┐ │
│ │ [Loading/Error/Success State]       │ │
│ │                                     │ │
│ │ FY 2025          FY 2026           │ │
│ │ 834 trans.       1,247 trans.      │ │
│ │                                     │ │
│ │ +1 more year affected               │ │
│ │ ─────────────────────────────────── │ │
│ │ 📊 Total: 2,081 transactions        │ │
│ │ ⏱️ Estimated time: 12 seconds       │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

### 4. **Parent Component Integration**

**File:** `/frontend/src/pages/Master/AccountMaster/AccountMasterForm.jsx`

#### Props Passed to Dialog:

```javascript
<OpeningBalanceEditDialog
  open={showEditBalanceDialog}
  onOpenChange={setShowEditBalanceDialog}
  currentBalance={watch("openingBalance") || 0}
  currentBalanceType={watch("openingBalanceType") || "dr"}
  accountName={accountName || "Account"}
  entityType="party"           // ← NEW
  entityId={editingId}         // ← NEW
  companyId={companyId}        // ← NEW
  branchId={branchId}          // ← NEW
  onUpdated={(data) => {...}}
/>
```

---

## 🎯 Key Features

### Data Display Logic:

1. **Latest 3 Years Only**: Uses `.slice(0, 3)` to show most recent years
2. **Overflow Handling**: Shows "+X more years affected" when data contains > 3 years
3. **Number Formatting**: Uses `.toLocaleString()` for readable transaction counts
4. **Conditional Rendering**: Shows loading/error/success states appropriately

### Query Behavior:

- **Enabled Condition**: `open && !!entityId && !!companyId`
  - Only fetches when dialog is open
  - Only fetches when required IDs are present
  - Prevents unnecessary API calls
- **Automatic Refetch**: When dialog reopens with different entity
- **Cache Management**: 60-second stale time prevents excessive requests

### Error Handling:

- Network errors caught and displayed
- User can retry failed requests
- Error messages from backend displayed
- Graceful fallback to error UI

---

## 📊 Data Flow

```
User clicks Edit Icon
       ↓
Dialog Opens (open = true)
       ↓
useQuery Enabled
       ↓
API Call: GET /opening-balance/party/{entityId}/recalculation-impact
       ↓
┌──────────────────────────────────────┐
│ Loading State → Show Spinner         │
├──────────────────────────────────────┤
│ Error State → Show Error + Retry     │
├──────────────────────────────────────┤
│ Success State → Display Impact Data  │
│  - Latest 3 years                    │
│  - Overflow indicator                │
│  - Total transactions                │
│  - Estimated time                    │
└──────────────────────────────────────┘
```

---

## 🧪 Testing Scenarios

### Scenario 1: Successful Load

1. Open dialog with valid `editingId`, `companyId`, `branchId`
2. See loading spinner briefly
3. Impact data displays with years, transactions, totals

### Scenario 2: Error Handling

1. Simulate API failure (backend down, network error)
2. Error message displays
3. Click "Retry" button
4. Query refetches

### Scenario 3: Overflow Display

1. Backend returns 5+ years of data
2. Only first 3 years shown in grid
3. "+2 more years affected" message appears

### Scenario 4: No Data

1. Backend returns empty `years` array
2. Component handles gracefully (no crash)
3. Shows 0 transactions, 0 seconds

### Scenario 5: Dialog Closed

1. Close dialog
2. Query disabled (no API calls)
3. Reopen dialog
4. Query re-enabled and refetches if stale

---

## 🔧 Technical Details

### Dependencies:

- `@tanstack/react-query` - Data fetching and caching
- `lucide-react` - Icons (RefreshCw for retry)
- Existing `apiClient` - HTTP requests

### Performance Optimizations:

- **Conditional Fetching**: Only when dialog is open
- **Stale Time**: 60 seconds prevents excessive requests
- **Retry Logic**: 2 retries for transient failures
- **No Window Focus Refetch**: Prevents unnecessary re-fetching

### Type Safety Considerations:

- Optional chaining (`?.`) for safe property access
- Fallback values (`|| 0`, `|| "Unknown error"`)
- Array checks before `.slice()` and `.map()`

---

## 📝 Backend Requirements

The backend endpoint must return this structure:

```typescript
interface RecalculationImpact {
  maxYears: number; // Maximum years to recalculate
  totalTransactions: number; // Total affected transactions
  estimatedTimeSeconds: number; // Estimated processing time
  years: Array<{
    financialYear: string; // e.g., "2025", "2026"
    transactions: number; // Transaction count for this year
  }>;
}
```

**Endpoint:** `GET /opening-balance/:entityType/:entityId/recalculation-impact`

**Query Params:** `?companyId=xxx&branchId=yyy`

---

## 🚀 Next Steps (Optional Enhancements)

### 1. **Sort Years by Latest**

Currently assumes backend returns sorted data. Could add:

```javascript
.sort((a, b) => b.financialYear - a.financialYear)
.slice(0, 3)
```

### 2. **Progress Bar**

Show visual progress bar based on `estimatedTimeSeconds`

### 3. **Real-time Updates**

WebSocket integration for live recalculation progress

### 4. **Year Selection**

Allow user to expand and see all affected years

### 5. **Impact Breakdown**

Show breakdown by transaction type (sales, purchases, etc.)

---

## ✅ Checklist

- [x] Service method added to `openingBalance.service.js`
- [x] Query builder added to `openingBalance.queries.js`
- [x] Dialog component updated with API integration
- [x] Loading state implemented
- [x] Error state with retry implemented
- [x] Success state with data display
- [x] Latest 3 years display logic
- [x] Overflow indicator for > 3 years
- [x] Parent component props updated
- [x] Number formatting for readability
- [x] Conditional query enabling
- [x] Error handling and fallbacks

---

## 🎨 Visual States

### Loading:

```
📈 Impact Analysis
┌─────────────────────────┐
│   🔄 Loading impact     │
│      data...            │
└─────────────────────────┘
```

### Error:

```
📈 Impact Analysis
┌─────────────────────────┐
│ ❌ Failed to load       │
│    impact data: [msg]   │
│                         │
│ 🔄 Retry                │
└─────────────────────────┘
```

### Success (3 years):

```
📈 Impact Analysis
┌─────────────────────────┐
│ FY 2025    FY 2026      │
│ 834 trans  1,247 trans  │
│                         │
│ 📊 Total: 2,081 trans   │
│ ⏱️ Est: 12 seconds      │
└─────────────────────────┘
```

### Success (5+ years):

```
📈 Impact Analysis
┌─────────────────────────┐
│ FY 2025    FY 2026      │
│ 834 trans  1,247 trans  │
│                         │
│ +3 more years affected  │
│ ─────────────────────── │
│ 📊 Total: 5,234 trans   │
│ ⏱️ Est: 25 seconds      │
└─────────────────────────┘
```

---

**Status**: ✅ Complete - Ready for backend integration
**Date**: 2026-02-11
**Version**: 1.0
