import { useEffect, useRef, useState } from 'react';
import { FlashAvatar } from './FlashAvatar';
import { FLASH_EXPRESSIONS, type FlashExpression } from './flashExpressions';
import { useFlashStore } from '../store/flash';

// Flash - the character that lives in the editor. Body + choreography only (no lip-sync). A decorative
// overlay: pointer-events are off on the container so it never blocks a click; only Flash himself is
// clickable (left-click -> a small menu with "Hide Flash"). Drawn entirely in SVG (see FlashAvatar).
// Hidden state is persisted (useFlashStore) and brought back from the Flash tab (AiChatPanel header).

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

// Canned lines (no AI yet - the "brain" comes later). Kept light + tasteful; occasional, auto-dismissed.
const FLASH_LINES = [
  'Need a hand?',
  'Ooh, nice keyframe.',
  'That transition is clean.',
  'Export when you are ready.',
  'Psst - I live in the Flash tab.',
  'Lookin good.',
  'W edit.',
  'I have ideas, just say the word.',
  'Easing could be smoother there.',
  'Take a break, you earned it.',
];

// Lines Flash cycles through while he is building a scene for you (status === 'building').
const BUILD_LINES = [
  'On it. Taking the wheel...',
  'Building your scene...',
  'Sit back, I got this.',
  'Cooking something up...',
  'Laying down keyframes...',
  'Almost there...',
];

const JUMP_MIN_MS = 7000;
const JUMP_MAX_MS = 13000;
const DESK_MIN_MS = 12000;
const DESK_MAX_MS = 20000;

