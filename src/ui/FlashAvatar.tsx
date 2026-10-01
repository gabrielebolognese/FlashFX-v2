import type { ReactNode } from 'react';
import type { FlashExpression } from './flashExpressions';

// Flash, drawn entirely in SVG (no raster images, fully transparent, crisp at any size, and every
// expression is controllable). The head is the real FlashFX mark: a metallic gold ring + the official
// lightning bolt (reused verbatim from public/flashfx-mark.svg) on a glossy dark badge. The bolt stays
// the pure logo (no cartoon face drawn over it); emotion comes from the body pose + little accent marks +
// a head tilt. The expression list lives in ./flashExpressions; add a feeling there and handle in pose().
//
// Proportions: the HEAD is drawn unscaled (circle r30 at 60,52). The BODY (torso + arms + body-tied
// accents) is drawn at the same authored coordinates but wrapped in BODY_SCALE, which scales it ~2x
// around the neck (60,90) so the figure is not head-heavy. Accents above the head (hearts, !, ?, zzz,
// thought dots) are drawn UNSCALED so they stay pinned to the head; accents tied to a hand (wave arcs,
// motion lines, the thumbs-up star) are drawn INSIDE the scaled group (bodyExtras) so they track the hand.
const BODY_SCALE = 'translate(60 90) scale(1.95) translate(-60 -90)';

const ARM_W = 9;

// One arm = a rounded gradient stroke from the shoulder to the hand, with a soft under-shadow for
// roundness, a white shirt cuff, and a shaded hand with a highlight.
function Arm({ d, hx, hy }: { d: string; hx: number; hy: number }) {
  return (
    <g>
      <path d={d} stroke="#0e1722" strokeWidth={ARM_W + 1.5} strokeLinecap="round" fill="none" opacity={0.45} />
      <path d={d} stroke="url(#ffxSleeve)" strokeWidth={ARM_W} strokeLinecap="round" fill="none" />
      <path d={d} stroke="#ffffff" strokeWidth={ARM_W} strokeLinecap="round" fill="none" opacity={0.08} strokeDasharray="0.5 7" />
      <circle cx={hx} cy={hy} r={6.6} fill="#eef3f8" />
      <circle cx={hx} cy={hy} r={5.4} fill="url(#ffxHand)" />
      <circle cx={hx - 1.5} cy={hy - 1.7} r={1.5} fill="#ffffff" opacity={0.4} />
    </g>
  );
}

const armDownL = <Arm d="M44 100 Q40 116 41 126" hx={41} hy={126} />;
const armDownR = <Arm d="M76 100 Q80 116 79 126" hx={79} hy={126} />;

function Star({ x, y, s = 5, c = 'url(#ffxGold)' }: { x: number; y: number; s?: number; c?: string }) {
  return <path d={`M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z`} fill={c} />;
}

function Heart({ x, y, s = 5 }: { x: number; y: number; s?: number }) {
  return <path d={`M${x} ${y + s * 0.9} C ${x - s * 1.4} ${y - s * 0.4}, ${x - s * 0.5} ${y - s * 1.2}, ${x} ${y - s * 0.3} C ${x + s * 0.5} ${y - s * 1.2}, ${x + s * 1.4} ${y - s * 0.4}, ${x} ${y + s * 0.9} Z`} fill="#ff5a7a" />;
}

const HAND = 'url(#ffxHand)';

