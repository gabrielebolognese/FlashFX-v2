import type {
  MaterialFillLayer,
  MaterialColorStop,
  MaterialBlendMode,
  MaterialLinearDirection,
  MaterialRadialType,
  ShapeMaterialConfig,
  ShapePatternConfig,
  ShapePatternType,
  ResolvedFill,
  ResolvedFillLayer,
  ResolvedPattern,
  Vec4,
} from './types';

let _materialCtr = 0;
function _uid(): string {
  return `mat_${Date.now()}_${++_materialCtr}`;
}

export function createColorStop(color: string, position: number, opacity: number = 100): MaterialColorStop {
  return { id: _uid(), color, opacity, position };
}

export function createMaterialLayer(): MaterialFillLayer {
  return {
    id: _uid(),
    type: 'linear',
    direction: 'top-to-bottom',
    colorStops: [
      createColorStop('#3B82F6', 0),
      createColorStop('#06B6D4', 100),
    ],
    blendMode: 'normal',
    opacity: 100,
  };
}

export function createSolidMaterialLayer(hex: string): MaterialFillLayer {
  return {
    id: _uid(),
    type: 'linear',
    direction: 'top-to-bottom',
    colorStops: [createColorStop(hex, 0), createColorStop(hex, 100)],
    blendMode: 'normal',
    opacity: 100,
  };
}

export function createDefaultMaterial(): ShapeMaterialConfig {
  return { enabled: false, layers: [] };
}

