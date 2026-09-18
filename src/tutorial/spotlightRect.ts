import { useEffect, useState } from 'react';

// Shared spotlight-target geometry: finds the DOM node tagged data-tutorial-id={target} (or the
// canvas for 'canvas') and exposes its live rect. Used by both the SpotlightOverlay (to draw the
// cutout) and the tour's prompt box (to position itself next to the highlight). Lives in its own
// module so the component file exports only a component (fast-refresh friendly).

export interface SpotRect { x: number; y: number; w: number; h: number }

export function findSpotlightRect(target: string | undefined): SpotRect | null {
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

const sameRect = (a: SpotRect | null, b: SpotRect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** Live rect of the current spotlight target, polled + updated only on change. */
export function useSpotlightRect(target: string | undefined): SpotRect | null {
  const [rect, setRect] = useState<SpotRect | null>(() => findSpotlightRect(target));

  useEffect(() => {
    let raf = 0;
    const update = () => setRect((prev) => { const next = findSpotlightRect(target); return sameRect(prev, next) ? prev : next; });
    update();
    // Poll on an interval rather than every frame - cheap, and the target only moves on relayout.
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

  return rect;
}
