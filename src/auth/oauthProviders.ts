import type { OAuthProvider } from './types';

// Social sign-in provider config (pure, no imports beyond the type - unit-testable). Google is shown
// unless VITE_OAUTH_GOOGLE is "false". A visible button only WORKS once Google is enabled in the
// Supabase Auth dashboard (Client ID/Secret from a Google Cloud OAuth client); until then Supabase
// returns an error which the sign-in UI surfaces. (Microsoft/Apple were removed; email is the other method.)

export interface OAuthProviderMeta {
  id: OAuthProvider;
  label: string;
  /** Env flag that hides this provider when set to the string "false". */
  envKey: string;
}

export const OAUTH_PROVIDERS: OAuthProviderMeta[] = [
  { id: 'google', label: 'Google', envKey: 'VITE_OAUTH_GOOGLE' },
];

/** The providers to show, given an env-like map. A provider is enabled unless its flag is "false". */
export function resolveEnabledProviders(env: Record<string, string | undefined>): OAuthProviderMeta[] {
  return OAUTH_PROVIDERS.filter((p) => env[p.envKey] !== 'false');
}

/** Browser convenience: the enabled providers from Vite env. */
export function enabledOAuthProviders(): OAuthProviderMeta[] {
  return resolveEnabledProviders(import.meta.env as unknown as Record<string, string | undefined>);
}
