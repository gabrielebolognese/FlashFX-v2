import { useEffect, useRef, useState } from 'react';
import { FlashAvatar } from './FlashAvatar';
import { FLASH_EXPRESSIONS, type FlashExpression } from './flashExpressions';

// Flash - the character that lives in the editor. This is the "body" only: it hops around the UI and
// changes expression. No talking / no lip-sync (by design). It is a purely decorative overlay:
// pointer-events are off so it can never block a click, and it sits below modals. Flash is drawn entirely
// in SVG (see FlashAvatar) - no raster images - so it is transparent and crisp everywhere.
//
// Everything is driven by the constants below so positions/size/cadence are easy to tune.

// Where Flash can appear, with how often (weight). Mostly bottom-right; sometimes bottom-left; rarely the
// top corners; and now and then it slides in from the left rotated 90deg. `anchor` is the fixed-position
// offset; `rot` rotates the whole character.
interface Spot {
  key: string;
  weight: number;
  anchor: { top?: string; right?: string; bottom?: string; left?: string };
  rot: number;
}
const SPOTS: Spot[] = [
  { key: 'bottom-right', weight: 50, anchor: { right: 'clamp(6px,2vw,28px)', bottom: 'clamp(6px,2vh,22px)' }, rot: 0 },
  { key: 'bottom-left', weight: 22, anchor: { left: 'clamp(6px,2vw,28px)', bottom: 'clamp(6px,2vh,22px)' }, rot: 0 },
  { key: 'left-rotated', weight: 18, anchor: { left: '-6px', bottom: 'clamp(40px,16vh,150px)' }, rot: 90 },
  { key: 'top-right', weight: 5, anchor: { right: 'clamp(6px,2vw,28px)', top: '60px' }, rot: 0 },
  { key: 'top-left', weight: 5, anchor: { left: 'clamp(6px,2vw,28px)', top: '60px' }, rot: 0 },
];

const JUMP_MIN_MS = 7000;
const JUMP_MAX_MS = 13000;

function pickWeighted(spots: Spot[]): number {
  const total = spots.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < spots.length; i++) {
    r -= spots[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

export function FlashCharacter() {
  const [spotIndex, setSpotIndex] = useState(0);
  const [expr, setExpr] = useState<FlashExpression>('wave');
  const [jump, setJump] = useState(0);
  const lastSpot = useRef(0);
  const lastExpr = useRef<FlashExpression>('wave');
  const reduce = useRef(false);
  // The avatar viewBox is 120x205 (a tall body). These bounds keep the HEAD at roughly the same
  // on-screen size as before the body was enlarged (scaled by 205/150 vs the old 120x150 box).
  const [height] = useState(() => {
    if (typeof window === 'undefined') return 205;
    return Math.round(Math.min(249, Math.max(161, window.innerHeight * 0.246)));
  });

  useEffect(() => {
    reduce.current = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    // With reduced motion, Flash just sits quietly in the bottom-right and does not hop about.
    if (reduce.current) return;

    let timer: number;
    const hop = () => {
      // Avoid repeating the same spot or expression twice in a row so every hop reads as a change.
      let next = pickWeighted(SPOTS);
      if (next === lastSpot.current) next = (next + 1) % SPOTS.length;
      lastSpot.current = next;
      let e = FLASH_EXPRESSIONS[Math.floor(Math.random() * FLASH_EXPRESSIONS.length)];
      if (e === lastExpr.current) e = FLASH_EXPRESSIONS[(FLASH_EXPRESSIONS.indexOf(e) + 1) % FLASH_EXPRESSIONS.length];
      lastExpr.current = e;
      setSpotIndex(next);
      setExpr(e);
      setJump((j) => j + 1);
      timer = window.setTimeout(hop, JUMP_MIN_MS + Math.random() * (JUMP_MAX_MS - JUMP_MIN_MS));
    };
    timer = window.setTimeout(hop, JUMP_MIN_MS + Math.random() * (JUMP_MAX_MS - JUMP_MIN_MS));
    return () => window.clearTimeout(timer);
  }, []);

  const spot = SPOTS[spotIndex];
  const still = reduce.current;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 30,
        transform: `rotate(${spot.rot}deg)`,
        transformOrigin: 'center',
        ...spot.anchor,
      }}
    >
      <style>{`
        @keyframes flashchar-pop { 0%{transform:scale(.55);opacity:0} 60%{transform:scale(1.06);opacity:1} 100%{transform:scale(1);opacity:1} }
        @keyframes flashchar-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
      `}</style>
      {/* Re-keyed on every hop to replay the pop. */}
      <div key={jump} style={{ animation: still ? undefined : 'flashchar-pop 420ms cubic-bezier(.34,1.56,.64,1)' }}>
        <div style={{ animation: still ? undefined : 'flashchar-bob 3.4s ease-in-out infinite', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))' }}>
          <FlashAvatar expression={expr} height={height} />
        </div>
      </div>
    </div>
  );
}
