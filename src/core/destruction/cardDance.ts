// Card dance (B23) - pure tile-grid assembly (leaf module, no imports). Splits a layer into a
// cols x rows grid of tiles and animates each tile in/out with a per-tile delay driven by a value
// MAP (like AE CC Card Dance: a gradient/luma map orders the flip-in). Frame-pure: the transform is a
// pure function of frame, so scrubbing is byte-identical. Deterministic + unit-tested
// (verify:destruction). The rendered tiles are the B23-render consumer.

export interface Tile {
  col: number;
  row: number;
  /** Tile centre offset from the layer centre (centred coords). */
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** Sub-region of the source in 0..1 UV (for the renderer to crop each tile). */
  u0: number; v0: number; u1: number; v1: number;
}

/** The cols x rows tile grid over a `width` x `height` layer (centred at 0). */
export function tileGrid(width: number, height: number, cols: number, rows: number): Tile[] {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const tw = width / c, th = height / r;
  const tiles: Tile[] = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const u0 = col / c, u1 = (col + 1) / c;
      const v0 = row / r, v1 = (row + 1) / r;
      tiles.push({
        col, row,
        cx: -width / 2 + tw * (col + 0.5),
        cy: -height / 2 + th * (row + 0.5),
        width: tw, height: th,
        u0, v0, u1, v1,
      });
    }
  }
  return tiles;
}

export type CardMap = 'leftToRight' | 'topToBottom' | 'diagonal' | 'radial' | 'random';

/** A tile's 0..1 order value from the chosen map (0 animates first, 1 last). */
export function tileMapValue(tile: Tile, cols: number, rows: number, map: CardMap): number {
  const fx = cols > 1 ? tile.col / (cols - 1) : 0;
  const fy = rows > 1 ? tile.row / (rows - 1) : 0;
  switch (map) {
    case 'leftToRight': return fx;
    case 'topToBottom': return fy;
    case 'diagonal': return (fx + fy) / 2;
    case 'radial': {
      const dx = fx - 0.5, dy = fy - 0.5;
      return Math.min(1, Math.hypot(dx, dy) / Math.SQRT1_2);
    }
    case 'random': {
      // deterministic hash of (col,row) -> 0..1
      let h = (tile.col * 73856093) ^ (tile.row * 19349663);
      h = (h ^ (h >>> 13)) >>> 0;
      return (h % 10000) / 10000;
    }
    default: return 0;
  }
}

export interface CardDanceParams {
  cols: number;
  rows: number;
  map: CardMap;
  /** Frame the sequence starts. */
  startFrame: number;
  /** Frames each tile takes to settle. */
  tileDuration: number;
  /** Total frames the stagger spreads across (last tile starts near startFrame + stagger). */
  stagger: number;
  /** 'in' = assemble to identity by the end; 'out' = disassemble from identity. */
  direction: 'in' | 'out';
  /** How far a tile starts from its resting place (px). */
  distance: number;
  fps: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface TileTransform { dx: number; dy: number; rotation: number; opacity: number; scale: number }

/**
 * A tile's transform at `frame`. The tile's start time = startFrame + mapValue*stagger; it eases from
 * a displaced/rotated/faded state to identity over `tileDuration` ('in'), or the reverse ('out'). At a
 * settled 'in' frame the transform is identity (dx=dy=rot=0, opacity=scale=1) so the layer reassembles
 * exactly. Frame-pure.
 */
export function cardDanceTransform(tile: Tile, frame: number, p: CardDanceParams): TileTransform {
  const cols = Math.max(1, Math.floor(p.cols)), rows = Math.max(1, Math.floor(p.rows));
  const order = tileMapValue(tile, cols, rows, p.map);
  const tileStart = p.startFrame + order * p.stagger;
  const raw = (frame - tileStart) / Math.max(1, p.tileDuration);
  const prog = clamp01(raw); // 0 = not started, 1 = settled
  // progress: 0 -> fully displaced, 1 -> identity (for 'in'); reversed for 'out'
  const assembled = p.direction === 'in' ? smooth(prog) : 1 - smooth(prog);
  const away = 1 - assembled; // 0 at rest, 1 fully displaced
  // deterministic per-tile displacement direction
  let h = (tile.col * 73856093) ^ (tile.row * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  const ang = (h % 360) * (Math.PI / 180);
  return {
    dx: Math.cos(ang) * p.distance * away,
    dy: Math.sin(ang) * p.distance * away,
    rotation: away * ((h % 2 ? 1 : -1) * 90),
    opacity: assembled,
    scale: 0.3 + 0.7 * assembled,
  };
}
