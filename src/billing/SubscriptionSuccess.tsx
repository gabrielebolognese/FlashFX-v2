import { Crown, PlayCircle, ArrowRight } from 'lucide-react';

// Hidden post-checkout landing at /subscription-success (no nav links to it; reached only by the
// Lemon Squeezy after-purchase redirect or a direct link). One-page, minimalist Pro celebration: the benefits list
// on the center-left (big yellow titles, short white descriptions) and a thank-you video placeholder on
// the right with a "Show me everything" CTA. Pure CSS animations, self-contained (no engine).

const FEATURES: { title: string; desc: string }[] = [
  { title: '20 GB of storage', desc: 'Keep your projects in the cloud, synced across every device you sign in on.' },
  { title: 'AI animation', desc: 'Generate and edit whole animated scenes from a prompt, right inside the editor.' },
  { title: 'Expressions & premium packs', desc: 'Code-driven animation, plus premium templates and effect packs.' },
  { title: '3D features', desc: 'Cameras, depth and 3D layers to give your motion real dimension.' },
];

// Deterministic sparkle field (no randomness): left%, top%, size px, delay s, duration s.
const SPARKLES = [
  [8, 22, 4, 0, 6], [18, 68, 3, 1.2, 7], [30, 12, 5, 0.5, 5.5], [42, 82, 3, 2.1, 6.5],
  [70, 74, 5, 1.6, 5], [82, 30, 3, 0.2, 6], [90, 60, 4, 2.4, 6.8], [50, 40, 4, 0.4, 5.8],
] as const;

const CSS = `
@keyframes susRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes susPop { 0% { opacity: 0; transform: scale(0.5); } 60% { opacity: 1; transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes susShimmer { to { background-position: 200% center; } }
@keyframes susDrift { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4%, 6%) scale(1.12); } }
@keyframes susDrift2 { 0%,100% { transform: translate(0,0) scale(1.05); } 50% { transform: translate(-5%, -4%) scale(1); } }
@keyframes susFloat { 0% { opacity: 0; transform: translateY(6px) scale(0.6); } 25%,75% { opacity: 0.9; } 100% { opacity: 0; transform: translateY(-14px) scale(1); } }
@media (prefers-reduced-motion: reduce) { .sus-anim, .sus-anim * { animation: none !important; } }
`;

export function SubscriptionSuccess() {
  // Arm the Pro tutorial choreography, then reload into the app; App's boot handler opens a fresh
  // project and ProTutorial plays the "20 GB storage" reveal in the starter editor.
  const showEverything = () => {
    try { sessionStorage.setItem('ffx-pro-tour', 'storage'); } catch { /* ignore */ }
    window.location.href = '/';
  };

  return (
    <div className="sus-anim fixed inset-0 overflow-y-auto text-slate-100" style={{ background: 'linear-gradient(160deg, #1e3350 0%, #16273f 55%, #132035 100%)' }}>
      <style>{CSS}</style>

      {/* Aurora glows (gold + lighter blue) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 left-1/3 h-[60vmax] w-[60vmax] rounded-full opacity-25 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #f7b500 0%, transparent 60%)', animation: 'susDrift 16s ease-in-out infinite' }} />
        <div className="absolute bottom-[-25%] right-[-10%] h-[55vmax] w-[55vmax] rounded-full opacity-30 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #3f6da8 0%, transparent 60%)', animation: 'susDrift2 20s ease-in-out infinite' }} />
        {SPARKLES.map(([l, t, s, d, dur], i) => (
          <span key={i} className="absolute rounded-full bg-[#ffd66b]"
            style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, boxShadow: '0 0 6px #ffcc4d', animation: `susFloat ${dur}s ease-in-out ${d}s infinite` }} />
        ))}
      </div>

      <div className="relative mx-auto grid min-h-full w-[min(94vw,1000px)] grid-cols-1 items-center gap-10 px-5 py-16 md:grid-cols-[1.05fr_1fr] md:gap-12">
        {/* Left: welcome + the 4 benefits */}
        <div className="text-left">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1"
            style={{ animation: 'susPop 0.55s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <Crown size={14} className="text-[#ffce3a]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffce3a]">Subscription active</span>
          </div>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl" style={{ animation: 'susRise 0.5s ease-out 0.12s both' }}>
            Welcome to{' '}
            <span style={{ background: 'linear-gradient(90deg,#ffe08a,#ffce3a,#ff9a3a,#ffe08a)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'susShimmer 4s linear infinite' }}>
              FlashFX Pro
            </span>
          </h1>
          <p className="mt-2.5 max-w-md text-[13.5px] leading-relaxed text-slate-300" style={{ animation: 'susRise 0.5s ease-out 0.2s both' }}>
            Thank you. Your account is upgraded, effective immediately. Here is what you have unlocked:
          </p>

          <div className="mt-8 space-y-6">
            {FEATURES.map((f, i) => (
              <div key={f.title} style={{ animation: `susRise 0.5s ease-out ${0.3 + i * 0.1}s both` }}>
                <h2 className="text-xl font-bold tracking-tight text-[#ffce3a] sm:text-[22px]">{f.title}</h2>
                <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-white/90">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: thank-you video placeholder + CTA */}
        <div className="w-full" style={{ animation: 'susRise 0.6s ease-out 0.4s both' }}>
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0e1b2e]/70 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-slate-300">
              <PlayCircle size={46} className="text-[#ffce3a]" />
              <span className="text-[11px] tracking-wide text-slate-400">A thank-you from the founder</span>
            </div>
          </div>
          <button
            onClick={showEverything}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 py-3 text-[15px] font-bold text-black shadow-[0_10px_30px_rgba(247,181,0,0.35)] transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110"
          >
            Show me everything <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
