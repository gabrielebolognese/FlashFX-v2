import { useState } from 'react';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { useAuthStore } from './store';
import { AuthModal } from './AuthModal';

/**
 * Sidebar affordance for accounts. Hidden entirely until Supabase is configured
 * (`enabled`), so there's no dead "sign in" button in the local-first build. When
 * enabled: a Sign-in button when signed out, and the account row + sign-out when in.
 */
export function AccountMenu() {
  const enabled = useAuthStore((s) => s.enabled);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [showAuth, setShowAuth] = useState(false);

  if (!enabled) return null;

  if (status === 'signed-in' && user) {
    return (
      <div className="flex items-center gap-2 rounded-md px-2 py-[6px]">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-5 w-5 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#1a2233]">
            <UserRound size={12} className="text-slate-400" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300" title={user.email ?? undefined}>
          {user.displayName ?? user.email ?? 'Account'}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          title="Sign out"
          className="flex-shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-[#141c28] hover:text-slate-200"
        >
          <LogOut size={13} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAuth(true)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-[6px] text-[12px] font-medium text-slate-400 transition-colors hover:bg-[#141c28] hover:text-slate-200"
      >
        <LogIn size={13} className="text-slate-500" />
        <span className="flex-1 text-left">Sign in</span>
      </button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
