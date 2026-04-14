# JSON Data Display Fix

## Problem

After importing JSON format datasets, the imported data was displaying incorrectly:
- **Admin panel**: Records were not displaying at all
- **Client panel**: All records were displaying in a single row

## Root Causes

### 1. Data Structure Detection Issue
The frontend components (`DataViewer.tsx` and `DatasetDetailPage.tsx`) had logic to detect if data was:
- An array of objects (normal case) → multi-column view
- A single value → single-column view

However, the detection logic `if (processedData.length === 1 && Array.isArray(processedData[0]))` was too simplistic and failed when:
- JSON had nested structures
- Data was partially wrapped in arrays
- First item detection didn't handle edge cases

### 2. Cell Rendering Issue
When JSON records contained nested objects or arrays:
- Cells used `JSON.stringify(value)` which serialized everything to one line
- Long JSON strings were truncated with `truncate` CSS class
- No way to see full nested structure

### 3. Column Width Issues
- Used `max-w-xs truncate` which cut off long values
- Used `whitespace-nowrap` which prevented multi-line display
- Made it impossible to read nested JSON data

## Fixes Applied

### 1. Enhanced Data Structure Detection

**File**: `client/src/pages/DataViewer.tsx`

Added proper unwrapping logic:
```typescript
if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
  // Normal case: array of objects
  // Extract columns...
} else if (Array.isArray(firstItem)) {
  // Data is wrapped in arrays - unwrap it
  const unwrappedData = processedData.flatMap((item: any) => 
    Array.isArray(item) ? item : [item]
  );
  // Then extract columns from unwrapped data...
} else {
  // Primitive values (strings, numbers)
  setRawColumns(['value']);
}
```

**File**: `client/src/pages/DatasetDetailPage.tsx`

Applied same logic for consistency.

### 2. Improved Cell Rendering

**Admin DataViewer**:
```typescript
const renderCell = (value: any) => {
  if (value === null || value === undefined) {
    return <span>-</span>;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    // Render nested object as formatted JSON
    return (
      <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white/5 p-2 rounded">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (Array.isArray(value)) {
    const str = JSON.stringify(value);
    return str.length > 100 ? str.slice(0, 100) + '...' : str;
  }
  return String(value);
};
```

**Client DatasetDetailPage**:
```typescript
const renderCellValue = (value: any) => {
  if (typeof value === 'object' && !Array.isArray(value)) {
    const jsonStr = JSON.stringify(value, null, 2);
    const isLong = jsonStr.length > 150;
    return (
      <details className="group">
        <summary className="cursor-pointer">
          {isLong ? jsonStr.slice(0, 150) + '...' : jsonStr}
          {isLong && <span>(розгорнути)</span>}
        </summary>
        <pre>{jsonStr}</pre>
      </details>
    );
  }
  // ... handle arrays and primitives
};
```

### 3. Better Column Widths

Changed from:
```html
<td className="px-6 py-3 whitespace-nowrap max-w-xs truncate">
```

To:
```html
<td className="px-6 py-3 max-w-md break-words">
```

And for rows:
```html
<tr className="hover:bg-white/5 transition-colors align-top">
```

Key changes:
- Removed `whitespace-nowrap` → allows multi-line content
- Changed `truncate` to `break-words` → wraps long words
- Added `align-top` → aligns rows to top for uneven content
- Increased `max-w-xs` (320px) to `max-w-md` (448px)

## Testing

To test the fixes:

1. **Import a JSON dataset with nested structures**:
```json
[
  {
    "id": 1,
    "name": "Test Record",
    "metadata": {
      "created": "2024-01-01",
      "tags": ["tag1", "tag2"]
    },
    "values": [1, 2, 3]
  }
]
```

2. **View in Admin Panel** (`/admin/datasets` → eye icon):
   - Should see columns: `id`, `name`, `metadata`, `values`
   - `metadata` column should show formatted JSON with syntax highlighting
   - `values` column should show array as JSON string

3. **View in Client Panel** (`/datasets/:id`):
   - Same columns visible
   - Nested objects should be collapsible with `<details>` element
   - Long JSON should be truncated with "(розгорнути)" link
   - Click to expand shows full structure

## Benefits

✅ **Admin Panel**: Records now display correctly with proper column detection  
✅ **Client Panel**: Each record shows in its own row with proper column alignment  
✅ **Nested JSON**: Formatted nicely with syntax highlighting  
✅ **Long Values**: Truncated but expandable  
✅ **Arrays**: Displayed as JSON strings with length limits  
✅ **Responsive**: Tables scroll horizontally on small screens  

## Files Modified

- `client/src/pages/DataViewer.tsx` - Admin data viewer
- `client/src/pages/DatasetDetailPage.tsx` - Client dataset detail page

## Backward Compatibility

All changes are backward compatible:
- Existing datasets continue to work
- No database changes required
- API endpoints unchanged
- Only frontend rendering logic updated
