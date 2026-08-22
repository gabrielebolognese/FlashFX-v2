import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal } from '../ui/primitives/Modal';
import { PLAN_LIMITS } from './plans';
import { startCheckout, PRO_PRICE_LABEL } from './checkout';

function size(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : gb.toFixed(0)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// Free-vs-Pro comparison. Media/file-size rows come from PLAN_LIMITS so they never drift from the
// enforced quotas; export/watermark/AI rows describe planned Pro perks.
const ROWS: { label: string; free: string; pro: string }[] = [
  { label: 'Local editing', free: 'Unlimited', pro: 'Unlimited' },
  { label: 'Cloud project backup', free: 'Unlimited', pro: 'Unlimited' },
  { label: 'Cloud media sync', free: size(PLAN_LIMITS.free.cloudMediaBytes), pro: size(PLAN_LIMITS.pro.cloudMediaBytes) },
  { label: 'Max file size', free: size(PLAN_LIMITS.free.maxAssetBytes), pro: size(PLAN_LIMITS.pro.maxAssetBytes) },
  { label: 'Export quality', free: '1080p', pro: '4K' },
  { label: 'Watermark', free: 'Yes', pro: 'None' },
  { label: 'AI generation', free: 'Your own key', pro: 'Included' },
];

export function UpgradeModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upgrade = async () => {
    setBusy(true); setMsg(null);
    const res = await startCheckout();
    setBusy(false);
    if (!res.ok) {
      setMsg(
        res.error === 'not-configured' ? 'Checkout is coming soon — we’re finishing payment setup.'
        : res.error === 'not-signed-in' ? 'Please sign in first.'
        : 'Could not start checkout. Please try again.',
      );
    }
  };

  return (
    <Modal onClose={onClose} size="md" icon={<Sparkles size={16} />} title="Upgrade to Pro">
      <div className="space-y-4">
        <p className="text-[12px] leading-relaxed text-slate-400">
          Your work follows you everywhere — full media sync, bigger files, 4K exports, and AI included.
        </p>

        <div className="overflow-hidden rounded-lg border border-hairline">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 bg-surface-1 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Feature</span>
            <span className="w-16 text-center">Free</span>
            <span className="w-16 text-center text-[#f7b500]">Pro</span>
          </div>
          {ROWS.map((r) => (
            <div key={r.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 border-t border-hairline px-3 py-1.5 text-[11px]">
              <span className="text-slate-300">{r.label}</span>
              <span className="w-16 text-center text-slate-500">{r.free}</span>
              <span className="w-16 text-center font-medium text-slate-100">{r.pro}</span>
            </div>
          ))}
        </div>

        {msg && <p className="text-[11px] text-amber-400">{msg}</p>}

        <button
          onClick={() => void upgrade()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#f7b500] py-2.5 text-[13px] font-semibold text-[#0a0f16] transition-colors hover:bg-[#ffc83d] disabled:opacity-60"
        >
          <Sparkles size={14} /> {busy ? 'Starting…' : `Upgrade to Pro — ${PRO_PRICE_LABEL}`}
        </button>
        <p className="text-center text-[10px] text-slate-600">Secure checkout · cancel anytime</p>
      </div>
    </Modal>
  );
}
