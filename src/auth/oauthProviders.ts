import type { OAuthProvider } from './types';

// Social sign-in provider config (pure, no imports beyond the type - unit-testable). Each provider is
// SHOWN unless its env flag is explicitly "false", so the founder sees all three during setup and can
// hide any one until it's configured. A visible button still only WORKS once that provider is enabled
// in the Supabase Auth dashboard (Google Cloud / Azure AD / Apple Services ID); until then Supabase
// returns an error which the sign-in UI surfaces. Microsoft's Supabase provider id is "azure".

export interface OAuthProviderMeta {
  id: OAuthProvider;
  label: string;
  /** Env flag that hides this provider when set to the string "false". */
  envKey: string;
}

export const OAUTH_PROVIDERS: OAuthProviderMeta[] = [
  { id: 'google', label: 'Google', envKey: 'VITE_OAUTH_GOOGLE' },
  { id: 'azure', label: 'Microsoft', envKey: 'VITE_OAUTH_MICROSOFT' },
  { id: 'apple', label: 'Apple', envKey: 'VITE_OAUTH_APPLE' },
];

/** The providers to show, given an env-like map. A provider is enabled unless its flag is "false". */
export function resolveEnabledProviders(env: Record<string, string | undefined>): OAuthProviderMeta[] {
  return OAUTH_PROVIDERS.filter((p) => env[p.envKey] !== 'false');
}

/** Browser convenience: the enabled providers from Vite env. */
export function enabledOAuthProviders(): OAuthProviderMeta[] {
  return resolveEnabledProviders(import.meta.env as unknown as Record<string, string | undefined>);
}
