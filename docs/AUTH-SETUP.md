# FlashFX - social sign-in setup (Google / Microsoft / Apple)

Step-by-step to turn on Supabase Auth + the OAuth providers. The client UI is already built
(`src/auth/*`, see [`AUTH-PLAN.md`](./AUTH-PLAN.md)); this is the dashboard/provider config that
activates it. **You do this; secrets never go in the repo or a `VITE_` var - only into the Supabase
dashboard.** Replace `<PROJECT_REF>` with your Supabase project ref throughout.

## How it fits together (read once)

Two different redirect URLs, always confused:

1. **Provider callback = Supabase's URL.** Every provider sends the user back to Supabase, not to the
   app. Paste this exact string into each provider's "Authorized redirect URI":
   ```
   https://<PROJECT_REF>.supabase.co/auth/v1/callback
   ```
2. **App redirect = your origin.** After Supabase finishes it bounces back to the app
   (`redirectTo: window.location.origin`, already set in `auth/store.ts`). This origin must be
   allow-listed inside Supabase (step 1).

Flow: button -> Supabase -> provider login -> provider -> Supabase callback -> your app (signed in).

**Client ID / Client Secret** = credentials a provider issues when you register FlashFX. The Client ID
is a public app identifier; the Client Secret is a confidential password proving it's your app. Both go
into Supabase, which uses them to talk to the provider. Never `VITE_` a secret and never commit it.

---

## 1. Supabase (do first, once)

1. **Project Settings -> General**: note your **project ref** (`https://<ref>.supabase.co`).
2. **Project Settings -> API**: copy **Project URL** and the **anon public** key -> these are
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (step 5).
3. **Authentication -> URL Configuration**:
   - **Site URL** = your production URL (use `http://localhost:5173` while developing).
   - **Redirect URLs** (allow-list) - add every origin the app runs on, matching `window.location.origin`
     exactly (scheme + host + port):
     ```
     http://localhost:5173
     http://localhost:4173
     https://<your-production-domain>
     ```
4. Keep the callback handy: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.

---

## 2. Google (free, ~10 min)

1. **console.cloud.google.com** -> create/select a project.
2. **APIs & Services -> OAuth consent screen**: User type **External**; set app name + support email +
   developer contact; add scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
   Click **Publish app** (in "Testing" only whitelisted test users can sign in).
3. **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**:
   - Application type **Web application**.
   - **Authorized JavaScript origins**: your app origins (`http://localhost:5173`, prod domain).
   - **Authorized redirect URIs**: the Supabase callback `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
   - Create -> copy **Client ID** + **Client Secret**.
4. **Supabase -> Authentication -> Providers -> Google** -> Enabled -> paste Client ID + Secret -> Save.

Google's secret does not expire.

---

## 3. Microsoft (Azure Entra ID) (free, ~10 min)

Supabase names this provider **Azure**. The "client ID" is the **Application (client) ID**.

1. **portal.azure.com -> Microsoft Entra ID -> App registrations -> New registration**.
2. Name it; **Supported account types** = "Accounts in any organizational directory and personal
   Microsoft accounts" (lets consumer @outlook/@hotmail accounts sign in).
3. **Redirect URI**: platform **Web** -> `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
4. Register -> copy the **Application (client) ID** (note the Directory/tenant ID too).
5. **Certificates & secrets -> New client secret** -> set an expiry -> copy the **Value** now (shown once).
6. **API permissions**: ensure Microsoft Graph delegated `openid`, `email`, `profile` (usually default).
7. **Supabase -> Authentication -> Providers -> Azure** -> Enabled -> paste client ID + secret, and set
   **Azure Tenant URL** to `https://login.microsoftonline.com/common` (any Microsoft account) -> Save.

The Azure secret **expires** on the date you chose - renew it before then.

---

## 4. Apple (paid + high-maintenance)

Requires a paid **Apple Developer Program** membership ($99/yr), and the "client secret" is a **signed
JWT you must regenerate at least every 6 months**. Consider shipping Google + Microsoft first and hiding
Apple with `VITE_OAUTH_APPLE=false` until you want it.

At **developer.apple.com -> Certificates, Identifiers & Profiles**:

1. **Identifiers -> App IDs**: enable the **Sign in with Apple** capability. Note your **Team ID**.
2. **Identifiers -> Services IDs -> +**: create one (e.g. `studio.flashfx.web`) - this **is the Apple
   "Client ID"** for web. Edit -> enable **Sign in with Apple -> Configure**: set your **Domain**
   (Apple verifies it) and **Return URL** = `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
3. **Keys -> +**: enable **Sign in with Apple** -> register -> **download the `.p8`** (one-time) and note
   the **Key ID**.
4. **Generate the client secret (JWT):** sign it (ES256) from Team ID + Services ID + Key ID + the `.p8`
   (Supabase's Apple provider docs include a generator). Valid up to 180 days - set a reminder to renew.
5. **Supabase -> Authentication -> Providers -> Apple** -> Enabled -> **Client IDs** = the Services ID,
   **Secret Key** = the generated JWT -> Save.

---

## 5. Wire the app

Copy `.env.example` to `.env` and fill:
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```
Setting these flips `enabled = !!supabase` true, so the sign-in gate + account UI appear and the OAuth
buttons go live for whichever providers you enabled in Supabase.

Buttons show by default. Hide one you have not configured yet:
```
VITE_OAUTH_APPLE=false        # or VITE_OAUTH_GOOGLE / VITE_OAUTH_MICROSOFT
```
Recommended during setup: `VITE_OAUTH_GOOGLE=true`, `VITE_OAUTH_MICROSOFT=true`, `VITE_OAUTH_APPLE=false`.

---

## 6. Gotchas (the usual time-wasters)

- **"redirect URL not allowed"** (from Supabase): add the exact app origin to Supabase -> URL
  Configuration -> Redirect URLs (scheme + host + port must match `window.location.origin`).
- **"redirect_uri_mismatch"** (from the provider): the provider's redirect URI must be **Supabase's**
  `/auth/v1/callback`, not the app URL.
- **Google stuck in Testing**: only test users can sign in until you **Publish** the consent screen.
- **Secrets expiring**: Azure secret (your expiry) and Apple JWT (<= 6 months) both need renewal;
  Google's does not.
- **Never** commit secrets or put them in a `VITE_` var (Vite bundles those into the browser). Only the
  Project URL + anon key are safe as `VITE_` (public by design; RLS protects the data).

Recommended order: Supabase env on -> Google -> confirm end to end -> Microsoft -> decide on Apple.