export function createDefaultPattern(): ShapePatternConfig {
  return {
    enabled: false,
    patternType: 'dots',
    color: '#FFFFFF',
    backgroundColor: 'transparent',
    size: 8,
    spacing: 12,
    angle: 0,
    opacity: 100,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hexToVec4(hex: string, alpha: number = 1): Vec4 {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [r, g, b, Math.max(0, Math.min(1, alpha))];
}

export function vec4ToHex(c: Vec4): string {
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(c[0])}${toHex(c[1])}${toHex(c[2])}`;
}

export function getLinearAngle(direction: MaterialLinearDirection): number {
  switch (direction) {
    case 'top-to-bottom': return 180;
    case 'bottom-to-top': return 0;
    case 'left-to-right': return 90;
    case 'right-to-left': return 270;
    case 'diagonal-tl-br': return 135;
    case 'diagonal-tr-bl': return 225;
  }
}

export function getRadialPosition(radialType: MaterialRadialType): string {
  switch (radialType) {
    case 'center': return '50% 50%';
    case 'top-left': return '0% 0%';
    case 'top-right': return '100% 0%';
    case 'bottom-left': return '0% 100%';
    case 'bottom-right': return '100% 100%';
  }
}

export function getMaterialGradientCSS(layer: MaterialFillLayer): string {
  const sorted = [...layer.colorStops].sort((a, b) => a.position - b.position);
  const stopParts = sorted.map((s) => `${hexToRgba(s.color, s.opacity / 100)} ${s.position}%`);
  const stopStr = stopParts.join(', ');

  if (layer.type === 'linear') {
    const angle = layer.angle ?? (layer.direction ? getLinearAngle(layer.direction) : 180);
    return `linear-gradient(${angle}deg, ${stopStr})`;
  }

  const position = layer.radialType ? getRadialPosition(layer.radialType) : '50% 50%';
  return `radial-gradient(circle at ${position}, ${stopStr})`;
}

export interface MaterialStyle {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundBlendMode?: string;
}

export function generateShapeMaterialStyle(config: ShapeMaterialConfig | undefined): MaterialStyle {
  if (!config || !config.enabled || config.layers.length === 0) return {};

  if (config.layers.length === 1) {
    const layer = config.layers[0];
    if (layer.colorStops.length === 1) {
      return { backgroundColor: hexToRgba(layer.colorStops[0].color, (layer.colorStops[0].opacity / 100) * (layer.opacity / 100)) };
    }
    if (
      layer.colorStops.length === 2 &&
      layer.colorStops[0].color === layer.colorStops[1].color &&
      layer.colorStops[0].opacity === layer.colorStops[1].opacity
    ) {
      return { backgroundColor: hexToRgba(layer.colorStops[0].color, (layer.colorStops[0].opacity / 100) * (layer.opacity / 100)) };
    }
  }

  const images: string[] = [];
  const blendModes: string[] = [];
  for (const layer of config.layers) {
    if (layer.opacity <= 0) continue;
    images.push(getMaterialGradientCSS(layer));
    blendModes.push(layer.blendMode);
  }

  if (images.length === 0) return {};
  return { backgroundImage: images.join(', '), backgroundBlendMode: blendModes.join(', ') };
}

export function resolveDominantColor(config: ShapeMaterialConfig | undefined, fallback: Vec4): Vec4 {
  if (!materialActive(config)) return fallback;

  for (const raw of config.layers) {
    const layer = normalizeMaterialLayer(raw);
    if (!layer || layer.opacity <= 0) continue;
    const first = layer.stops[0];
    return stopColor(first.color, (first.opacity / 100) * (layer.opacity / 100));
  }
  return fallback;
}

// ── B63: tolerant reading of agent-written materials ─────────────────────────────────────────────
// A materialConfig written through updateLayerProperty is persisted as-is (validation does not deep-
// check it), and an agent naturally leaves out ids, a layer opacity or a stop opacity, writes an RGBA
// array instead of a hex string, or writes opacity / position as 0..1 fractions instead of the model's
// 0..100 percent. Those used to resolve to NaN alpha or a 1 % opacity, so the shape vanished (the r07
// "radial material renders nothing" gap was a layer opacity 1 with stops at 0 / 1). The readers below
// fall back to the model's defaults (opacity 100, enabled unless false, stops spread evenly) and read
// 0..1 values as fractions when the whole group is written that way, so a loose material renders like
// its complete twin. Complete percent configs resolve exactly as before.

/** True when the config has layers and is not explicitly disabled. */
export function materialActive(config: ShapeMaterialConfig | undefined): config is ShapeMaterialConfig {
  return !!config && typeof config === 'object' && config.enabled !== false && Array.isArray(config.layers) && config.layers.length > 0;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A stop colour: '#rgb' / '#rrggbb' / '#rrggbbaa' or an RGB(A) (0..1) array; the alpha multiplies `alpha`. */
export function stopColor(color: unknown, alpha: number): Vec4 {
  const a = clamp01(isNum(alpha) ? alpha : 1);
  if (Array.isArray(color) && color.length >= 3 && color.every(isNum)) {
    const c = color as number[];
    return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2]), a * (c.length >= 4 ? clamp01(c[3]) : 1)];
  }
  if (typeof color === 'string') {
    const h = color.trim().replace('#', '');
    if (/^[0-9a-fA-F]{8}$/.test(h)) {
      const v = hexToVec4(h.slice(0, 6), a);
      return [v[0], v[1], v[2], a * (parseInt(h.slice(6, 8), 16) / 255)];
    }
    if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) return hexToVec4(h, a);
  }
  return [0, 0, 0, a];
}

/** A material layer read with defaults: opacity / stop opacity / position in percent, stops sorted. */
export interface NormalizedMaterialLayer {
  opacity: number;
  stops: { color: unknown; opacity: number; position: number }[];
}

/**
 * Normalise one (possibly agent-written) material layer, or null when it has no usable stops.
 * Opacities (the layer's and every stop's) are read as 0..1 fractions when every one that is given is
 * <= 1 (a 1 % layer is invisible, so a layer written that way meant fractions); positions likewise when
 * every position is <= 1 and the last one is exactly 1 (or the opacities were fractions too).
 */
export function normalizeMaterialLayer(layer: MaterialFillLayer | undefined): NormalizedMaterialLayer | null {
  if (!layer || typeof layer !== 'object' || !Array.isArray(layer.colorStops) || layer.colorStops.length === 0) return null;
  const raw = layer.colorStops.filter((s) => s && typeof s === 'object');
  if (raw.length === 0) return null;
  const opac = [layer.opacity, ...raw.map((s) => s.opacity)].filter(isNum);
  const fracOpacity = opac.length > 0 && opac.every((v) => v <= 1);
  const pos = raw.map((s) => s.position).filter(isNum);
  const fracPos = pos.length > 0 && pos.every((v) => v <= 1) && (fracOpacity || (pos.length >= 2 && Math.max(...pos) === 1));
  const ok = (v: unknown, frac: boolean, d: number) => (isNum(v) ? (frac ? v * 100 : v) : d);
  const n = raw.length;
  const stops = raw
    .map((s, i) => ({
      color: s.color as unknown,
      opacity: ok(s.opacity, fracOpacity, 100),
      position: ok(s.position, fracPos, n > 1 ? (i / (n - 1)) * 100 : 0),
    }))
    .sort((a, b) => a.position - b.position);
  return { opacity: ok(layer.opacity, fracOpacity, 100), stops };
}

// GPU fill limits. The shader reserves fixed array slots per shape, so these
// must stay in sync with the WGSL constants in renderer.ts (FILL_MAX_LAYERS,
// FILL_MAX_STOPS). 8 layers matches the material model's MAX_LAYERS; 8 stops
// covers virtually all real gradients (extra stops are clamped).
export const FILL_MAX_LAYERS = 8;
export const FILL_MAX_STOPS = 8;

// Must match MaterialBlendMode order and the blend switch in the shader.
const BLEND_MODE_INDEX: Record<MaterialBlendMode, number> = {
  normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5,
  'color-dodge': 6, 'color-burn': 7, 'hard-light': 8, 'soft-light': 9,
  difference: 10, exclusion: 11,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function radialCenter(radialType?: MaterialRadialType): [number, number] {
  switch (radialType) {
    case 'top-left': return [0, 0];
    case 'top-right': return [1, 0];
    case 'bottom-left': return [0, 1];
    case 'bottom-right': return [1, 1];
    case 'center':
    default: return [0.5, 0.5];
  }
}

// Flatten a ShapeMaterialConfig into a GPU-ready ResolvedFill. Disabled/empty
// configs (or configs whose layers are all invisible) collapse to a solid fill
// using `fallback`, so the shader always has a valid color.
export function resolveShapeFill(config: ShapeMaterialConfig | undefined, fallback: Vec4): ResolvedFill {
  if (!materialActive(config)) {
    return { kind: 0, color: fallback, layers: [] };
  }

  const layers: ResolvedFillLayer[] = [];
  for (const layer of config.layers) {
    if (layers.length >= FILL_MAX_LAYERS) break;
    // B63: tolerant read (defaults, 0..1 fractions, RGBA arrays); complete percent layers unchanged.
    const norm = normalizeMaterialLayer(layer);
    if (!norm) continue;
    const layerOpacity = clamp01(norm.opacity / 100);
    if (layerOpacity <= 0) continue;

    const sorted = norm.stops.slice(0, FILL_MAX_STOPS);

    const stops = sorted.map((s) => ({
      // Fold both the stop opacity and the layer opacity into alpha so the
      // shader composites each layer as a straight-alpha source.
      color: stopColor(s.color, clamp01(s.opacity / 100) * layerOpacity),
      position: clamp01(s.position / 100),
    }));

    const angleDeg = layer.type === 'linear'
      ? (layer.angle ?? (layer.direction ? getLinearAngle(layer.direction) : 180))
      : layer.type === 'conic' ? (Number.isFinite(layer.angle) ? (layer.angle as number) : 0) : 0;
    const [rcx, rcy] = radialCenter(layer.radialType);
    // B74: an explicit centre (0..1 in the shape box) wins over the radialType preset.
    const cx = typeof layer.centerX === 'number' && Number.isFinite(layer.centerX) ? layer.centerX : rcx;
    const cy = typeof layer.centerY === 'number' && Number.isFinite(layer.centerY) ? layer.centerY : rcy;

    layers.push({
      gradientType: layer.type === 'radial' ? 1 : layer.type === 'conic' ? 2 : 0,
      angle: (Number.isFinite(angleDeg) ? angleDeg : 0) * (Math.PI / 180),
      centerX: cx,
      centerY: cy,
      blendMode: BLEND_MODE_INDEX[layer.blendMode] ?? 0,
      stops,
    });
  }

  if (layers.length === 0) return { kind: 0, color: fallback, layers: [] };
  return { kind: 1, color: fallback, layers };
}

// Must match the pattern branch order in the shader (renderer.ts). 'custom' has
// no shader equivalent and disables GPU rendering.
const PATTERN_TYPE_INDEX: Record<ShapePatternType, number> = {
  dots: 0, lines: 1, grid: 2, diagonal: 3, chevron: 4, custom: -1,
};

// Flatten a ShapePatternConfig into GPU-ready numbers. Disabled configs, or
// custom-SVG patterns (which can't be evaluated in a shader), resolve to
// `enabled: false` so the shader skips them.
export function resolveShapePattern(config: ShapePatternConfig | undefined): ResolvedPattern | undefined {
  if (!config || !config.enabled) return undefined;
  const patternType = PATTERN_TYPE_INDEX[config.patternType];
  if (patternType < 0) return undefined; // custom: unsupported on GPU

  const hasBackground = !!config.backgroundColor && config.backgroundColor !== 'transparent';
  return {
    enabled: true,
    patternType,
    color: hexToVec4(config.color, 1),
    hasBackground,
    backgroundColor: hasBackground ? hexToVec4(config.backgroundColor, 1) : [0, 0, 0, 0],
    size: Math.max(0, config.size),
    spacing: Math.max(0, config.spacing),
    angle: (config.angle ?? 0) * (Math.PI / 180),
    opacity: clamp01(config.opacity / 100),
  };
}

function generatePatternSvgContent(config: ShapePatternConfig): string {
  const tile = Math.max(1, config.size + config.spacing);
  const c = config.color;
  const s = config.size;

  switch (config.patternType) {
    case 'dots':
      return `<circle cx="${tile / 2}" cy="${tile / 2}" r="${s / 2}" fill="${c}"/>`;
    case 'lines':
      return `<line x1="0" y1="${tile / 2}" x2="${tile}" y2="${tile / 2}" stroke="${c}" stroke-width="${s}"/>`;
    case 'grid': {
      const w = Math.max(1, s / 2);
      return `<line x1="0" y1="${tile / 2}" x2="${tile}" y2="${tile / 2}" stroke="${c}" stroke-width="${w}"/>` +
             `<line x1="${tile / 2}" y1="0" x2="${tile / 2}" y2="${tile}" stroke="${c}" stroke-width="${w}"/>`;
    }
    case 'diagonal':
      return `<line x1="0" y1="${tile}" x2="${tile}" y2="0" stroke="${c}" stroke-width="${s}"/>`;
    case 'chevron':
      return `<polyline points="0,${tile / 2} ${tile / 2},0 ${tile},${tile / 2}" fill="none" stroke="${c}" stroke-width="${s}"/>`;
    case 'custom':
      return config.customSvg ?? '';
  }
}

export function generatePatternSvg(config: ShapePatternConfig): string {
  const tile = Math.max(1, config.size + config.spacing);
  const bg = config.backgroundColor && config.backgroundColor !== 'transparent'
    ? `<rect width="100%" height="100%" fill="${config.backgroundColor}"/>`
    : '';
  const content = generatePatternSvgContent(config);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}">${bg}<g transform="rotate(${config.angle} ${tile / 2} ${tile / 2})">${content}</g></svg>`;
}

export function generatePatternDataUri(config: ShapePatternConfig): string {
  const svg = generatePatternSvg(config);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function generatePatternBackgroundUrl(config: ShapePatternConfig): string {
  return `url("${generatePatternDataUri(config)}")`;
}

export const PATTERN_TYPES: { value: ShapePatternType; label: string }[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'lines', label: 'Lines' },
  { value: 'grid', label: 'Grid' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'chevron', label: 'Chevron' },
  { value: 'custom', label: 'Custom' },
];

export const LINEAR_DIRECTIONS: { value: MaterialLinearDirection; label: string }[] = [
  { value: 'top-to-bottom', label: 'Top -> Bottom' },
  { value: 'bottom-to-top', label: 'Bottom -> Top' },
  { value: 'left-to-right', label: 'Left -> Right' },
  { value: 'right-to-left', label: 'Right -> Left' },
  { value: 'diagonal-tl-br', label: 'TL -> BR' },
  { value: 'diagonal-tr-bl', label: 'TR -> BL' },
];

export const RADIAL_POSITIONS: { value: MaterialRadialType; label: string }[] = [
  { value: 'center', label: 'Center' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

export const BLEND_MODES: { value: MaterialFillLayer['blendMode']; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
];

export const MAX_LAYERS = 8;
export const MAX_COLOR_STOPS = 10;
