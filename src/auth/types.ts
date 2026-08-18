export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

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
