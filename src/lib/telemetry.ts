// Vendor-agnostic observability seam (Phase 0). Today it routes to the console;
// when a Sentry/PostHog (or any) provider is added, call setTelemetrySink() ONCE
// at boot and every captureError/trackEvent in the app forwards to it — no other
// file needs to change. No SDK, no keys, no dependency required to ship this.
//
// Later, e.g.:
//   import * as Sentry from '@sentry/react'; import posthog from 'posthog-js';
//   setTelemetrySink({
//     captureError: (e, ctx) => Sentry.captureException(e, { extra: ctx }),
//     trackEvent:   (name, props) => posthog.capture(name, props),
//   });

export type TelemetryContext = Record<string, unknown>;

interface TelemetrySink {
  captureError?: (error: unknown, context?: TelemetryContext) => void;
  trackEvent?: (name: string, props?: TelemetryContext) => void;
}

let sink: TelemetrySink = {};

/** Install a real provider (Sentry/PostHog/…) in one place. Safe to call once at boot. */
export function setTelemetrySink(next: TelemetrySink): void {
  sink = next;
}

/** Report an error/exception. Never throws — telemetry must not become a failure mode. */
export function captureError(error: unknown, context?: TelemetryContext): void {
  try {
    sink.captureError?.(error, context);
  } catch {
    /* swallow — a broken sink must never break the app */
  }
  // Always keep a local breadcrumb so nothing is lost before a provider is wired.
  console.error('[telemetry] error', error, context ?? '');
}

/** Record a product event (activation funnel, feature usage). Never throws. */
export function trackEvent(name: string, props?: TelemetryContext): void {
  try {
    sink.trackEvent?.(name, props);
  } catch {
    /* swallow */
  }
  if (import.meta.env.DEV) console.debug('[telemetry] event', name, props ?? '');
}

let handlersInstalled = false;

/** Route uncaught errors + unhandled promise rejections into captureError. Idempotent. */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled || typeof window === 'undefined') return;
  handlersInstalled = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    captureError(event.error ?? event.message, {
      kind: 'window.onerror',
      filename: event.filename,
      line: event.lineno,
      col: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    captureError(event.reason, { kind: 'unhandledrejection' });
  });
}
