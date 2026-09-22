export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

/** Social sign-in providers (Google only for now; email/password is the other method). */
export type OAuthProvider = 'google';

/** Lean, UI-facing user shape mapped from a Supabase auth user. */
export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}
