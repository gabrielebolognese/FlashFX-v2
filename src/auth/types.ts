export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

/** Social sign-in providers. Supabase provider ids: Microsoft is 'azure'. */
export type OAuthProvider = 'google' | 'azure' | 'apple';

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
