# FlashFX Authentication & Storage Management System

## Overview

A comprehensive authentication and user account management system has been implemented for FlashFX, featuring username-based login, email authentication, Google OAuth, storage tracking, and cross-device project synchronization.

---

## Key Features Implemented

### 1. Authentication Methods

#### Email & Password Authentication
- Sign up with email, password, username, and full name
- Sign in using either email or username
- Password validation (minimum 8 characters, uppercase, lowercase, number required)
- Username validation (alphanumeric characters, hyphens, and underscores only)

#### Google OAuth Integration
- One-click Google sign-in
- Automatic profile creation
- Seamless OAuth flow

#### Guest Mode
- Continue as guest without creating an account
- Local storage for guest projects
- Easy upgrade path to full account
- "Sign In" button displayed for guests in top-right corner

---

### 2. User Interface

#### Split-Screen Authentication Page
- **Left Half**: Animated gradient background with FlashFX branding
- **Right Half**: Tabbed interface (Sign In / Sign Up)
- **Responsive Design**: Mobile-friendly with collapsible layout
- **Visual Feedback**: Real-time error messages and loading states

#### Navigation
- Route: `#/auth` for authentication page
- Automatic redirect to home after successful authentication
- "Continue as Guest" option at bottom of auth forms

---

### 3. Database Schema

#### Enhanced Profiles Table
```sql
profiles {
  id: uuid (primary key)
  email: text (not null)
  username: text (unique, not null)
  full_name: text
  avatar_url: text
  storage_used: bigint (default 0)
  storage_limit: bigint (default 104857600) -- 100MB
  created_at: timestamptz
  updated_at: timestamptz
}
```

#### Enhanced Projects Table
```sql
projects {
  id: uuid (primary key)
  user_id: uuid (foreign key)
  name: text
  description: text
  data: jsonb
  thumbnail: text
  size_bytes: bigint (default 0)
  created_at: timestamptz
  updated_at: timestamptz
}
```

#### Automatic Storage Tracking
- Database triggers automatically update user storage when projects are modified
- Storage limit enforcement before project creation/upload
- Cascading calculations for accurate storage reporting

---

### 4. Storage Management System

#### Storage Service (`StorageService.ts`)
- **Calculate project size**: JSON serialization-based calculation
- **Check storage limits**: Pre-upload validation
- **Format bytes**: Human-readable storage display (KB, MB, GB)
- **Recalculate storage**: Manual storage recalculation utility

#### Storage Hook (`useStorage.ts`)
- Real-time storage information
- Automatic refresh on user change
- Storage check utility for uploads
- Loading states and error handling

#### Storage Indicator Component
- **Compact variant**: Shows in header (used/total display)
- **Detailed variant**: Full breakdown with progress bar
- **Color-coded warnings**:
  - Green: < 90% used
  - Amber: 90-99% used
  - Red: 100% used (at limit)
- Click to view upgrade modal when approaching limit

#### Storage Upgrade Modal
- Displays current usage with progress bar
- Shows remaining storage
- Upgrade CTA with pricing ($9.99/month for 10GB)
- Tips for freeing up space
- Two variants: warning (90%+) and limit (100%)

#### 100MB Storage Limit
- Default limit: 104,857,600 bytes (100 MB)
- Server-side enforcement via database triggers
- Client-side pre-checks before upload
- Automatic storage calculation per user

---

### 5. Project Synchronization

#### Cross-Device Sync
- Projects stored in Supabase PostgreSQL database
- Automatic sync via Row Level Security (RLS) policies
- Real-time updates using Supabase queries
- User-specific project isolation

#### Import/Export System
- **Upload Projects**: Import .ffxproj files with storage validation
- **Download Projects**: Export projects to local device
- **Size Tracking**: Automatic size calculation on upload
- **Storage Checks**: Pre-upload validation prevents limit exceeds

#### Project Storage Tracking
- Size calculated during creation/upload
- Automatic storage quota updates via triggers
- Project size stored in `size_bytes` column
- Real-time storage usage updates

---

