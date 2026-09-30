import { useEffect, useRef, useState } from 'react';

// Flash - the character that lives in the editor. This is the "body" only: it hops around the UI and
// swaps poses. No talking / no lip-sync (by design). It is a purely decorative overlay: pointer-events
// are off so it can never block a click, and it sits below modals. The poses are transparent PNGs in
// public/character/ (a suited figure with the Flash logo as its head).
//
// Everything visual is driven by the constants below so positions/size/cadence are easy to tune.

// Pose sprites (public/character/*.png). Front-facing, centered in a 16:9 transparent frame.
const POSES = ['normal', 'normal2', 'normal3', 'normal4', 'working', 'thumbsUp', 'pointingAtYou'] as const;

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
  { key: 'left-rotated', weight: 18, anchor: { left: '-10px', bottom: 'clamp(40px,16vh,150px)' }, rot: 90 },
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
  const [pose, setPose] = useState<string>(POSES[0]);
  const [jump, setJump] = useState(0);
  const lastSpot = useRef(0);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    // With reduced motion, Flash just sits quietly in the bottom-right and does not hop about.
    if (reduce.current) return;

    let timer: number;
    const hop = () => {
      // Avoid landing on the same spot twice in a row so the movement always reads.
      let next = pickWeighted(SPOTS);
      if (next === lastSpot.current) next = (next + 1) % SPOTS.length;
      lastSpot.current = next;
      setSpotIndex(next);
      setPose(POSES[Math.floor(Math.random() * POSES.length)]);
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
      {/* Crop box: a centered vertical slice of the 16:9 sprite (sides + top air clipped) so the figure
          hugs the corner regardless of each pose's own framing. Re-keyed on every hop to replay the pop. */}
      <div
        key={jump}
        style={{
          position: 'relative',
          width: 'clamp(160px,21vh,232px)',
          height: 'clamp(150px,20vh,216px)',
          overflow: 'hidden',
          animation: still ? undefined : 'flashchar-pop 420ms cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, animation: still ? undefined : 'flashchar-bob 3.4s ease-in-out infinite' }}>
          <img
            src={`/character/${pose}.png`}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 0,
              height: '122%',
              width: 'auto',
              transform: 'translateX(-50%)',
              userSelect: 'none',
              filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.45))',
            }}
          />
        </div>
      </div>
    </div>
  );
}
