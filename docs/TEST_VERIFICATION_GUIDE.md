# Authentication System - Test Verification Guide

## Overview

This guide provides step-by-step instructions for verifying that the authentication system works correctly after the fixes have been applied.

---

## Pre-Testing Checklist

Before running tests, verify:

- ✅ Database migrations have been applied
- ✅ Environment variables are configured in `.env`
- ✅ Project builds successfully (`npm run build`)
- ✅ Dev server is running (`npm run dev`)
- ✅ Supabase connection is active

---

## Test Suite 1: User Registration (Signup)

### Test 1.1: Successful Signup

**Steps:**
1. Open the application
2. Click "Sign Up" or similar button
3. Fill in the form:
   - Full Name: "Test User"
   - Email: "testuser@example.com"
   - Password: "SecurePass123"
   - Confirm Password: "SecurePass123"
4. Click "Create Account"

**Expected Results:**
- ✅ Success message appears
- ✅ User is automatically logged in
- ✅ Redirected to home/dashboard
- ✅ User's name appears in the header
- ✅ Profile created in database

**Database Verification:**
```sql
SELECT * FROM auth.users WHERE email = 'testuser@example.com';
SELECT * FROM profiles WHERE email = 'testuser@example.com';
```

---

### Test 1.2: Duplicate Email Prevention

**Steps:**
1. Try to sign up again with the same email
2. Use email: "testuser@example.com"
3. Fill in different name and password
4. Click "Create Account"

**Expected Results:**
- ✅ Error message: "User already registered" or similar
- ✅ Account is NOT created
- ✅ User remains logged out
- ✅ Form shows validation error

---

### Test 1.3: Password Validation

**Test Case A: Password Too Short**
1. Enter password: "12345" (5 characters)
2. Click "Create Account"

**Expected Results:**
- ✅ Error: "Password must be at least 6 characters"
- ✅ Form does not submit

**Test Case B: Passwords Don't Match**
1. Enter password: "SecurePass123"
2. Enter confirm: "SecurePass456"
3. Click "Create Account"

**Expected Results:**
- ✅ Error: "Passwords do not match"
- ✅ Form does not submit

---

### Test 1.4: Email Validation

**Steps:**
1. Enter invalid email: "notanemail"
2. Try to submit

**Expected Results:**
- ✅ HTML5 validation prevents submission
- ✅ Browser shows "Please enter a valid email"

---

### Test 1.5: Required Fields

**Steps:**
1. Leave Full Name empty
2. Try to submit

**Expected Results:**
- ✅ Error: "Please enter your full name"
- ✅ Form does not submit

---

## Test Suite 2: User Login

### Test 2.1: Successful Login

**Pre-requisite:** Account created in Test 1.1

**Steps:**
1. If logged in, log out first
2. Click "Log In"
3. Enter email: "testuser@example.com"
4. Enter password: "SecurePass123"
5. Click "Log In"

**Expected Results:**
- ✅ Success - user is logged in
- ✅ Redirected to home/dashboard
- ✅ User name appears in header
- ✅ Can access protected features
- ✅ No "Guest" badge shown

---

### Test 2.2: Invalid Email

**Steps:**
1. Click "Log In"
2. Enter email: "nonexistent@example.com"
3. Enter password: "anypassword"
4. Click "Log In"

**Expected Results:**
- ✅ Error: "Invalid login credentials" or similar
- ✅ User remains logged out
- ✅ No redirect occurs

---

### Test 2.3: Wrong Password

**Steps:**
1. Click "Log In"
2. Enter email: "testuser@example.com"
3. Enter password: "WrongPassword123"
4. Click "Log In"

**Expected Results:**
- ✅ Error: "Invalid login credentials" or similar
- ✅ User remains logged out
- ✅ Password is not revealed in error

---

### Test 2.4: Empty Fields

**Test Case A: Empty Email**
1. Leave email empty
2. Enter password
3. Try to submit

**Expected Results:**
- ✅ Error: "Please enter your email"
- ✅ Form does not submit

**Test Case B: Empty Password**
1. Enter email
2. Leave password empty
3. Try to submit

**Expected Results:**
- ✅ Error: "Please enter your password"
- ✅ Form does not submit

---

## Test Suite 3: Session Persistence

### Test 3.1: Page Refresh While Logged In