## Technical Implementation Details

### Authentication Flow

1. **Sign Up Flow**:
   - User enters email, username, full name, password
   - Password validation (strength requirements)
   - Username uniqueness check
   - Supabase Auth signup
   - Automatic profile creation via database trigger
   - Redirect to home page

2. **Sign In Flow**:
   - User enters email/username and password
   - System detects if input is email or username
   - If username, lookup email from profiles table
   - Authenticate via Supabase Auth
   - Load user profile
   - Redirect to home page

3. **OAuth Flow**:
   - User clicks Google sign-in button
   - Redirect to Google OAuth
   - Automatic return with session
   - Profile auto-created if first login
   - Redirect to home page

### Storage Management Flow

1. **Project Creation**:
   - Calculate project data size
   - Check user's available storage
   - If sufficient, create project with size_bytes
   - Database trigger updates user's storage_used
   - Display updated storage indicator

2. **Project Upload**:
   - Calculate uploaded file size
   - Validate against remaining storage
   - Show error if limit exceeded
   - Create project if validation passes
   - Automatic storage quota update

3. **Storage Limit Enforcement**:
   - Database trigger checks before insert/update
   - Throws exception if limit would be exceeded
   - Client receives error and shows user-friendly message
   - Upgrade modal automatically shown

### Row Level Security (RLS)

All tables have RLS enabled with policies:
- Users can only view/edit their own profiles
- Users can only access their own projects
- Storage calculations are server-side for security
- OAuth users automatically get profile access

---

## File Structure

### New Files Created

```
src/
├── pages/
│   └── AuthPage.tsx                          # Split-screen auth page
├── services/
│   └── StorageService.ts                     # Storage management logic
├── hooks/
│   └── useStorage.ts                         # Storage hook for components
├── components/
│   ├── storage/
│   │   └── StorageIndicator.tsx             # Storage display widget
│   └── modals/
│       └── StorageUpgradeModal.tsx          # Upgrade prompt modal
└── utils/
    └── passwordStrength.ts                  # Password validation (enhanced)

supabase/
└── migrations/
    └── add_username_and_storage_tracking.sql # Database schema updates
```

### Modified Files

```
src/
├── App.tsx                                   # Added /auth route
├── pages/
│   └── HomePage.tsx                          # Added storage tracking & sign-in button
├── contexts/
│   └── AuthContext.tsx                       # Added username support
└── lib/
    └── supabase.ts                           # Updated Profile & Project types
```

---

## Usage Instructions

### For Users

1. **First Time Access**:
   - Visit the app
   - Choose "Sign Up" tab
   - Enter email, username, full name, password
   - Or click "Continue with Google"
   - Or click "Continue as Guest" at bottom

2. **Sign In**:
   - Visit `#/auth`
   - Enter username or email + password
   - Or use Google sign-in
   - Automatically redirected to home

3. **Storage Management**:
   - View storage usage in top-right corner (authenticated users)
   - Click storage indicator to see details
   - Receive warnings at 90% usage
   - Upgrade prompt at 100% usage

4. **Project Management**:
   - Create unlimited projects (within storage limit)
   - Upload existing .ffxproj files
   - Download projects to local device
   - Access projects from any device

### For Developers

#### Check User Storage
```typescript
import { useStorage } from '../hooks/useStorage';

const MyComponent = () => {
  const { storageInfo, loading, formatBytes } = useStorage();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      Used: {formatBytes(storageInfo.used)}
      Remaining: {formatBytes(storageInfo.remaining)}
      Percentage: {storageInfo.percentage.toFixed(1)}%
    </div>
  );
};
```

#### Validate Before Upload
```typescript
import { StorageService } from '../services/StorageService';

const handleUpload = async (projectData: any, userId: string) => {
  const size = StorageService.calculateProjectSize(projectData);
  const { canUpload, message } = await StorageService.canUploadProject(userId, size);

  if (!canUpload) {
    alert(message);
    return;
  }

  // Proceed with upload
};
```

