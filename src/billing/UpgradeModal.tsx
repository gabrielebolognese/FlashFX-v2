import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal } from '../ui/primitives/Modal';
import { PLAN_LIMITS, type ProFeature } from './plans';
import { startCheckout, PRO_PRICE_LABEL } from './checkout';
import { useAuthStore } from '../auth/store';
import { AuthModal } from '../auth/AuthModal';
import { useUpgradePrompt } from './upgradePrompt';

// A one-line intro tailored to the feature the user just tried to use (null = generic entry from the
// account panel). Keeps the upsell specific to what they were reaching for.
const FEATURE_INTRO: Record<ProFeature, string> = {
  'ai': 'AI animation generation and editing is a Pro feature.',
  'expressions': 'Expressions (code-driven animation) are a Pro feature.',
  '3d': '3D cameras, depth and layers are a Pro feature.',
  'premium-pack': 'This is a premium pack, included with Pro.',
};

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
  { label: 'Watermark', free: 'None', pro: 'None' },
  { label: 'AI generation', free: 'No', pro: 'Included' },
  { label: 'Expressions & packs', free: 'No', pro: 'Included' },
  { label: '3D camera & depth', free: 'No', pro: 'Included' },
];

export function UpgradeModal({ onClose, feature = null }: { onClose: () => void; feature?: ProFeature | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const authEnabled = useAuthStore((s) => s.enabled);

  const upgrade = async () => {
    // Guests can't pay (checkout needs a Supabase user to key the subscription). Rather than fail after
    // the click, send them through sign-in first, then continue straight into checkout.
    if (!useAuthStore.getState().user && authEnabled) { setShowAuth(true); return; }
    setBusy(true); setMsg(null);
    const res = await startCheckout();
    setBusy(false);
    if (!res.ok) {
      setMsg(
        res.error === 'not-configured' ? 'Checkout is coming soon - we’re finishing payment setup.'
        : res.error === 'not-signed-in' ? 'Please sign in first.'
        : 'Could not start checkout. Please try again.',
      );
    }
  };

  const onAuthClose = () => {
    setShowAuth(false);
    if (useAuthStore.getState().user) void upgrade(); // signed in -> continue to checkout
  };

  if (showAuth) return <AuthModal onClose={onAuthClose} />;

  return (
    <Modal onClose={onClose} size="md" icon={<Sparkles size={16} />} title="Upgrade to Pro">
      <div className="space-y-4">
        {feature && (
          <p className="rounded-md border border-[#f7b500]/25 bg-[#f7b500]/10 px-3 py-2 text-[12px] font-medium text-[#f7b500]">
            {FEATURE_INTRO[feature]}
          </p>
        )}
        <p className="text-[12px] leading-relaxed text-slate-400">
          Go Pro for AI animation, expressions and premium packs, 3D camera and depth, and 20 GB of cloud storage.
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
          <Sparkles size={14} /> {busy ? 'Starting…' : `Upgrade to Pro - ${PRO_PRICE_LABEL}`}
        </button>
        <p className="text-center text-[10px] text-slate-600">Secure checkout · cancel anytime</p>
      </div>
    </Modal>
  );
}

/** Mounted once at the app root. Renders the UpgradeModal whenever any gated action calls
 *  requirePro(...) / useUpgradePrompt.show(...), with copy tailored to the feature. */
export function UpgradeModalHost() {
  const open = useUpgradePrompt((s) => s.open);
  const feature = useUpgradePrompt((s) => s.feature);
  const close = useUpgradePrompt((s) => s.close);
  if (!open) return null;
  return <UpgradeModal feature={feature} onClose={close} />;
}
