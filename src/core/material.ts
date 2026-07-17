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
  if (!config || !config.enabled || config.layers.length === 0) return fallback;

  const firstLayer = config.layers.find((l) => l.opacity > 0);
  if (!firstLayer || firstLayer.colorStops.length === 0) return fallback;

  const sorted = [...firstLayer.colorStops].sort((a, b) => a.position - b.position);
  const first = sorted[0];
  return hexToVec4(first.color, (first.opacity / 100) * (firstLayer.opacity / 100));
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
  if (!config || !config.enabled || config.layers.length === 0) {
    return { kind: 0, color: fallback, layers: [] };
  }

  const layers: ResolvedFillLayer[] = [];
  for (const layer of config.layers) {
    if (layers.length >= FILL_MAX_LAYERS) break;
    const layerOpacity = clamp01(layer.opacity / 100);
    if (layerOpacity <= 0) continue;

    const sorted = [...layer.colorStops]
      .sort((a, b) => a.position - b.position)
      .slice(0, FILL_MAX_STOPS);
    if (sorted.length === 0) continue;

    const stops = sorted.map((s) => ({
      // Fold both the stop opacity and the layer opacity into alpha so the
      // shader composites each layer as a straight-alpha source.
      color: hexToVec4(s.color, clamp01(s.opacity / 100) * layerOpacity),
      position: clamp01(s.position / 100),
    }));

    const angleDeg = layer.type === 'linear'
      ? (layer.angle ?? (layer.direction ? getLinearAngle(layer.direction) : 180))
      : 0;
    const [cx, cy] = radialCenter(layer.radialType);

    layers.push({
      gradientType: layer.type === 'radial' ? 1 : 0,
      angle: angleDeg * (Math.PI / 180),
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
