import { useSpotlightRect } from './spotlightRect';

// Dim-with-cutout spotlight. Reads the current target's live rect (see spotlightRect) and dims
// everything around it with four surrounding panels plus a highlight ring - so the eye lands on the
// tool/panel the current step is using. Pointer-events are off throughout (this is purely visual; the
// manual tour lets the user click through). When the target can't be found we render nothing.

const PAD = 8; // breathing room around the cutout

export function SpotlightOverlay({ target }: { target: string | undefined }) {
  const rect = useSpotlightRect(target);

  if (!rect) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.max(0, rect.x - PAD);
  const y = Math.max(0, rect.y - PAD);
  const w = Math.min(vw - x, rect.w + PAD * 2);
  const h = Math.min(vh - y, rect.h + PAD * 2);
  const dim = 'absolute bg-black/55 transition-all duration-300 ease-out';

  return (
    <div className="fixed inset-0 z-[115] pointer-events-none" aria-hidden>
      {/* Four dim panels forming a cutout around the target. */}
      <div className={dim} style={{ left: 0, top: 0, width: vw, height: y }} />
      <div className={dim} style={{ left: 0, top: y + h, width: vw, height: Math.max(0, vh - (y + h)) }} />
      <div className={dim} style={{ left: 0, top: y, width: x, height: h }} />
      <div className={dim} style={{ left: x + w, top: y, width: Math.max(0, vw - (x + w)), height: h }} />
      {/* Highlight ring on the cutout. */}
      <div
        className="absolute rounded-lg ring-2 ring-[#f7b500] shadow-[0_0_0_9999px_rgba(0,0,0,0)] transition-all duration-300 ease-out"
        style={{ left: x, top: y, width: w, height: h, boxShadow: '0 0 0 1px rgba(247,181,0,0.35), 0 0 24px 4px rgba(247,181,0,0.28)' }}
      />
    </div>
  );
}
