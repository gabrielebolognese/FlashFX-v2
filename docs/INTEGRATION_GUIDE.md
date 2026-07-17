# Quick Integration Guide - Auto-Backup System

## What Was Implemented

A complete automatic canvas preview backup system that:
- Captures canvas screenshots every 60 seconds
- Stores previews in Supabase (authenticated) or browser storage (guests)
- Automatically displays thumbnails in project list
- Runs invisibly in the background
- Handles cleanup and memory management automatically

## Files Added

```
/src/services/PreviewAutoBackup.ts          # Core service
/src/hooks/usePreviewAutoBackup.ts          # React hook
/supabase/migrations/...storage.sql         # Storage bucket setup
```

## Files Modified

```
/src/components/UIDesignTool.tsx            # Added auto-backup hook
/src/App.tsx                                # Pass projectId from URL
```

## How It Works

### 1. Service Initialization

When a user opens a project in the editor:
```typescript
// UIDesignTool.tsx (already integrated)
usePreviewAutoBackup({
  projectId: 'abc-123',      // From URL parameter
  isGuest: false,            // From auth context
  enabled: true,             // Always on
  intervalMs: 60000,         // 60 seconds
  quality: 0.8,              // 80% quality
  maxWidth: 1280,            // Max dimensions
  maxHeight: 720
});
```

### 2. Automatic Capture

Every 60 seconds, the service:
1. Finds canvas element (`#canvas-artboard`)
2. Captures screenshot using `html-to-image`
3. Compresses to 80% quality, max 1280×720px
4. Stores based on user type

### 3. Storage Flow

#### Authenticated Users
```
Capture → Upload to Supabase Storage → Generate Public URL → Update projects.thumbnail
```

#### Guest Users
```
Capture → Check size → Store in LocalStorage (<4MB) OR IndexedDB (≥4MB) → Update guest JSON
```

### 4. Display

The HomePage already displays thumbnails from `project.thumbnail`:
```typescript
{project.thumbnail ? (
  <img src={project.thumbnail} alt="Preview" />
) : (
  <p>No preview available</p>
)}
```

## Database Setup

### Run Migration

```bash
# Migration already created, will run automatically
# Creates 'project-previews' storage bucket with RLS policies
```

### Verify in Supabase Dashboard

1. Go to Storage → Buckets
2. Verify `project-previews` bucket exists
3. Check it's marked as "Public"
4. Verify policies are in place

## Testing

### Test Authenticated User

1. Sign in to FlashFX
2. Create/open a project
3. Go to editor
4. Wait 60 seconds (or trigger manual capture)
5. Check Supabase Storage → `project-previews/{user_id}/{project_id}/`
6. Go back to home page
7. Verify thumbnail appears in project list

### Test Guest User

1. Use guest mode
2. Create/open a project
3. Go to editor
4. Wait 60 seconds
5. Open browser DevTools → Application → Local Storage
6. Check for `flashfx_preview_{projectId}` key
7. Go back to home page
8. Verify thumbnail appears

### Manual Trigger (Optional)

```typescript
const { captureNow } = usePreviewAutoBackup({ ... });

// In save handler
await captureNow(); // Capture immediately
```

## Troubleshooting

### Canvas Not Found
- Verify `canvas-artboard` id exists on canvas element
- Check element is visible (not display:none)

### Supabase Upload Fails
- Check `.env` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Verify storage bucket created
- Check RLS policies allow user uploads

### Guest Storage Issues
- Check browser storage quota
- Verify localStorage is enabled
- Try clearing old previews

### Performance Issues
- Increase `intervalMs` to 120000 (2 minutes)
- Decrease `quality` to 0.6
- Reduce `maxWidth`/`maxHeight`

## Configuration Options

### Change Capture Frequency

```typescript
usePreviewAutoBackup({
  projectId,
  isGuest,
  intervalMs: 30000  // Capture every 30 seconds
});
```

### Adjust Quality/Size

```typescript
usePreviewAutoBackup({
  projectId,
  isGuest,
  quality: 0.9,      // Higher quality
  maxWidth: 1920,    // Full HD
  maxHeight: 1080
});
```

### Disable During Preview Mode

```typescript
usePreviewAutoBackup({
  projectId,
  isGuest,
  enabled: !isPreviewMode  // Conditional
});
```

## Cleanup

### Guest User Logout

```typescript
import { cleanupAllGuestPreviews } from '../services/PreviewAutoBackup';

const handleLogout = async () => {
  await cleanupAllGuestPreviews();
  // Continue logout...
};
```

## Storage Structure

### Supabase
```
project-previews/
└── {user_id}/
    └── {project_id}/
        └── preview_{project_id}_{timestamp}.png
```

### LocalStorage
```
Key: flashfx_preview_{projectId}
Value: { dataUrl: "data:image/png;base64,...", metadata: {...} }
```

### IndexedDB
```
Database: FlashFXPreviews
Store: previews
Key: projectId
Value: { blob: Blob, metadata: {...} }
```

## API Quick Reference

### Hook Usage
```typescript
const { captureNow, getStats } = usePreviewAutoBackup(config);
```

### Service Direct (Advanced)
```typescript
import { PreviewAutoBackup } from '../services/PreviewAutoBackup';

const service = new PreviewAutoBackup(config);
service.start();
// ...
service.stop();
```

### Utility Functions
```typescript
import {
  loadGuestPreview,
  cleanupAllGuestPreviews
} from '../services/PreviewAutoBackup';

const preview = await loadGuestPreview(projectId);
await cleanupAllGuestPreviews();
```

## Next Steps

1. ✅ Run `npm run build` to verify compilation
2. ✅ Deploy migration to Supabase
3. ✅ Test with authenticated user
4. ✅ Test with guest user
5. ✅ Monitor console for any errors
6. ✅ Check storage usage in Supabase dashboard

## Support

Check console logs with prefix `[PreviewAutoBackup]` for debugging.

All errors are caught and logged without breaking the app.

The system is designed to be completely transparent to users - no UI, no notifications, just working previews.
