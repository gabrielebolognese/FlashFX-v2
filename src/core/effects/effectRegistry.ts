// Single source of truth for the image effect stack.
//
// Each catalog filter (see ui/panels/filters/filterDefinitions.ts) that is
// implemented via the generic effect stack has one entry here. The `type` is a
// FROZEN numeric id: it is serialized into saved projects AND matched by a WGSL
// `case` in the renderer's IMAGE_SHADER. Never renumber or reuse a type.
//
// The 5 "legacy" filters (brightness/contrast/saturation/exposure/gamma) are NOT
// in this registry — they keep routing to `layer.filters.*` and their dedicated
// uniform fields. Everything else becomes a LayerEffect.

// Which renderer stage an effect runs in (all share one ordered effects[] stack
// and the same uniform slots; each slot matches exactly one stage's WGSL switch):
//   'color'   — class A, per-pixel, AFTER the texture sample.
//   'warp'    — class B, remaps the sampling UV BEFORE the sample.
//   'spatial' — class C, texture-aware, runs right after the base sample and can
//               re-read the texture (chromatic multi-tap, convolution, morphology).
//   'wire'    — duplicates an existing real pass (Blur/Glow); 'legacy' — the 5
//               fixed-uniform filters.
export type EffectClass = 'color' | 'warp' | 'spatial' | 'wire' | 'legacy';

export interface EffectDef {
  /** Matches the filter id in filterDefinitions.ts. */
  id: string;
  /** Frozen numeric id — matches the WGSL case and is serialized. */
  type: number;
  klass: EffectClass;
  /** Number of meaningful params (max 7). */
  paramCount: number;
  /** Default params used when the effect is first created. */
  defaults: number[];
}

// Filters that render through the original fixed uniform fields, not the stack.
export const LEGACY_FILTER_IDS: readonly string[] = [
  'brightness', 'contrast', 'saturation', 'exposure', 'gamma',
];

