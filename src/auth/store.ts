import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { captureError, trackEvent } from '../lib/telemetry';
import type { AuthStatus, AuthUser, AuthResult } from './types';

// Phase 1 groundwork: a null-guarded auth layer over Supabase Auth. The app is
// local-first — it runs identically with no accounts. When Supabase is configured
// (env vars present) `enabled` flips true and the sign-in surfaces appear; until
// then everything is a clean no-op. No RLS/user_id migration is wired yet.

const DISABLED_MSG = "Accounts aren't enabled yet.";

function toAuthUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  return {
    id: u.id,
    email: u.email ?? null,
    displayName: str(meta.full_name) ?? str(meta.name) ?? null,
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture) ?? null,
  };
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** True when accounts are available (Supabase configured). */
  enabled: boolean;
  /** Hydrate the current session + subscribe to auth changes. Idempotent. */
  init: () => void;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signInWithOAuth: (provider: 'google') => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

let initialized = false;

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  enabled: !!supabase,

  init: () => {
    if (initialized) return;
    initialized = true;
    const sb = supabase;
    if (!sb) {
      set({ status: 'signed-out', enabled: false, user: null });
      return;
    }
    sb.auth
      .getSession()
      .then(({ data }) => {
        set({ status: data.session ? 'signed-in' : 'signed-out', user: toAuthUser(data.session?.user) });
      })
      .catch((e) => {
        captureError(e, { kind: 'auth-init' });
        set({ status: 'signed-out' });
      });
    sb.auth.onAuthStateChange((_event, session) => {
      set({ status: session ? 'signed-in' : 'signed-out', user: toAuthUser(session?.user) });
    });
  },

  signInWithEmail: async (email, password) => {
    if (!supabase) return { ok: false, error: DISABLED_MSG };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    trackEvent('auth_sign_in', { method: 'email' });
    return { ok: true };
  },

  signUpWithEmail: async (email, password) => {
    if (!supabase) return { ok: false, error: DISABLED_MSG };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { ok: false, error: error.message };
    trackEvent('auth_sign_up', { method: 'email' });
    return { ok: true };
  },

  signInWithOAuth: async (provider) => {
    if (!supabase) return { ok: false, error: DISABLED_MSG };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) return { ok: false, error: error.message };
    // On success the browser redirects to the provider; nothing more to do here.
    return { ok: true };
  },

  sendPasswordReset: async (email) => {
    if (!supabase) return { ok: false, error: DISABLED_MSG };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut().catch((e) => captureError(e, { kind: 'auth-signout' }));
    trackEvent('auth_sign_out');
  },
}));
