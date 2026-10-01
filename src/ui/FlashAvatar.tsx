import type { ReactNode } from 'react';
import type { FlashExpression } from './flashExpressions';

// Flash, drawn entirely in SVG (no raster images, fully transparent, crisp at any size, and every
// expression is controllable). The head is the real FlashFX mark: a gold-gradient ring + the official
// lightning bolt (reused verbatim from public/flashfx-mark.svg) on a dark badge. The bolt stays the pure
// logo (no cartoon face drawn over it); emotion comes from the body pose + little accent marks + a head
// tilt. The expression list lives in ./flashExpressions; add a feeling there and handle it in pose().

const SLEEVE = '#26364d'; // navy suit
const HAND = '#e9d9c5';   // light hand
const ARM_W = 9;

// One arm = a rounded stroke from the shoulder to the hand, plus a round hand.
function Arm({ d, hx, hy }: { d: string; hx: number; hy: number }) {
  return (
    <g>
      <path d={d} stroke={SLEEVE} strokeWidth={ARM_W} strokeLinecap="round" fill="none" />
      <circle cx={hx} cy={hy} r={6} fill={HAND} />
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

// Returns the arms, any floating accents, and a transform for the head (tilt/scale/bob) per feeling.
function pose(e: FlashExpression): { arms: ReactNode; extras: ReactNode; head: string } {
  switch (e) {
    case 'wave':
      return {
        arms: <>{armDownL}<Arm d="M76 98 Q92 84 96 60" hx={96} hy={58} /></>,
        extras: <g stroke="url(#ffxGold)" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.8}><path d="M104 52 Q108 56 106 62" /><path d="M108 46 Q114 52 111 60" /></g>,
        head: '',
      };
    case 'thumbsUp':
      return {
        arms: <>{armDownL}<Arm d="M76 100 Q86 92 90 85" hx={90} hy={84} /><rect x={87} y={74} width={6} height={9} rx={3} fill={HAND} /></>,
        extras: <Star x={102} y={70} s={5} />,
        head: '',
      };
    case 'point':
      return {
        arms: <>{armDownL}<Arm d="M76 102 Q92 101 104 98" hx={104} hy={98} /><rect x={104} y={95} width={11} height={5} rx={2.5} fill={HAND} /></>,
        extras: null,
        head: '',
      };
    case 'thinking':
      return {
        arms: <>{armDownL}<Arm d="M76 100 Q70 90 66 83" hx={66} hy={82} /></>,
        extras: <g fill="#9fb2c9"><circle cx={92} cy={40} r={2.2} /><circle cx={99} cy={33} r={2.8} /><circle cx={107} cy={25} r={3.4} /></g>,
        head: 'rotate(-8 60 52)',
      };
    case 'working':
      return {
        arms: <><Arm d="M44 100 Q48 114 53 120" hx={53} hy={120} /><Arm d="M76 100 Q72 114 67 120" hx={67} hy={120} /></>,
        extras: <><path d="M86 70 q3 4 0 8 q-3 4 0 8" stroke="#8fd3ff" strokeWidth={1.6} fill="none" opacity={0.8} /><path d="M96 24 Q92 30 96 34 Q100 30 96 24 Z" fill="#8fd3ff" /></>,
        head: '',
      };
    case 'celebrate':
      return {
        arms: <><Arm d="M44 98 Q36 78 38 58" hx={38} hy={56} /><Arm d="M76 98 Q84 78 82 58" hx={82} hy={56} /></>,
        extras: <><Star x={24} y={30} s={5} /><Star x={96} y={26} s={6} /><rect x={48} y={18} width={4} height={4} rx={1} fill="#ff5a7a" transform="rotate(20 50 20)" /><rect x={70} y={14} width={4} height={4} rx={1} fill="#8fd3ff" transform="rotate(-15 72 16)" /><circle cx={60} cy={12} r={2} fill="url(#ffxGold)" /></>,
        head: '',
      };
    case 'love':
      return {
        arms: <>{armDownL}{armDownR}</>,
        extras: <><Heart x={40} y={26} s={5} /><Heart x={82} y={22} s={6} /><Heart x={60} y={14} s={4} /></>,
        head: 'rotate(6 60 52)',
      };
    case 'wow':
      return {
        arms: <><Arm d="M44 100 Q30 100 23 93" hx={23} hy={92} /><Arm d="M76 100 Q90 100 97 93" hx={97} hy={92} /></>,
        extras: <text x={60} y={20} textAnchor="middle" fontSize={20} fontWeight={800} fill="url(#ffxGold)">!</text>,
        head: 'scale(1.06) translate(-3.6 -3.1)',
      };
    case 'cool':
      return {
        arms: <><Arm d="M44 100 Q46 116 50 121" hx={52} hy={121} />{armDownR}</>,
        extras: <Star x={98} y={40} s={4} />,
        head: '',
      };
    case 'shrug':
      return {
        arms: <><Arm d="M44 100 Q32 104 27 97" hx={27} hy={96} /><Arm d="M76 100 Q88 104 93 97" hx={93} hy={96} /></>,
        extras: <text x={60} y={20} textAnchor="middle" fontSize={18} fontWeight={800} fill="#9fb2c9">?</text>,
        head: 'rotate(-5 60 52)',
      };
    case 'facepalm':
      return {
        arms: <>{armDownL}<Arm d="M76 96 Q70 70 60 57" hx={58} hy={54} /></>,
        extras: <path d="M90 50 Q86 56 90 60 Q94 56 90 50 Z" fill="#8fd3ff" />,
        head: 'rotate(9 60 52) translate(0 2)',
      };
    case 'sleep':
      return {
        arms: <>{armDownL}{armDownR}</>,
        extras: <g fill="#9fb2c9" fontWeight={700}><text x={88} y={40} fontSize={8}>z</text><text x={96} y={31} fontSize={11}>z</text><text x={106} y={20} fontSize={14}>z</text></g>,
        head: 'rotate(14 60 52) translate(0 3)',
      };
    case 'hype':
      return {
        arms: <><Arm d="M44 98 Q40 80 45 66" hx={45} hy={64} /><Arm d="M76 98 Q80 80 75 66" hx={75} hy={64} /></>,
        extras: <g stroke="url(#ffxGold)" strokeWidth={2} strokeLinecap="round" opacity={0.8}><path d="M30 60 l-6 -4" /><path d="M90 60 l6 -4" /><path d="M28 72 l-7 0" /><path d="M92 72 l7 0" /></g>,
        head: 'translate(0 -1)',
      };
    case 'idle':
    default:
      return { arms: <>{armDownL}{armDownR}</>, extras: null, head: '' };
  }
}

export function FlashAvatar({ expression = 'idle', height = 150 }: { expression?: FlashExpression; height?: number }) {
  const { arms, extras, head } = pose(expression);
  return (
    <svg viewBox="0 0 120 150" height={height} width={height * (120 / 150)} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Flash">
      <defs>
        <linearGradient id="ffxGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc83d" />
          <stop offset="1" stopColor="#f7b500" />
        </linearGradient>
      </defs>

      {/* Body: a rounded suited torso with a white collar + gold tie. Drawn first so the head overlaps it. */}
      <path d="M38 146 C34 112 40 90 60 90 C80 90 86 112 82 146 Z" fill={SLEEVE} />
      <path d="M53 92 L60 104 L67 92" stroke="#eef3f8" strokeWidth={3} fill="none" strokeLinejoin="round" />
      <path d="M60 104 L56 122 L60 130 L64 122 Z" fill="url(#ffxGold)" />

      {arms}

      {/* Head = the FlashFX mark. Dark badge, gold ring, official bolt in gold. */}
      <g transform={head}>
        <circle cx={60} cy={52} r={30} fill="#0a0f16" stroke="url(#ffxGold)" strokeWidth={4} />
        <polygon points="13 3.5 5 13.5 11 13.5 10 20.5 19 9.5 12.5 9.5" fill="url(#ffxGold)" transform="translate(39.6 27.6) scale(1.7)" />
      </g>

      {extras}
    </svg>
  );
}
