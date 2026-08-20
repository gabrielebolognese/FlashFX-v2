import { create } from 'zustand';

// Opt-in analytics consent (GDPR/ePrivacy): analytics stay OFF until the user grants.
// Persisted so the banner shows once. Error monitoring is treated as essential/legitimate
// interest and is not gated here — only product analytics (trackEvent) is.
export type ConsentStatus = 'unknown' | 'granted' | 'denied';

const KEY = 'ffx-analytics-consent';

function load(): ConsentStatus {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : 'unknown';
  } catch {
    return 'unknown';
  }
}

function persist(status: ConsentStatus): void {
  try {
    if (status === 'unknown') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, status);
  } catch {
    /* storage unavailable — keep it in memory only */
  }
}

interface ConsentState {
  status: ConsentStatus;
  grant: () => void;
  deny: () => void;
  /** Re-open the choice (e.g. from a "cookie settings" link). */
  reset: () => void;
}

export const useConsentStore = create<ConsentState>((set) => ({
  status: load(),
  grant: () => { persist('granted'); set({ status: 'granted' }); },
  deny: () => { persist('denied'); set({ status: 'denied' }); },
  reset: () => { persist('unknown'); set({ status: 'unknown' }); },
}));

/** Non-reactive check used by the telemetry seam before forwarding analytics events. */
export function hasAnalyticsConsent(): boolean {
  return useConsentStore.getState().status === 'granted';
}