// Returns the arms, floating accents, a head transform, and whether the accents are hand-tied (so they
// scale with the body) or head-tied (drawn unscaled, pinned to the head).
function pose(e: FlashExpression): { arms: ReactNode; extras: ReactNode; head: string; bodyExtras: boolean } {
  switch (e) {
    case 'wave':
      return {
        arms: <>{armDownL}<Arm d="M76 98 Q92 84 96 60" hx={96} hy={58} /></>,
        extras: <g stroke="url(#ffxGold)" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.8}><path d="M104 52 Q108 56 106 62" /><path d="M108 46 Q114 52 111 60" /></g>,
        head: '', bodyExtras: true,
      };
    case 'thumbsUp':
      return {
        arms: <>{armDownL}<Arm d="M76 100 Q86 92 90 85" hx={90} hy={84} /><rect x={87} y={74} width={6} height={9} rx={3} fill={HAND} /></>,
        extras: <Star x={102} y={70} s={5} />,
        head: '', bodyExtras: true,
      };
    case 'point':
      return {
        arms: <>{armDownL}<Arm d="M76 102 Q92 101 104 98" hx={104} hy={98} /><rect x={104} y={95} width={11} height={5} rx={2.5} fill={HAND} /></>,
        extras: null, head: '', bodyExtras: false,
      };
    case 'thinking':
      return {
        arms: <>{armDownL}<Arm d="M76 100 Q70 90 66 83" hx={66} hy={82} /></>,
        extras: <g fill="#9fb2c9"><circle cx={92} cy={40} r={2.2} /><circle cx={99} cy={33} r={2.8} /><circle cx={107} cy={25} r={3.4} /></g>,
        head: 'rotate(-8 60 52)', bodyExtras: false,
      };
    case 'working':
      return {
        arms: <><Arm d="M44 100 Q48 114 53 120" hx={53} hy={120} /><Arm d="M76 100 Q72 114 67 120" hx={67} hy={120} /></>,
        extras: <><path d="M86 70 q3 4 0 8 q-3 4 0 8" stroke="#8fd3ff" strokeWidth={1.6} fill="none" opacity={0.8} /><path d="M96 24 Q92 30 96 34 Q100 30 96 24 Z" fill="#8fd3ff" /></>,
        head: '', bodyExtras: true,
      };
    case 'celebrate':
      return {
        arms: <><Arm d="M44 98 Q36 78 38 58" hx={38} hy={56} /><Arm d="M76 98 Q84 78 82 58" hx={82} hy={56} /></>,
        extras: <><Star x={24} y={30} s={5} /><Star x={96} y={26} s={6} /><rect x={48} y={18} width={4} height={4} rx={1} fill="#ff5a7a" transform="rotate(20 50 20)" /><rect x={70} y={14} width={4} height={4} rx={1} fill="#8fd3ff" transform="rotate(-15 72 16)" /><circle cx={60} cy={12} r={2} fill="url(#ffxGold)" /></>,
        head: '', bodyExtras: false,
      };
    case 'love':
      return {
        arms: <>{armDownL}{armDownR}</>,
        extras: <><Heart x={40} y={26} s={5} /><Heart x={82} y={22} s={6} /><Heart x={60} y={14} s={4} /></>,
        head: 'rotate(6 60 52)', bodyExtras: false,
      };
    case 'wow':
      return {
        arms: <><Arm d="M44 100 Q30 100 23 93" hx={23} hy={92} /><Arm d="M76 100 Q90 100 97 93" hx={97} hy={92} /></>,
        extras: <text x={60} y={20} textAnchor="middle" fontSize={20} fontWeight={800} fill="url(#ffxGold)">!</text>,
        head: 'scale(1.06) translate(-3.6 -3.1)', bodyExtras: false,
      };
    case 'cool':
      return {
        arms: <><Arm d="M44 100 Q46 116 50 121" hx={52} hy={121} />{armDownR}</>,
        extras: <Star x={98} y={40} s={4} />,
        head: '', bodyExtras: true,
      };
    case 'shrug':
      return {
        arms: <><Arm d="M44 100 Q32 104 27 97" hx={27} hy={96} /><Arm d="M76 100 Q88 104 93 97" hx={93} hy={96} /></>,
        extras: <text x={60} y={20} textAnchor="middle" fontSize={18} fontWeight={800} fill="#9fb2c9">?</text>,
        head: 'rotate(-5 60 52)', bodyExtras: false,
      };
    case 'facepalm':
      return {
        arms: <>{armDownL}<Arm d="M76 96 Q70 70 60 57" hx={58} hy={54} /></>,
        extras: <path d="M90 50 Q86 56 90 60 Q94 56 90 50 Z" fill="#8fd3ff" />,
        head: 'rotate(9 60 52) translate(0 2)', bodyExtras: false,
      };
    case 'sleep':
      return {
        arms: <>{armDownL}{armDownR}</>,
        extras: <g fill="#9fb2c9" fontWeight={700}><text x={88} y={40} fontSize={8}>z</text><text x={96} y={31} fontSize={11}>z</text><text x={106} y={20} fontSize={14}>z</text></g>,
        head: 'rotate(14 60 52) translate(0 3)', bodyExtras: false,
      };
    case 'hype':
      return {
        arms: <><Arm d="M44 98 Q40 80 45 66" hx={45} hy={64} /><Arm d="M76 98 Q80 80 75 66" hx={75} hy={64} /></>,
        extras: <g stroke="url(#ffxGold)" strokeWidth={2} strokeLinecap="round" opacity={0.8}><path d="M30 60 l-6 -4" /><path d="M90 60 l6 -4" /><path d="M28 72 l-7 0" /><path d="M92 72 l7 0" /></g>,
        head: '', bodyExtras: true,
      };
    case 'idle':
    default:
      return { arms: <>{armDownL}{armDownR}</>, extras: null, head: '', bodyExtras: false };
  }
}

const BOLT = '13 3.5 5 13.5 11 13.5 10 20.5 19 9.5 12.5 9.5';

