import { setTelemetrySink, type TelemetryContext } from './telemetry';
import { hasAnalyticsConsent, useConsentStore } from '../legal/consentStore';

// Activates the telemetry seam with real providers, each gated on its own env var so this is INERT
// until you set keys (no npm dependency added; the vendor scripts load lazily from their CDN only when
// configured, and every call is wrapped so a provider can never break the app):
//   VITE_SENTRY_DSN     - Sentry error monitoring (crash reports). Loaded via Sentry's version-managed
//                         loader script; captureError -> Sentry.captureException.
//   VITE_POSTHOG_KEY    - PostHog product analytics. trackEvent -> posthog.capture. NOTE: trackEvent is
//                         already consent-gated in telemetry.ts, so nothing is sent before opt-in.
//   VITE_POSTHOG_HOST   - optional PostHog host (default US cloud).
// Call once at boot (main.tsx). With neither var set, telemetry stays console-only (unchanged).

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = ((import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com').replace(/\/$/, '');

interface SentryGlobal { init?: (o: Record<string, unknown>) => void; captureException?: (e: unknown, hint?: { extra?: TelemetryContext }) => void }
interface PostHogGlobal { init?: (key: string, o: Record<string, unknown>) => void; capture?: (name: string, props?: TelemetryContext) => void }
type TelemetryWindow = Window & { Sentry?: SentryGlobal; posthog?: PostHogGlobal };

let installed = false;

export function installTelemetrySinks(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  if (!SENTRY_DSN && !POSTHOG_KEY) return; // nothing configured -> leave the console-only default

  const w = window as TelemetryWindow;
  const sink: { captureError?: (e: unknown, ctx?: TelemetryContext) => void; trackEvent?: (n: string, p?: TelemetryContext) => void } = {};

  // Sentry: the loader URL is keyed by the DSN's public key (the part between "//" and "@"), so it's
  // version-managed from the Sentry dashboard - no SDK version to pin here.
  if (SENTRY_DSN) {
    const publicKey = SENTRY_DSN.split('//')[1]?.split('@')[0];
    if (publicKey) {
      const s = document.createElement('script');
      s.src = `https://js.sentry-cdn.com/${publicKey}.min.js`;
      s.crossOrigin = 'anonymous';
      s.async = true;
      s.onload = () => { try { w.Sentry?.init?.({ dsn: SENTRY_DSN, tracesSampleRate: 0 }); } catch { /* ignore */ } };
      document.head.appendChild(s);
      // The loader stubs window.Sentry so calls before full load are queued; guarded regardless.
      sink.captureError = (e, ctx) => { try { w.Sentry?.captureException?.(e, { extra: ctx }); } catch { /* ignore */ } };
    }
  }

  if (POSTHOG_KEY) {
    // Event capture is already consent-gated in telemetry.ts's trackEvent().
    sink.trackEvent = (name, props) => { try { w.posthog?.capture?.(name, props); } catch { /* ignore */ } };
    // Defer LOADING + init until analytics consent is granted: posthog.init() writes a cookie and fires
    // a /decide request, so loading it before opt-in would leak an identifier/request pre-consent.
    let loaded = false;
    const loadPostHog = () => {
      if (loaded) return;
      loaded = true;
      const p = document.createElement('script');
      p.src = `${POSTHOG_HOST}/static/array.js`;
      p.async = true;
      p.onload = () => {
        try { w.posthog?.init?.(POSTHOG_KEY, { api_host: POSTHOG_HOST, capture_pageview: false, autocapture: false }); } catch { /* ignore */ }
      };
      document.head.appendChild(p);
    };
    if (hasAnalyticsConsent()) loadPostHog();
    else {
      const unsub = useConsentStore.subscribe((s) => { if (s.status === 'granted') { unsub(); loadPostHog(); } });
    }
  }

  setTelemetrySink(sink);
}
