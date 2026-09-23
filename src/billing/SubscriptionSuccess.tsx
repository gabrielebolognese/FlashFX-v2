import { Crown, Sparkles, Boxes, Palette, Code2, Cloud, Check, ArrowRight } from 'lucide-react';

// Hidden post-checkout landing at /subscription-success (no nav links to it; reached only by the
// Paddle success redirect or a direct link). One-page, minimalist, self-contained: an animated Pro
// celebration with the full list of unlocked benefits. Pure CSS animations (no engine), so it's light
// and never touches the editor. The CTA navigates back into the app.

const BENEFITS: { icon: typeof Crown; title: string; desc: string }[] = [
  { icon: Crown, title: 'Watermark-free exports', desc: 'Clean 4K, high-bitrate and alpha/transparent video.' },
  { icon: Sparkles, title: 'AI generation, included', desc: 'Turn a prompt into a full animated scene.' },
  { icon: Boxes, title: 'Pro VFX & motion', desc: 'Tracking, keying, cloner, physics, rigging, warp.' },
  { icon: Palette, title: 'Pro color', desc: '3D .cube LUTs, curves and secondary grading.' },
  { icon: Code2, title: 'Expressions & premium packs', desc: 'Code-driven animation + premium templates and elements.' },
  { icon: Cloud, title: '100 GB cloud', desc: 'Unlimited cloud projects, synced across your devices.' },
];

// Deterministic sparkle field (no randomness): left%, top%, size px, delay s, duration s.
const SPARKLES = [
  [8, 22, 4, 0, 6], [18, 68, 3, 1.2, 7], [30, 12, 5, 0.5, 5.5], [42, 82, 3, 2.1, 6.5],
  [58, 18, 4, 0.8, 7], [70, 74, 5, 1.6, 5], [82, 30, 3, 0.2, 6], [90, 60, 4, 2.4, 6.8],
  [12, 46, 3, 1.9, 7.2], [50, 40, 4, 0.4, 5.8], [64, 52, 3, 2.7, 6.2], [88, 12, 4, 1.1, 6.6],
] as const;

const CSS = `
@keyframes susRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes susPop { 0% { opacity: 0; transform: scale(0.5); } 60% { opacity: 1; transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes susDraw { to { stroke-dashoffset: 0; } }
@keyframes susShimmer { to { background-position: 200% center; } }
@keyframes susDrift { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4%, 6%) scale(1.12); } }
@keyframes susDrift2 { 0%,100% { transform: translate(0,0) scale(1.05); } 50% { transform: translate(-5%, -4%) scale(1); } }
@keyframes susFloat { 0% { opacity: 0; transform: translateY(6px) scale(0.6); } 25%,75% { opacity: 0.9; } 100% { opacity: 0; transform: translateY(-14px) scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .sus-anim, .sus-anim * { animation: none !important; }
}
`;

export function SubscriptionSuccess() {
  const goToApp = () => { window.location.href = '/'; };

  return (
    <div className="sus-anim fixed inset-0 z-[200] overflow-y-auto text-slate-100" style={{ backgroundColor: '#070b0f' }}>
      <style>{CSS}</style>

      {/* Aurora glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/3 left-1/2 h-[70vmax] w-[70vmax] -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #f7b500 0%, transparent 60%)', animation: 'susDrift 14s ease-in-out infinite' }} />
        <div className="absolute bottom-[-30%] left-[-10%] h-[55vmax] w-[55vmax] rounded-full opacity-20 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #ff7a00 0%, transparent 60%)', animation: 'susDrift2 18s ease-in-out infinite' }} />
        <div className="absolute right-[-15%] top-[20%] h-[45vmax] w-[45vmax] rounded-full opacity-[0.12] blur-[120px]"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 60%)', animation: 'susDrift 20s ease-in-out infinite' }} />
        {SPARKLES.map(([l, t, s, d, dur], i) => (
          <span key={i} className="absolute rounded-full bg-[#ffd66b]"
            style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, boxShadow: '0 0 6px #ffcc4d', animation: `susFloat ${dur}s ease-in-out ${d}s infinite` }} />
        ))}
      </div>

      <div className="relative mx-auto flex min-h-full w-[min(92vw,560px)] flex-col items-center justify-center px-4 py-16 text-center">
        {/* Success mark */}
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full shadow-[0_0_40px_rgba(247,181,0,0.5)]"
          style={{ background: 'linear-gradient(135deg, #ffd66b, #f7b500 45%, #ff7a00)', animation: 'susPop 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M11 20.5 L17.5 27 L29.5 14" stroke="#0a0f16" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 40, strokeDashoffset: 40, animation: 'susDraw 0.5s ease-out 0.45s forwards' }} />
          </svg>
          <span className="absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-[#0a0f16] p-1">
            <Crown size={14} className="text-[#ffd66b]" />
          </span>
        </div>

        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#f7b500]" style={{ animation: 'susRise 0.5s ease-out 0.1s both' }}>
          Subscription active
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl"
          style={{ animation: 'susRise 0.5s ease-out 0.18s both' }}>
          Welcome to{' '}
          <span
            style={{
              background: 'linear-gradient(90deg,#ffd66b,#f7b500,#ff7a00,#ffd66b)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'susShimmer 4s linear infinite',
            }}
          >
            FlashFX Pro
          </span>
        </h1>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-slate-400" style={{ animation: 'susRise 0.5s ease-out 0.26s both' }}>
          Thank you. Your account is upgraded and everything below is unlocked, effective immediately.
        </p>

        {/* Benefits */}
        <div className="mt-9 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
          {BENEFITS.map((b, i) => {
            const Icon = b.icon;
            return (
              <div
                key={b.title}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-sm"
                style={{ animation: `susRise 0.5s ease-out ${0.34 + i * 0.08}s both` }}
              >
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#ffd66b] to-[#f7b500] text-[#0a0f16]">
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-100">
                    <Check size={12} className="text-[#f7b500]" /> {b.title}
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{b.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <button
          onClick={goToApp}
          className="mt-10 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 px-7 py-3 text-[15px] font-bold text-black shadow-[0_8px_30px_rgba(247,181,0,0.35)] transition-[filter,transform] hover:brightness-110 hover:-translate-y-0.5"
          style={{ animation: 'susRise 0.5s ease-out 0.9s both' }}
        >
          Start creating <ArrowRight size={17} />
        </button>
        <p className="mt-4 text-[11px] text-slate-600" style={{ animation: 'susRise 0.5s ease-out 1s both' }}>
          Manage your subscription anytime from Account settings.
        </p>
      </div>
    </div>
  );
}
