import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../ui/primitives/Button';
import { Input } from '../ui/primitives/Input';
import { useAuthStore } from './store';

// Full-screen account gate. Shown by App when accounts are ENABLED (Supabase configured) and the
// visitor is not signed in — so creating/opening projects requires an account. When accounts are
// NOT enabled (no Supabase env), App skips this entirely and the app stays local-first, so the
// editor still runs with zero backend. On a successful sign-in the auth store flips to 'signed-in'
// and this component unmounts. Email + password only (Google is hidden until an OAuth client exists).

type Mode = 'signin' | 'signup' | 'reset';

export function AuthGate({ loading }: { loading?: boolean }) {
  const signIn = useAuthStore((s) => s.signInWithEmail);
  const signUp = useAuthStore((s) => s.signUpWithEmail);
  const reset = useAuthStore((s) => s.sendPasswordReset);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const swap = (m: Mode) => { setMode(m); setError(null); setNotice(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const res = mode === 'signin' ? await signIn(email, password)
      : mode === 'signup' ? await signUp(email, password)
      : await reset(email);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return; }
    if (mode === 'signup') setNotice('Account created. Check your email to confirm it, then sign in.');
    else if (mode === 'reset') setNotice('Password reset link sent — check your email.');
    // A successful sign-in flips the store to 'signed-in' and unmounts the gate.
  };

  const heading = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back';
  const sub = mode === 'signup'
    ? 'An account is required to create and edit projects.'
    : mode === 'reset' ? 'We’ll email you a reset link.'
    : 'Sign in to your FlashFX account.';

  return (
    <div className="h-screen w-screen bg-[#0a0f16] text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-[360px]">
        {/* Brand */}
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#f7b500] to-[#e09000]">
            <span className="text-[14px] font-bold leading-none text-[#0a0f16]">F</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">FlashFX</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-[1.5px] border-[#f7b500]/30 border-t-[#f7b500]" />
          </div>
        ) : (
          <div className="rounded-xl border border-[#1c2433] bg-[#0d1219] p-6 shadow-2xl">
            <h1 className="text-[16px] font-semibold text-slate-100">{heading}</h1>
            <p className="mt-1 text-[12px] text-slate-500">{sub}</p>

            <form onSubmit={submit} className="mt-5 space-y-2.5">
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {mode !== 'reset' && (
                <Input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              )}
              {error && <p className="text-[12px] text-danger">{error}</p>}
              {notice && <p className="text-[12px] text-success">{notice}</p>}
              <Button variant="primary" size="comfortable" block type="submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-4 text-center text-[12px] text-slate-500">
              {mode === 'signin' && (
                <>
                  <button type="button" className="text-slate-300 transition-colors hover:text-white" onClick={() => swap('signup')}>Create an account</button>
                  <span className="px-1.5">·</span>
                  <button type="button" className="text-slate-300 transition-colors hover:text-white" onClick={() => swap('reset')}>Forgot password?</button>
                </>
              )}
              {mode === 'signup' && (
                <button type="button" className="text-slate-300 transition-colors hover:text-white" onClick={() => swap('signin')}>Already have an account? Sign in</button>
              )}
              {mode === 'reset' && (
                <button type="button" className="text-slate-300 transition-colors hover:text-white" onClick={() => swap('signin')}>Back to sign in</button>
              )}
            </div>
          </div>
        )}

        <p className="mt-5 text-center text-[11px] text-slate-600">FlashFX runs in your browser. Your projects are saved to this device.</p>
      </div>
    </div>
  );
}
