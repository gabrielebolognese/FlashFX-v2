import { useState } from 'react';
import { useAuthStore } from './store';
import { enabledOAuthProviders } from './oauthProviders';
import type { OAuthProvider } from './types';

// Social sign-in buttons (Google / Microsoft / Apple). Renders one button per enabled provider
// (oauthProviders.ts) plus an "or" divider before the email form. On click it starts the Supabase
// OAuth redirect; a provider that is not yet configured in the Supabase dashboard returns an error,
// surfaced via onError. Renders nothing when no providers are enabled.

export function OAuthButtons({ onError }: { onError?: (msg: string) => void }) {
  const oauth = useAuthStore((s) => s.signInWithOAuth);
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const providers = enabledOAuthProviders();
  if (providers.length === 0) return null;

  const go = async (id: OAuthProvider) => {
    setBusy(id);
    onError?.('');
    const res = await oauth(id);
    // On success the browser redirects to the provider, so keep the button in its "busy" state.
    if (!res.ok) { setBusy(null); onError?.(res.error ?? 'Could not start sign-in.'); }
  };

  return (
    <div className="space-y-2.5">
      <div className="space-y-2">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void go(p.id)}
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-hairline bg-surface-1 py-2 text-[12px] font-medium text-slate-200 transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <ProviderIcon id={p.id} />
            {busy === p.id ? 'Redirecting…' : `Continue with ${p.label}`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-caption text-tertiary">
        <span className="h-px flex-1 bg-hairline" />
        or
        <span className="h-px flex-1 bg-hairline" />
      </div>
    </div>
  );
}

function ProviderIcon({ id }: { id: OAuthProvider }) {
  if (id === 'google') {
    return (
      <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.6 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.6 5.6C41.3 35.7 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z" />
      </svg>
    );
  }
  if (id === 'azure') {
    return (
      <svg width="14" height="14" viewBox="0 0 23 23" aria-hidden="true">
        <path fill="#f35325" d="M1 1h10v10H1z" />
        <path fill="#81bc06" d="M12 1h10v10H12z" />
        <path fill="#05a6f0" d="M1 12h10v10H1z" />
        <path fill="#ffba08" d="M12 12h10v10H12z" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-slate-100" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.2 3.03-.83.9-1.9 1.42-2.98 1.34-.13-1.1.44-2.27 1.16-3.04.8-.84 2.13-1.44 3.02-1.33zM20.5 17.2c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.53-4.12 3.54-1.54.02-1.94-1-4.03-.99-2.09.01-2.53 1.01-4.07.99-1.73-.02-3.05-1.78-4.04-3.35C.36 17.2-.21 12.9 1.4 10.06c.86-1.5 2.4-2.45 4.03-2.47 1.53-.03 2.97 1.03 4.03 1.03 1.05 0 2.9-1.27 4.88-1.09.83.04 3.15.34 4.64 2.53-.12.08-2.77 1.62-2.74 4.83.03 3.84 3.36 5.12 3.4 5.14z" />
    </svg>
  );
}