// ── Type id allocation (FROZEN) ──
// 100–199: class A (per-pixel color) + spatial B3. 200–299: class B (UV warp) +
// spatial C1/C2. 300+: reserved. Ranges:
//   A1 100–119, A2 120–139, A3 140–160, cellular-pattern color 161–162.
//   B1 geometry/radial 200–218, B2 waves/tiling/cellular 220–234.
//   B3 chromatic/retro 240–250, C1 convolution 260–273, C2 morph/matte 280–289,
//   W lighting 290–294, C3 painterly 300–312 (all 'spatial' — texture-aware
//   single-pass, not pre-sample warps).
// (Batch W's blur/glow filters have NO type id here — they wire to layer.blur/glow
//  via wireEffects.ts and the renderer's real RTT passes.)
// These numbers are imported by the renderer to build the WGSL `switch` cases, so
// registry and shader can never drift.
export const EFFECT_TYPE = {
  // A1 — tone / color grade (100–119)
  vibrance: 100, hueShift: 101, temperature: 102, tint: 103, whiteBalance: 104,
  blacks: 105, whites: 106, shadows: 107, highlights: 108, midtones: 109,
  lift: 110, gammaColor: 111, gain: 112, levels: 113,
  curvesRGB: 114, curvesR: 115, curvesG: 116, curvesB: 117,
  posterize: 118, solarize: 119,
  // A2 — stylization & palette mapping (120–139)
  threshold: 120, invert: 121, colorize: 122, duotone: 123, tritone: 124,
  gradientMap: 125, sepia: 126, monochrome: 127, bwMixer: 128, colorBalance: 129,
  splitToning: 130, falseColor: 131, thermalVision: 132, infrared: 133,
  selectiveColor: 134, replaceColor: 135, channelMixer: 136,
  extractRed: 137, extractGreen: 138, extractBlue: 139,
  // A3 — channel/alpha math + procedural + grain (140–160)
  alphaOnly: 140, swapChannels: 141, opacity: 142, alphaThreshold: 143,
  lumaKey: 144, spillSuppression: 145, gradientFill: 146, noiseFill: 147,
  patternFill: 148, checkerboard: 149, dots: 150, stripes: 151, plasma: 152,
  clouds: 153, addNoise: 154, filmGrain: 155, gaussianNoise: 156,
  saltAndPepper: 157, perlinNoise: 158, fractalNoise: 159, dust: 160,
  // Cellular pattern generators (class A color — produce a pattern, not a warp)
  voronoiPattern: 161, cellularPattern: 162,
  // B1 — geometry & radial distortion (200–218), UV warp (class B)
  rotate: 200, flipH: 201, flipV: 202, scale: 203, crop: 204, perspective: 205,
  shear: 206, skew: 207, affineTransform: 208, offset: 209, lensDistortion: 210,
  barrelDistortion: 211, pincushion: 212, fisheye: 213, spherize: 214, bulge: 215,
  pinch: 216, twirl: 217, polarCoordinates: 218,
  // B2 — waves, tiling, pixelation, cellular (220–234), UV warp (class B)
  wave: 220, ripple: 221, zigzag: 222, turbulentDisplace: 223, perspectiveWarp: 224,
  mirror: 225, kaleidoscope: 226, pixelate: 227, mosaic: 228, hexPixelate: 229,
  blockPixelation: 230, crystallize: 231, voronoi: 232, facet: 233, pointillize: 234,
  // B3 — chromatic & retro (240–250). Multi-tap: re-sample the texture at per-channel
  // offset UVs. Run in the texture-aware "spatial" stage (class C-single-pass).
  rgbSplit: 240, channelOffset: 241, chromaticAberration: 242, refraction: 243,
  heatDistortion: 244, digitalGlitch: 245, vhs: 246, vhsNoise: 247, crtMonitor: 248,
  scanlines: 249, scanlineNoise: 250,
  // C1 — convolution: sharpen + edge detect (260–273). Single-pass 3x3+ neighbour
  // taps read straight from the texture (no RTT yet). Also spatial stage.
  sharpen: 260, unsharpMask: 261, highPass: 262, edgeEnhance: 263, detailEnhance: 264,
  clarity: 265, localContrast: 266, sobel: 267, laplacian: 268, outline: 269,
  findEdges: 270, glowEdges: 271, emboss: 272, edgeDetectColor: 273,
  // C2 — morphological & matte (280–289). Disc-sampled (constant tap count); the
  // 2-pass ops (opening/closing) are single-pass approximations pending RTT.
  dilate: 280, erode: 281, opening: 282, closing: 283, distanceTransform: 284,
  matteExpansion: 285, matteShrink: 286, featherAlpha: 287, alphaBlur: 288,
  channelBlur: 289,
  // W (lighting) — single-pass radial light shafts in the spatial stage (290–294).
  // The blur/glow half of batch W is NOT here: those route to layer.blur/glow via
  // src/core/effects/wireEffects.ts (real RTT), not the WGSL switch.
  lightRays: 290, sunRays: 291, lightWrap: 292, lensFlare: 293, specularHighlight: 294,
  // C3 — artistic / painterly (300–312), spatial stage (Kuwahara / edge×posterize /
  // screen-space hatch & halftone / voronoi glass).
  oilPainting: 300, watercolor: 301, pencilSketch: 302, ink: 303, comic: 304,
  cartoon: 305, posterPaint: 306, chalk: 307, halftone: 308, crossHatch: 309,
  woodcut: 310, stainedGlass: 311, paintDaubs: 312,
} as const;

