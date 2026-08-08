import { useEffect, useState } from 'react';

// Dim-with-cutout spotlight. Finds the DOM node tagged data-tutorial-id={target} (or the canvas for
// 'canvas'), reads its live rect, and dims everything around it with four surrounding panels plus a
// highlight ring — so the eye lands on the tool/panel the current step is using. Pointer-events are
// off throughout (the runner's own soft-lock handles click-blocking); this is purely visual.
//
// The rect is re-read on a light interval + on resize/scroll, because the editor relayouts as the
// build adds layers (the timeline grows, panels shift). When the target can't be found we render
// nothing — the step degrades to narration-only, never a broken dim.

interface Rect { x: number; y: number; w: number; h: number }

const PAD = 8; // breathing room around the cutout

function findRect(target: string | undefined): Rect | null {
  if (!target || target === 'none') return null;
  const sel = target === 'canvas'
    ? '[data-tutorial-id="canvas"], canvas'
    : `[data-tutorial-id="${CSS.escape(target)}"]`;
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function SpotlightOverlay({ target }: { target: string | undefined }) {
  const [rect, setRect] = useState<Rect | null>(() => findRect(target));

  useEffect(() => {
    let raf = 0;
    const update = () => setRect(findRect(target));
    update();
    // Poll on an interval rather than every frame — cheap, and the target only moves on relayout.
    const id = window.setInterval(update, 200);
    const onChange = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.clearInterval(id);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [target]);

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