**Pre-requisite:** User is logged in

**Steps:**
1. Log in successfully
2. Refresh the page (F5 or Cmd+R)
3. Wait for page to reload

**Expected Results:**
- ✅ User remains logged in
- ✅ User name still appears
- ✅ Profile data is loaded
- ✅ Can access protected features
- ✅ No login prompt shown

---

### Test 3.2: Browser Tab Close/Reopen

**Steps:**
1. Log in successfully
2. Close the browser tab
3. Reopen the application URL
4. Wait for page to load

**Expected Results:**
- ✅ User is still logged in
- ✅ Session restored automatically
- ✅ All user data available

---

### Test 3.3: Multiple Tabs

**Steps:**
1. Log in on Tab 1
2. Open application in Tab 2
3. Verify state on Tab 2
4. Log out on Tab 1
5. Check Tab 2

**Expected Results:**
- ✅ Tab 2 shows logged-in state initially
- ✅ After logout on Tab 1, Tab 2 updates (may require refresh)

---

## Test Suite 4: Logout Functionality

### Test 4.1: Successful Logout

**Pre-requisite:** User is logged in

**Steps:**
1. Click "Sign Out" or "Log Out"
2. Wait for logout to complete

**Expected Results:**
- ✅ User is logged out
- ✅ Redirected to login page
- ✅ User name removed from header
- ✅ Cannot access protected features
- ✅ Session cleared from storage

---

### Test 4.2: Access After Logout

**Steps:**
1. Log out as in Test 4.1
2. Try to access protected route (e.g., /editor)
3. Or refresh the page

**Expected Results:**
- ✅ User cannot access protected content
- ✅ Redirected to login page
- ✅ Session is not restored

---

## Test Suite 5: Guest Mode

### Test 5.1: Continue as Guest

**Steps:**
1. Start application (logged out)
2. Click "Continue as Guest"
3. Verify guest functionality

**Expected Results:**
- ✅ Can use application in guest mode
- ✅ "Guest" badge shown
- ✅ Projects stored in localStorage
- ✅ No database access required

---

### Test 5.2: Guest to Authenticated Transition

**Steps:**
1. Use app as guest
2. Create a project as guest
3. Log in with real account

**Expected Results:**
- ✅ Guest mode exits
- ✅ User logged in successfully
- ✅ Guest projects remain in localStorage
- ✅ Authenticated projects loaded from database

---

## Test Suite 6: Database Integrity

### Test 6.1: Profile Creation Trigger

**Steps:**
1. Sign up a new user
2. Check database immediately

**Database Verification:**
```sql
-- Should find both records
SELECT * FROM auth.users WHERE email = 'newuser@example.com';
SELECT * FROM profiles WHERE email = 'newuser@example.com';

-- Verify IDs match
SELECT u.id as user_id, p.id as profile_id
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'newuser@example.com';
```

**Expected Results:**
- ✅ User exists in auth.users
- ✅ Profile exists in profiles
- ✅ IDs match (profile.id = auth.users.id)
- ✅ Email matches in both tables
- ✅ full_name populated correctly

---

### Test 6.2: Email Uniqueness Constraint

**Database Test:**
```sql
-- This should FAIL with unique constraint violation
INSERT INTO profiles (id, email, full_name)
VALUES (
  gen_random_uuid(),
  'testuser@example.com',  -- Duplicate email
  'Another User'
);
```

**Expected Results:**
- ✅ Error: duplicate key value violates unique constraint "profiles_email_key"
- ✅ Insert is rejected
- ✅ Database remains consistent

---

### Test 6.3: RLS Policy Verification

**Database Test:**
```sql
-- Set role to authenticated user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims.sub = '<user_id>';

-- Should only see own profile
SELECT * FROM profiles;

-- Should only see own projects
SELECT * FROM projects;
```

**Expected Results:**
- ✅ Can only query own data
- ✅ Cannot see other users' profiles
- ✅ Cannot see other users' projects

---

## Test Suite 7: Error Handling

### Test 7.1: Network Error Handling

**Steps:**
1. Disconnect from internet
2. Try to log in
3. Observe error handling

**Expected Results:**
- ✅ User-friendly error message
- ✅ No application crash
- ✅ Loading state cleared
- ✅ Can retry after reconnecting

---

### Test 7.2: Invalid Token Handling