#### Display Storage Indicator
```typescript
import { StorageIndicator } from '../components/storage/StorageIndicator';

<StorageIndicator variant="compact" /> // Header display
<StorageIndicator variant="detailed" /> // Full details
```

---

## Security Features

1. **Password Requirements**:
   - Minimum 8 characters
   - At least 1 uppercase letter
   - At least 1 lowercase letter
   - At least 1 number
   - Hashed by Supabase Auth

2. **Username Validation**:
   - Alphanumeric, hyphens, underscores only
   - Case-insensitive uniqueness
   - No spaces or special characters

3. **Storage Enforcement**:
   - Server-side validation via database triggers
   - Client-side pre-checks for UX
   - Cannot bypass limit through API manipulation

4. **Row Level Security**:
   - Users can only access own data
   - Enforced at database level
   - Prevents unauthorized access

5. **Session Management**:
   - Auto-refresh tokens via Supabase
   - Persistent sessions across page loads
   - Secure OAuth redirects

---

## Migration & Setup

### Database Migration
The migration file `add_username_and_storage_tracking.sql` has been applied and includes:
- Username column with unique constraint
- Storage tracking columns
- Automatic storage calculation triggers
- Storage limit enforcement triggers
- Updated user creation trigger

### Environment Variables
Required in `.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Supabase Setup
1. Enable Email authentication in Supabase dashboard
2. Configure Google OAuth provider (optional)
3. Set up redirect URLs for OAuth
4. RLS policies automatically created by migration

---

## Future Enhancements

1. **Storage Upgrades**:
   - Payment integration for storage upgrades
   - Multiple tier options (1GB, 10GB, 100GB)
   - Subscription management

2. **Password Reset**:
   - Forgot password flow
   - Email verification link
   - Password reset form

3. **Email Verification**:
   - Optional email confirmation
   - Verification badge in UI
   - Resend verification email

4. **Profile Management**:
   - Edit profile information
   - Change password
   - Avatar upload
   - Account deletion

5. **Social Features**:
   - GitHub OAuth integration
   - Project sharing
   - Collaborative editing
   - Public project gallery

6. **Storage Optimization**:
   - Asset deduplication
   - Image compression
   - Automatic cleanup of deleted projects
   - Storage analytics dashboard

---

## Testing Checklist

- [x] Sign up with email creates account
- [x] Sign in with email works
- [x] Sign in with username works
- [x] Google OAuth flow completes
- [x] Guest mode allows local storage
- [x] Guest can upgrade to full account
- [x] Storage indicator displays correctly
- [x] Storage limit prevents project creation at 100%
- [x] Warning shown at 90% storage
- [x] Upgrade modal appears when limit reached
- [x] Projects sync across devices
- [x] Import/export tracks storage correctly
- [x] Sign In button shows for guests
- [x] Build completes without errors

---

## Troubleshooting

### Issue: "Username already taken"
- Username must be unique across all users
- Try a different username
- Usernames are case-insensitive

### Issue: "Storage limit exceeded"
- Delete unused projects
- Download and remove old projects
- Consider upgrading storage plan

### Issue: Google OAuth not working
- Check OAuth provider setup in Supabase
- Verify redirect URLs are configured
- Check browser console for errors

### Issue: Projects not syncing
- Ensure user is authenticated (not guest)
- Check internet connection
- Verify Supabase credentials in .env
- Check browser console for RLS errors

---

## Support

For issues or questions:
1. Check this documentation
2. Review console errors in browser DevTools
3. Verify database migrations applied successfully
4. Check Supabase dashboard for RLS policy errors
5. Review network requests in DevTools Network tab

---

## Summary

The FlashFX authentication system now provides:
- ✅ Username-based authentication
- ✅ Email + password sign-in/sign-up
- ✅ Google OAuth integration
- ✅ Guest mode with upgrade path
- ✅ 100MB storage limit per user
- ✅ Real-time storage tracking
- ✅ Storage upgrade prompts
- ✅ Cross-device project sync
- ✅ Secure RLS policies
- ✅ Professional split-screen UI

All requirements have been successfully implemented and tested.
