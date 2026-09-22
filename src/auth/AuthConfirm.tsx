import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { FlashFXLogo } from '../ui/components/FlashFXLogo';

// Branded email-confirmation landing. The custom "Confirm signup" email links here on OUR domain:
//   {{ .SiteURL }}/?auth_confirm=1&token_hash={{ .TokenHash }}&type=signup
// We verify the token client-side with verifyOtp (no supabase.co redirect the user ever sees),
// then show a real "Email confirmed" screen. App renders this whenever ?auth_confirm=1 is present.

type State = 'verifying' | 'success' | 'error';

export function AuthConfirm() {
  const [state, setState] = useState<State>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = (params.get('type') ?? 'signup') as EmailOtpType;
      if (!supabase) { setState('error'); setMessage('Accounts are not configured on this deployment.'); return; }
      if (!tokenHash) { setState('error'); setMessage('This confirmation link is missing its token.'); return; }
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) { setState('error'); setMessage(error.message); return; }
      setState('success');
    })();
  }, []);

  // Reload at a clean URL: the session (set by verifyOtp) persists in localStorage, so the app
  // boots signed-in straight into the dashboard.
  const goToApp = () => window.location.replace(window.location.origin);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0f16] px-4 text-slate-200">
      <div className="w-full max-w-[360px] text-center">
        <div className="mb-7 flex items-center justify-center">
          <FlashFXLogo size={30} />
        </div>

        <div className="rounded-xl border border-[#1c2433] bg-[#0d1219] p-7 shadow-2xl">
          {state === 'verifying' && (
            <>
              <Loader2 size={26} className="mx-auto animate-spin text-[#f7b500]" />
              <p className="mt-3 text-[13px] text-slate-400">Confirming your email…</p>
            </>
          )}
          {state === 'success' && (
            <>
              <CheckCircle2 size={30} className="mx-auto text-emerald-400" />
              <h1 className="mt-3 text-[16px] font-semibold text-slate-100">Email confirmed</h1>
              <p className="mt-1 text-[12px] text-slate-500">Your account is verified and you’re signed in.</p>
              <button onClick={goToApp} className="mt-5 w-full rounded-md bg-[#f7b500] py-2 text-[12px] font-semibold text-[#0a0f16] transition-colors hover:bg-[#ffc83d]">
                Continue to FlashFX
              </button>
            </>
          )}
          {state === 'error' && (
            <>
              <XCircle size={30} className="mx-auto text-danger" />
              <h1 className="mt-3 text-[16px] font-semibold text-slate-100">Couldn’t confirm your email</h1>
              <p className="mt-1 text-[12px] text-slate-500">{message || 'The link may have expired or already been used.'}</p>
              <button onClick={goToApp} className="mt-5 w-full rounded-md border border-[#1c2433] bg-[#141c28] py-2 text-[12px] font-medium text-slate-300 transition-colors hover:text-slate-100">
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