export const EFFECT_DEFS: EffectDef[] = [
  { id: 'vibrance',    type: EFFECT_TYPE.vibrance,    klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'hueShift',    type: EFFECT_TYPE.hueShift,    klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'temperature', type: EFFECT_TYPE.temperature, klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'tint',        type: EFFECT_TYPE.tint,        klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'whiteBalance',type: EFFECT_TYPE.whiteBalance,klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'blacks',      type: EFFECT_TYPE.blacks,      klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'whites',      type: EFFECT_TYPE.whites,      klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'shadows',     type: EFFECT_TYPE.shadows,     klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'highlights',  type: EFFECT_TYPE.highlights,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'midtones',    type: EFFECT_TYPE.midtones,    klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'lift',        type: EFFECT_TYPE.lift,        klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'gammaColor',  type: EFFECT_TYPE.gammaColor,  klass: 'color', paramCount: 1, defaults: [1] },
  { id: 'gain',        type: EFFECT_TYPE.gain,        klass: 'color', paramCount: 1, defaults: [1] },
  { id: 'levels',      type: EFFECT_TYPE.levels,      klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'curvesRGB',   type: EFFECT_TYPE.curvesRGB,   klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'curvesR',     type: EFFECT_TYPE.curvesR,     klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'curvesG',     type: EFFECT_TYPE.curvesG,     klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'curvesB',     type: EFFECT_TYPE.curvesB,     klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'posterize',   type: EFFECT_TYPE.posterize,   klass: 'color', paramCount: 1, defaults: [8] },
  { id: 'solarize',    type: EFFECT_TYPE.solarize,    klass: 'color', paramCount: 1, defaults: [0.5] },

  // A2 — stylization & palette mapping
  { id: 'threshold',     type: EFFECT_TYPE.threshold,     klass: 'color', paramCount: 1, defaults: [0.5] },
  { id: 'invert',        type: EFFECT_TYPE.invert,        klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'negative',      type: EFFECT_TYPE.invert,        klass: 'color', paramCount: 1, defaults: [0] }, // alias of invert
  { id: 'colorize',      type: EFFECT_TYPE.colorize,      klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'duotone',       type: EFFECT_TYPE.duotone,       klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'tritone',       type: EFFECT_TYPE.tritone,       klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'gradientMap',   type: EFFECT_TYPE.gradientMap,   klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'sepia',         type: EFFECT_TYPE.sepia,         klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'monochrome',    type: EFFECT_TYPE.monochrome,    klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'bwMixer',       type: EFFECT_TYPE.bwMixer,       klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'colorBalance',  type: EFFECT_TYPE.colorBalance,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'splitToning',   type: EFFECT_TYPE.splitToning,   klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'falseColor',    type: EFFECT_TYPE.falseColor,    klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'thermalVision', type: EFFECT_TYPE.thermalVision, klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'infrared',      type: EFFECT_TYPE.infrared,      klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'selectiveColor',type: EFFECT_TYPE.selectiveColor,klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'replaceColor',  type: EFFECT_TYPE.replaceColor,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'channelMixer',  type: EFFECT_TYPE.channelMixer,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'extractRed',    type: EFFECT_TYPE.extractRed,    klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'extractGreen',  type: EFFECT_TYPE.extractGreen,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'extractBlue',   type: EFFECT_TYPE.extractBlue,   klass: 'color', paramCount: 1, defaults: [0] },

  // A3 — channel/alpha math + procedural + grain (many read uv + time)
  { id: 'alphaOnly',     type: EFFECT_TYPE.alphaOnly,     klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'swapChannels',  type: EFFECT_TYPE.swapChannels,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'opacity',       type: EFFECT_TYPE.opacity,       klass: 'color', paramCount: 1, defaults: [1] },
  { id: 'alphaThreshold',type: EFFECT_TYPE.alphaThreshold,klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'lumaKey',       type: EFFECT_TYPE.lumaKey,       klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'spillSuppression',type: EFFECT_TYPE.spillSuppression, klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'gradientFill',  type: EFFECT_TYPE.gradientFill,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'noiseFill',     type: EFFECT_TYPE.noiseFill,     klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'patternFill',   type: EFFECT_TYPE.patternFill,   klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'checkerboard',  type: EFFECT_TYPE.checkerboard,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'dots',          type: EFFECT_TYPE.dots,          klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'stripes',       type: EFFECT_TYPE.stripes,       klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'plasma',        type: EFFECT_TYPE.plasma,        klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'clouds',        type: EFFECT_TYPE.clouds,        klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'addNoise',      type: EFFECT_TYPE.addNoise,      klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'filmGrain',     type: EFFECT_TYPE.filmGrain,     klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'gaussianNoise', type: EFFECT_TYPE.gaussianNoise, klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'saltAndPepper', type: EFFECT_TYPE.saltAndPepper, klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'perlinNoise',   type: EFFECT_TYPE.perlinNoise,   klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'fractalNoise',  type: EFFECT_TYPE.fractalNoise,  klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'dust',          type: EFFECT_TYPE.dust,          klass: 'color', paramCount: 1, defaults: [0] },
  // Cellular pattern generators (class A color)
  { id: 'voronoiPattern',type: EFFECT_TYPE.voronoiPattern,klass: 'color', paramCount: 1, defaults: [0] },
  { id: 'cellularPattern',type: EFFECT_TYPE.cellularPattern,klass: 'color', paramCount: 1, defaults: [0] },

  // ── B1: geometry & radial distortion (class B — pre-sample UV warp) ──
  { id: 'rotate',           type: EFFECT_TYPE.rotate,           klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'flipH',            type: EFFECT_TYPE.flipH,            klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'flipV',            type: EFFECT_TYPE.flipV,            klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'scale',            type: EFFECT_TYPE.scale,            klass: 'warp', paramCount: 1, defaults: [1] },
  { id: 'crop',             type: EFFECT_TYPE.crop,             klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'perspective',      type: EFFECT_TYPE.perspective,      klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'shear',            type: EFFECT_TYPE.shear,            klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'skew',             type: EFFECT_TYPE.skew,             klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'affineTransform',  type: EFFECT_TYPE.affineTransform,  klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'offset',           type: EFFECT_TYPE.offset,           klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'lensDistortion',   type: EFFECT_TYPE.lensDistortion,   klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'barrelDistortion', type: EFFECT_TYPE.barrelDistortion, klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'pincushion',       type: EFFECT_TYPE.pincushion,       klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'fisheye',          type: EFFECT_TYPE.fisheye,          klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'spherize',         type: EFFECT_TYPE.spherize,         klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'bulge',            type: EFFECT_TYPE.bulge,            klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'pinch',            type: EFFECT_TYPE.pinch,            klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'twirl',            type: EFFECT_TYPE.twirl,            klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'polarCoordinates', type: EFFECT_TYPE.polarCoordinates, klass: 'warp', paramCount: 1, defaults: [0] },

  // ── B2: waves, tiling, pixelation, cellular (class B — pre-sample UV warp) ──
  { id: 'wave',             type: EFFECT_TYPE.wave,             klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'ripple',           type: EFFECT_TYPE.ripple,           klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'zigzag',           type: EFFECT_TYPE.zigzag,           klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'turbulentDisplace',type: EFFECT_TYPE.turbulentDisplace,klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'perspectiveWarp',  type: EFFECT_TYPE.perspectiveWarp,  klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'mirror',           type: EFFECT_TYPE.mirror,           klass: 'warp', paramCount: 1, defaults: [0] },
  { id: 'kaleidoscope',     type: EFFECT_TYPE.kaleidoscope,     klass: 'warp', paramCount: 1, defaults: [6] },
  { id: 'pixelate',         type: EFFECT_TYPE.pixelate,         klass: 'warp', paramCount: 1, defaults: [1] },
  { id: 'mosaic',           type: EFFECT_TYPE.mosaic,           klass: 'warp', paramCount: 1, defaults: [1] },
  { id: 'hexPixelate',      type: EFFECT_TYPE.hexPixelate,      klass: 'warp', paramCount: 1, defaults: [1] },
  { id: 'blockPixelation',  type: EFFECT_TYPE.blockPixelation,  klass: 'warp', paramCount: 1, defaults: [1] },
  { id: 'crystallize',      type: EFFECT_TYPE.crystallize,      klass: 'warp', paramCount: 1, defaults: [1] },
  { id: 'voronoi',          type: EFFECT_TYPE.voronoi,          klass: 'warp', paramCount: 1, defaults: [1] },
  { id: 'facet',            type: EFFECT_TYPE.facet,            klass: 'warp', paramCount: 1, defaults: [1] },
  { id: 'pointillize',      type: EFFECT_TYPE.pointillize,      klass: 'warp', paramCount: 1, defaults: [1] },

  // ── B3: chromatic & retro (class C single-pass — texture-aware spatial stage) ──
  { id: 'rgbSplit',            type: EFFECT_TYPE.rgbSplit,            klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'rgbSplitMotion',      type: EFFECT_TYPE.rgbSplit,            klass: 'spatial', paramCount: 1, defaults: [0] }, // alias of rgbSplit
  { id: 'channelOffset',       type: EFFECT_TYPE.channelOffset,       klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'chromaticAberration', type: EFFECT_TYPE.chromaticAberration, klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'refraction',          type: EFFECT_TYPE.refraction,          klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'heatDistortion',      type: EFFECT_TYPE.heatDistortion,      klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'digitalGlitch',       type: EFFECT_TYPE.digitalGlitch,       klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'vhs',                 type: EFFECT_TYPE.vhs,                 klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'vhsNoise',            type: EFFECT_TYPE.vhsNoise,            klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'crtMonitor',          type: EFFECT_TYPE.crtMonitor,          klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'scanlines',           type: EFFECT_TYPE.scanlines,           klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'scanlineNoise',       type: EFFECT_TYPE.scanlineNoise,       klass: 'spatial', paramCount: 1, defaults: [0] },

  // ── C1: convolution — sharpen & edge detect (class C single-pass) ──
  { id: 'sharpen',         type: EFFECT_TYPE.sharpen,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'unsharpMask',     type: EFFECT_TYPE.unsharpMask,     klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'highPass',        type: EFFECT_TYPE.highPass,        klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'edgeEnhance',     type: EFFECT_TYPE.edgeEnhance,     klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'detailEnhance',   type: EFFECT_TYPE.detailEnhance,   klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'clarity',         type: EFFECT_TYPE.clarity,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'localContrast',   type: EFFECT_TYPE.localContrast,   klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'sobel',           type: EFFECT_TYPE.sobel,           klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'laplacian',       type: EFFECT_TYPE.laplacian,       klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'outline',         type: EFFECT_TYPE.outline,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'findEdges',       type: EFFECT_TYPE.findEdges,       klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'glowEdges',       type: EFFECT_TYPE.glowEdges,       klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'emboss',          type: EFFECT_TYPE.emboss,          klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'edgeDetectColor', type: EFFECT_TYPE.edgeDetectColor, klass: 'spatial', paramCount: 1, defaults: [0] },

  // ── C2: morphological & matte (class C single-pass) ──
  { id: 'dilate',            type: EFFECT_TYPE.dilate,            klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'erode',             type: EFFECT_TYPE.erode,             klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'opening',           type: EFFECT_TYPE.opening,           klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'closing',           type: EFFECT_TYPE.closing,           klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'distanceTransform', type: EFFECT_TYPE.distanceTransform, klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'matteExpansion',    type: EFFECT_TYPE.matteExpansion,    klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'matteShrink',       type: EFFECT_TYPE.matteShrink,       klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'featherAlpha',      type: EFFECT_TYPE.featherAlpha,      klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'alphaBlur',         type: EFFECT_TYPE.alphaBlur,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'channelBlur',       type: EFFECT_TYPE.channelBlur,       klass: 'spatial', paramCount: 1, defaults: [0] },

  // ── W (lighting): single-pass radial light shafts (class C spatial stage) ──
  { id: 'lightRays',         type: EFFECT_TYPE.lightRays,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'sunRays',           type: EFFECT_TYPE.sunRays,           klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'lightWrap',         type: EFFECT_TYPE.lightWrap,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'lensFlare',         type: EFFECT_TYPE.lensFlare,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'specularHighlight', type: EFFECT_TYPE.specularHighlight, klass: 'spatial', paramCount: 1, defaults: [0] },

  // ── C3: artistic / painterly (class C spatial stage) ──
  { id: 'oilPainting',   type: EFFECT_TYPE.oilPainting,   klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'watercolor',    type: EFFECT_TYPE.watercolor,    klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'pencilSketch',  type: EFFECT_TYPE.pencilSketch,  klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'ink',           type: EFFECT_TYPE.ink,           klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'comic',         type: EFFECT_TYPE.comic,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'cartoon',       type: EFFECT_TYPE.cartoon,       klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'posterPaint',   type: EFFECT_TYPE.posterPaint,   klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'chalk',         type: EFFECT_TYPE.chalk,         klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'halftone',      type: EFFECT_TYPE.halftone,      klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'crossHatch',    type: EFFECT_TYPE.crossHatch,    klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'woodcut',       type: EFFECT_TYPE.woodcut,       klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'stainedGlass',  type: EFFECT_TYPE.stainedGlass,  klass: 'spatial', paramCount: 1, defaults: [0] },
  { id: 'paintDaubs',    type: EFFECT_TYPE.paintDaubs,    klass: 'spatial', paramCount: 1, defaults: [0] },
];

const BY_ID = new Map(EFFECT_DEFS.map((d) => [d.id, d]));

export function getEffectDef(id: string): EffectDef | undefined {
  return BY_ID.get(id);
}

export function isLegacyFilter(id: string): boolean {
  return LEGACY_FILTER_IDS.includes(id);
}

/** A filter id is renderable if it's a legacy filter or has a registry entry. */
export function isFilterImplemented(id: string): boolean {
  return isLegacyFilter(id) || BY_ID.has(id);
}
