import { useState } from 'react';
import type { FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { Modal } from '../ui/primitives/Modal';
import { Button } from '../ui/primitives/Button';
import { Input } from '../ui/primitives/Input';
import { useAuthStore } from './store';

type Mode = 'signin' | 'signup' | 'reset';

// Google sign-in is hidden until a Google Cloud OAuth client is configured (the prior Google
// account was abandoned). Email + password is the live method. Flip this on once OAuth is set up in
// the Supabase dashboard — the wiring (store.signInWithOAuth) is already in place.
const GOOGLE_AUTH_ENABLED = false;

export function AuthModal({ onClose }: { onClose: () => void }) {
  const enabled = useAuthStore((s) => s.enabled);
  const signIn = useAuthStore((s) => s.signInWithEmail);
  const signUp = useAuthStore((s) => s.signUpWithEmail);
  const oauth = useAuthStore((s) => s.signInWithOAuth);
  const reset = useAuthStore((s) => s.sendPasswordReset);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const title = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Sign in';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = mode === 'signin' ? await signIn(email, password)
      : mode === 'signup' ? await signUp(email, password)
      : await reset(email);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return; }
    if (mode === 'signup') setNotice('Check your email to confirm your account.');
    else if (mode === 'reset') setNotice('Password reset link sent — check your email.');
    else onClose();
  };

  return (
    <Modal onClose={onClose} size="sm" icon={<LogIn size={16} />} title={title}>
      {!enabled ? (
        <p className="text-body leading-relaxed text-secondary">
          Accounts aren&apos;t enabled yet. FlashFX works fully offline — your projects are saved
          locally on this device. Cloud sign-in is coming soon.
        </p>
      ) : (
        <div className="space-y-4">
          {GOOGLE_AUTH_ENABLED && mode !== 'reset' && (
            <>
              <Button variant="secondary" size="comfortable" block onClick={() => void oauth('google')}>
                Continue with Google
              </Button>
              <div className="flex items-center gap-2 text-caption text-tertiary">
                <span className="h-px flex-1 bg-hairline" />
                or
                <span className="h-px flex-1 bg-hairline" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-2.5">
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
            {error && <p className="text-caption text-danger">{error}</p>}
            {notice && <p className="text-caption text-success">{notice}</p>}
            <Button variant="primary" size="comfortable" block type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
            </Button>
          </form>

          <div className="text-center text-caption text-tertiary">
            {mode === 'signin' && (
              <>
                <button type="button" className="text-secondary hover:text-primary" onClick={() => { setMode('signup'); setError(null); }}>
                  Create an account
                </button>
                <span className="px-1.5">·</span>
                <button type="button" className="text-secondary hover:text-primary" onClick={() => { setMode('reset'); setError(null); }}>
                  Forgot password?
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button type="button" className="text-secondary hover:text-primary" onClick={() => { setMode('signin'); setError(null); }}>
                Already have an account? Sign in
              </button>
            )}
            {mode === 'reset' && (
              <button type="button" className="text-secondary hover:text-primary" onClick={() => { setMode('signin'); setError(null); }}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