**Steps:**
1. Manually corrupt auth token in localStorage
2. Refresh page

**Expected Results:**
- ✅ Invalid token detected
- ✅ User logged out automatically
- ✅ Redirected to login
- ✅ No infinite loop

---

## Test Suite 8: Security Verification

### Test 8.1: Password Not Visible

**Steps:**
1. Open browser DevTools
2. Go to Network tab
3. Log in
4. Inspect network requests

**Expected Results:**
- ✅ Password sent over HTTPS
- ✅ Password not logged to console
- ✅ Password not visible in network tab
- ✅ Token encrypted in storage

---

### Test 8.2: XSS Prevention

**Steps:**
1. Try to sign up with name: `<script>alert('XSS')</script>`
2. After signup, view profile

**Expected Results:**
- ✅ Script tags are escaped
- ✅ No JavaScript execution
- ✅ Name displayed as text

---

### Test 8.3: SQL Injection Prevention

**Steps:**
1. Try to log in with email: `admin' OR '1'='1`
2. Try password: `' OR '1'='1' --`

**Expected Results:**
- ✅ Login fails with invalid credentials
- ✅ No database error exposed
- ✅ No unauthorized access

---

## Manual Testing Checklist

Use this checklist for comprehensive manual testing:

### Signup Flow
- [ ] Can create new account with valid data
- [ ] Duplicate email is rejected
- [ ] Short password is rejected
- [ ] Mismatched passwords are rejected
- [ ] Empty fields are validated
- [ ] Profile is automatically created
- [ ] User is logged in after signup

### Login Flow
- [ ] Can log in with correct credentials
- [ ] Invalid email shows error
- [ ] Wrong password shows error
- [ ] Empty fields are validated
- [ ] User is redirected after login
- [ ] Profile data is loaded

### Session Management
- [ ] Session persists after refresh
- [ ] Session persists after tab close
- [ ] Token refresh works automatically
- [ ] Multiple tabs stay in sync

### Logout Flow
- [ ] Can log out successfully
- [ ] All auth state is cleared
- [ ] Cannot access protected content
- [ ] Redirect to login page works

### Guest Mode
- [ ] Can use app as guest
- [ ] Guest projects work
- [ ] Can upgrade to authenticated
- [ ] Guest data preserved

### Database
- [ ] Profiles created automatically
- [ ] Email uniqueness enforced
- [ ] RLS policies work correctly
- [ ] Cascading deletes work

### Security
- [ ] Passwords are hashed
- [ ] Tokens are secure
- [ ] XSS is prevented
- [ ] SQL injection is prevented

---

## Automated Testing Recommendations

For production deployments, implement automated tests:

```typescript
// Example test structure
describe('Authentication', () => {
  describe('Signup', () => {
    it('should create new user with valid credentials', async () => {
      // Test implementation
    });

    it('should reject duplicate email', async () => {
      // Test implementation
    });
  });

  describe('Login', () => {
    it('should authenticate valid user', async () => {
      // Test implementation
    });

    it('should reject invalid credentials', async () => {
      // Test implementation
    });
  });
});
```

---

## Performance Benchmarks

Expected performance metrics:

- Signup: < 2 seconds
- Login: < 1 second
- Profile load: < 500ms
- Session check: < 200ms
- Page load (authenticated): < 1 second

---

## Troubleshooting Common Issues

### Issue: User can't log in after signup
**Solution:** Check that email confirmation is disabled in Supabase settings

### Issue: Profile not created
**Solution:** Verify trigger `on_auth_user_created` exists and is enabled

### Issue: Session not persisting
**Solution:** Check browser storage permissions and Supabase client config

### Issue: RLS blocking access
**Solution:** Verify policies use `auth.uid()` correctly

---

## Test Environment Setup

### Required Environment Variables
```env
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### Test User Accounts
Create test accounts for different scenarios:
- Valid user: test@example.com
- Admin user: admin@example.com
- Edge cases: user+tag@example.com

---

## Success Criteria

The authentication system passes all tests when:

- ✅ All 8 test suites pass
- ✅ No console errors during flows
- ✅ No data leakage between users
- ✅ Performance metrics met
- ✅ Security tests pass
- ✅ Database integrity maintained

**Status:** Ready for testing
**Estimated Testing Time:** 30-45 minutes for complete verification
