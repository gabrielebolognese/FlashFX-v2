import { Check, AlertTriangle, Loader2, Download, X } from 'lucide-react';
import { useIslandStore, type IslandTone } from './islandStore';
import { usePanelStore } from '../../store/panels';

const TONE_TEXT: Record<IslandTone, string> = {
  accent: 'text-accent',
  success: 'text-success',
  danger: 'text-danger',
  info: 'text-info',
};

/**
 * Top-center hub for progress + toasts + errors. Blur is allowed here — it floats
 * over the (static) toolbar, never the live viewport. Clicking routes to the Tasks
 * panel for the full log. Spring entrance; z-95 (below modals, above canvas chrome).
 */
export function DynamicIsland() {
  const mode = useIslandStore((s) => s.mode);
  const message = useIslandStore((s) => s.message);
  const tone = useIslandStore((s) => s.tone);
  const progress = useIslandStore((s) => s.progress);
  const icon = useIslandStore((s) => s.icon);
  const onCancel = useIslandStore((s) => s.onCancel);
  const dismiss = useIslandStore((s) => s.dismiss);
  const openTasks = usePanelStore((s) => s.openTasks);

  if (mode === 'idle') return null;

  const showRing = mode === 'progress' && progress !== null;
  const iconEl =
    icon === 'check' ? <Check size={13} className={TONE_TEXT[tone]} />
    : icon === 'alert' ? <AlertTriangle size={13} className={TONE_TEXT[tone]} />
    : icon === 'download' ? <Download size={13} className={TONE_TEXT[tone]} />
    : icon === 'loader' ? <Loader2 size={13} className="animate-spin text-accent" />
    : null;

  return (
    <div
      className="animate-ffx-island fixed left-1/2 top-2 z-island -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div
        onClick={openTasks}
        className="ffx-material-island flex h-7 cursor-pointer select-none items-center gap-2 rounded-island border border-hairline pl-2.5 pr-2 text-caption text-secondary shadow-overlay"
        title="Open Tasks for the full log"
      >
        {showRing ? <ProgressRing value={progress ?? 0} /> : iconEl}
        <span className="max-w-[240px] truncate text-primary">{message}</span>
        {showRing && (
          <span className="tabular-nums text-tertiary">{Math.round((progress ?? 0) * 100)}%</span>
        )}
        {mode === 'progress' && onCancel && (
          <button
            type="button"
            title="Cancel"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="ml-0.5 rounded p-0.5 text-tertiary transition-colors hover:bg-white/5 hover:text-primary"
          >
            <X size={12} />
          </button>
        )}
        {mode === 'error' && (
          <button
            type="button"
            title="Dismiss"
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="ml-0.5 rounded p-0.5 text-tertiary transition-colors hover:bg-white/5 hover:text-primary"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Determinate gold ring (FCP's background-task gauge). stroke-dashoffset only. */
function ProgressRing({ value }: { value: number }) {
  const r = 6;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const offset = circumference * (1 - clamped);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="-rotate-90" aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="#d9a521"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
