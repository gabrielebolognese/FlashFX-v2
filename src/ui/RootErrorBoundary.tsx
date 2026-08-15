import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { captureError } from '../lib/telemetry';

/**
 * Last-resort boundary around the whole app. PanelErrorBoundary isolates individual
 * panels; this catches a throw in the shell (Toolbar, a modal, the Dashboard,
 * onboarding, App itself) that would otherwise white-screen everything. It reports
 * to telemetry and offers a reload — reassuring the user their work is safe locally.
 */
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, { kind: 'root-boundary', componentStack: info.componentStack });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fixed inset-0 z-top flex items-center justify-center bg-surface-sunken p-6">
        <div className="w-full max-w-md rounded-xl border border-hairline bg-surface-2 p-6 shadow-modal">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
              <AlertTriangle size={16} className="text-danger" />
            </span>
            <h1 className="text-title text-primary">Something went wrong</h1>
          </div>

          <p className="mt-3 text-body text-secondary">
            FlashFX hit an unexpected error. Your projects and media are saved locally and are safe —
            reloading usually fixes it.
          </p>

          {error.message && (
            <pre className="mt-3 max-h-24 overflow-auto rounded-md border border-hairline bg-surface-sunken px-2.5 py-2 text-caption text-tertiary">
              {error.message}
            </pre>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-comfortable items-center gap-1.5 rounded-md bg-accent px-3.5 text-body-strong text-on-accent transition-colors duration-micro hover:bg-accent-hover"
            >
              <RotateCcw size={14} />
              Reload FlashFX
            </button>
          </div>
        </div>
      </div>
    );
  }
}