export function FlashAvatar({ expression = 'idle', height = 200 }: { expression?: FlashExpression; height?: number }) {
  const { arms, extras, head, bodyExtras } = pose(expression);
  return (
    <svg viewBox="0 0 120 205" height={height} width={height * (120 / 205)} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Flash">
      <defs>
        <linearGradient id="ffxGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd666" />
          <stop offset="1" stopColor="#f7a400" />
        </linearGradient>
        <linearGradient id="ffxGoldMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe8a0" />
          <stop offset="0.5" stopColor="#f7b500" />
          <stop offset="1" stopColor="#b87d00" />
        </linearGradient>
        <radialGradient id="ffxBadge" cx="0.4" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#273445" />
          <stop offset="0.6" stopColor="#121a24" />
          <stop offset="1" stopColor="#070b11" />
        </radialGradient>
        <linearGradient id="ffxSuit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35496a" />
          <stop offset="1" stopColor="#18232f" />
        </linearGradient>
        <linearGradient id="ffxSleeve" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3b5070" />
          <stop offset="1" stopColor="#1a2634" />
        </linearGradient>
        <radialGradient id="ffxHand" cx="0.38" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#f7ecdb" />
          <stop offset="1" stopColor="#d6bda0" />
        </radialGradient>
        <linearGradient id="ffxTie" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd666" />
          <stop offset="1" stopColor="#d98f00" />
        </linearGradient>
        <pattern id="ffxPin" width="5" height="5" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
        </pattern>
        <filter id="ffxSoft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* BODY (scaled ~2x around the neck so Flash is not head-heavy): pinstriped suit, lapels, white
          collar, gold tie + knot, buttons, the arms, and any hand-tied accents. */}
      <g transform={BODY_SCALE}>
        <path d="M38 146 C34 112 40 90 60 90 C80 90 86 112 82 146 Z" fill="url(#ffxSuit)" />
        <path d="M38 146 C34 112 40 90 60 90 C80 90 86 112 82 146 Z" fill="url(#ffxPin)" />
        <path d="M38 146 C34 112 40 90 60 90 C80 90 86 112 82 146 Z" fill="none" stroke="#0b1119" strokeOpacity="0.35" strokeWidth="2" />
        <path d="M57 92 L48 118" stroke="#1a2635" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M63 92 L72 118" stroke="#1a2635" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M57.4 93 L49 116" stroke="#46608a" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        <path d="M54 90 L60 104 L66 90 Z" fill="#eef3f8" />
        <path d="M54 90 L60 104 L66 90" fill="none" stroke="#c7d2de" strokeWidth="0.8" opacity="0.7" />
        <path d="M57 103 L63 103 L62 108 L58 108 Z" fill="url(#ffxTie)" />
        <path d="M58 108 L56 127 L60 135 L64 127 L62 108 Z" fill="url(#ffxTie)" />
        <path d="M60 109 L60 133" stroke="#ffffff" strokeWidth="1" opacity="0.18" />
        <circle cx="60" cy="120" r="1.7" fill="#0e1620" /><circle cx="59.4" cy="119.4" r="0.5" fill="#ffffff" opacity="0.4" />
        <circle cx="60" cy="132" r="1.7" fill="#0e1620" /><circle cx="59.4" cy="131.4" r="0.5" fill="#ffffff" opacity="0.4" />
        {arms}
        {bodyExtras && extras}
      </g>

      {/* soft neck shadow where the head meets the collar (unscaled, pinned to the head) */}
      <ellipse cx="60" cy="85" rx="20" ry="5.5" fill="#05080d" opacity="0.4" filter="url(#ffxSoft)" />

      {/* Head = the FlashFX mark: glossy dark badge, metallic ring, official bolt in gold (with a lift). */}
      <g transform={head}>
        <circle cx="60" cy="52" r="30" fill="url(#ffxBadge)" stroke="url(#ffxGoldMetal)" strokeWidth="4.5" />
        <circle cx="60" cy="52" r="27.6" fill="none" stroke="#ffe8a0" strokeWidth="1" opacity="0.4" />
        <circle cx="60" cy="52" r="32.2" fill="none" stroke="#6d4a00" strokeWidth="1" opacity="0.5" />
        <ellipse cx="50" cy="40" rx="15" ry="8" fill="#ffffff" opacity="0.1" transform="rotate(-25 50 40)" />
        <polygon points={BOLT} fill="#05080d" opacity="0.45" transform="translate(40.4 28.9) scale(1.7)" />
        <polygon points={BOLT} fill="url(#ffxGold)" transform="translate(39.6 27.6) scale(1.7)" />
      </g>

      {!bodyExtras && extras}
    </svg>
  );
}
