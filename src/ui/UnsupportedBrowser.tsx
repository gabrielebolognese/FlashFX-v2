import { MonitorX } from 'lucide-react';

/**
 * Shown pre-flight (before the app boots) when the browser has no WebGPU at all —
 * e.g. Safari, Firefox without the flag, or an old browser. Without this, such
 * users boot the whole app and then hit a confusing infinite "reset" overlay. This
 * gives them a clear, honest dead-end with what to do instead.
 */
export function UnsupportedBrowser() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface-sunken p-6">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface-2 p-7 text-center shadow-modal">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface-3">
          <MonitorX size={22} className="text-accent" />
        </span>
        <h1 className="text-title text-primary">FlashFX needs a WebGPU browser</h1>
        <p className="mx-auto mt-3 max-w-sm text-body text-secondary">
          FlashFX renders and exports video on the GPU, which needs WebGPU. Your current browser
          doesn&apos;t support it yet.
        </p>
        <p className="mt-4 text-caption text-tertiary">
          Please open FlashFX in the latest <span className="text-secondary">Chrome</span> or{' '}
          <span className="text-secondary">Edge</span> on desktop.
        </p>
      </div>
    </div>
  );
}