function pickWeighted(spots: Spot[]): number {
  const total = spots.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < spots.length; i++) {
    r -= spots[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}
const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function FlashCharacter() {
  const hidden = useFlashStore((s) => s.hidden);
  const setHidden = useFlashStore((s) => s.setHidden);
  const status = useFlashStore((s) => s.status);

  const [spotIndex, setSpotIndex] = useState(0);
  const [expr, setExpr] = useState<FlashExpression>('wave');
  const [scene, setScene] = useState<'free' | 'desk'>('free');
  const [bubble, setBubble] = useState<string | null>(null);
  const [jump, setJump] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const lastSpot = useRef(0);
  const lastExpr = useRef<FlashExpression>('wave');
  const sceneRef = useRef<'free' | 'desk'>('free');
  const reduce = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const [height] = useState(() => {
    if (typeof window === 'undefined') return 205;
    return Math.round(Math.min(249, Math.max(161, window.innerHeight * 0.246)));
  });

  // Appearance driven by the AI status: while Flash is BUILDING, he docks bottom-right and works at the
  // laptop with a rotating "on it" line (he has taken the wheel). Back to idle hands it to the hop loop.
  useEffect(() => {
    if (reduce.current) return;
    if (status === 'building') {
      sceneRef.current = 'desk'; setScene('desk');
      setSpotIndex(0); lastSpot.current = 0;
      setExpr('working');
      setBubble(rand(BUILD_LINES));
      setJump((j) => j + 1);
      const id = window.setInterval(() => setBubble(rand(BUILD_LINES)), 4200);
      return () => window.clearInterval(id);
    }
    sceneRef.current = 'free'; setScene('free'); setBubble(null);
  }, [status]);

  // The hop loop. Paused while hidden, reduced-motion, the menu is open, or Flash is building.
  useEffect(() => {
    reduce.current = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (hidden || reduce.current || menuOpen || status === 'building') {
      window.clearTimeout(timerRef.current);
      return;
    }
    const hop = () => {
      // ~1 in 5 free->desk transitions: Flash docks bottom-right and "works in FlashFX" for a longer beat.
      if (sceneRef.current === 'free' && Math.random() < 0.22) {
        sceneRef.current = 'desk'; setScene('desk');
        setSpotIndex(0); lastSpot.current = 0;
        setExpr('working'); setBubble(null);
        setJump((j) => j + 1);
        timerRef.current = window.setTimeout(hop, DESK_MIN_MS + Math.random() * (DESK_MAX_MS - DESK_MIN_MS));
        return;
      }
      sceneRef.current = 'free'; setScene('free');
      let next = pickWeighted(SPOTS);
      if (next === lastSpot.current) next = (next + 1) % SPOTS.length;
      lastSpot.current = next;
      let e = rand(FLASH_EXPRESSIONS);
      if (e === lastExpr.current) e = FLASH_EXPRESSIONS[(FLASH_EXPRESSIONS.indexOf(e) + 1) % FLASH_EXPRESSIONS.length];
      lastExpr.current = e;
      setSpotIndex(next);
      setExpr(e);
      // A line now and then, only on an upright spot (a rotated bubble would be unreadable).
      setBubble(SPOTS[next].rot === 0 && Math.random() < 0.4 ? rand(FLASH_LINES) : null);
      setJump((j) => j + 1);
      timerRef.current = window.setTimeout(hop, JUMP_MIN_MS + Math.random() * (JUMP_MAX_MS - JUMP_MIN_MS));
    };
    timerRef.current = window.setTimeout(hop, 3500 + Math.random() * 3000);
    return () => window.clearTimeout(timerRef.current);
  }, [hidden, menuOpen, status]);

  if (hidden) return null;

  const spot = SPOTS[spotIndex];
  const still = reduce.current;
  const bubbleBelow = spot.key.startsWith('top');

  const onFlashClick = () => {
    // Snap upright + bottom-right so the menu reads correctly, then open it.
    if (spot.rot !== 0) { setSpotIndex(0); lastSpot.current = 0; }
    setBubble(null);
    setMenuOpen(true);
  };

  return (
    <>
      <div
        aria-hidden
        style={{ position: 'fixed', pointerEvents: 'none', zIndex: 30, transform: `rotate(${spot.rot}deg)`, transformOrigin: 'center', ...spot.anchor }}
      >
        <style>{`
          @keyframes flashchar-pop { 0%{transform:scale(.55);opacity:0} 60%{transform:scale(1.06);opacity:1} 100%{transform:scale(1);opacity:1} }
          @keyframes flashchar-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
          @keyframes flashchar-bubble { 0%{opacity:0;transform:translate(-50%,4px) scale(.9)} 100%{opacity:1;transform:translate(-50%,0) scale(1)} }
        `}</style>
        <div key={jump} style={{ position: 'relative', animation: still ? undefined : 'flashchar-pop 420ms cubic-bezier(.34,1.56,.64,1)' }}>
          {bubble && !still && (
            <div
              style={{
                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                top: bubbleBelow ? 'calc(100% + 6px)' : undefined,
                bottom: bubbleBelow ? undefined : 'calc(100% + 6px)',
                background: '#101826', color: '#e6edf5', border: '1px solid #2a3a50',
                borderRadius: 12, padding: '7px 11px', fontSize: 12, lineHeight: 1.25,
                whiteSpace: 'nowrap', maxWidth: 220, boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
                animation: 'flashchar-bubble 240ms ease-out both',
              }}
            >
              {bubble}
              <span style={{
                position: 'absolute', left: '50%', marginLeft: -5, width: 10, height: 10,
                top: bubbleBelow ? -5 : undefined, bottom: bubbleBelow ? undefined : -5,
                background: '#101826', borderRight: '1px solid #2a3a50', borderBottom: '1px solid #2a3a50',
                transform: `rotate(${bubbleBelow ? 225 : 45}deg)`,
              }} />
            </div>
          )}
          <div
            onClick={onFlashClick}
            style={{ pointerEvents: 'auto', cursor: 'pointer', animation: still ? undefined : 'flashchar-bob 3.4s ease-in-out infinite', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))' }}
            title="Flash"
          >
            <FlashAvatar expression={expr} height={height} scene={scene} />
          </div>
        </div>
      </div>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 31, background: 'transparent' }} />
          <div
            style={{
              position: 'fixed', right: 24, bottom: height + 26, zIndex: 32, pointerEvents: 'auto',
              width: 190, background: '#0f1826', border: '1px solid #2a3a50', borderRadius: 12,
              boxShadow: '0 14px 34px rgba(0,0,0,0.55)', padding: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e6edf5', marginBottom: 2 }}>Flash</div>
            <div style={{ fontSize: 11, color: '#8aa0ba', marginBottom: 10 }}>Bring me back anytime from the Flash tab.</div>
            <button
              onClick={() => { setHidden(true); setMenuOpen(false); }}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #3a2a2a', background: '#2a1416', color: '#ffb4b4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Hide Flash
            </button>
          </div>
        </>
      )}
    </>
  );
}
