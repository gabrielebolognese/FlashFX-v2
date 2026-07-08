import { AlertTriangle, AlertOctagon, X } from 'lucide-react';
import { useState } from 'react';
import { useFieldOverlapWarning } from '../../field-sampling/useFieldOverlapWarning';

export function MultiFieldWarning() {
  const warning = useFieldOverlapWarning();
  const [dismissed, setDismissed] = useState(false);

  if (!warning.show || dismissed) return null;

  const isCritical = warning.severity === 'critical';
  const Icon = isCritical ? AlertOctagon : AlertTriangle;
  const formattedSamples = warning.estimatedSamples.toLocaleString();

  return (
    <div
      className={`mx-2 mb-2 rounded-lg px-3 py-2 text-[10px] border ${
        isCritical
          ? 'bg-red-500/10 border-red-500/40 text-red-300'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon size={12} className="mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            {warning.activeCount} Field Layers active at this frame (~{formattedSamples} samples)
          </div>
          <div className="text-[9px] opacity-70 mt-0.5">
            {isCritical
              ? 'Browser crash risk. Reduce density immediately or offset layers in time.'
              : 'Playback may lag on lower-end GPUs. Consider offsetting layers in time or reducing grid density.'}
          </div>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            sessionStorage.setItem('field-warning-dismissed', '1');
          }}
          className="text-slate-500 hover:text-slate-300 flex-shrink-0"
          title="Don't show again this session"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
}
