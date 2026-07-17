/**
 * KeyframeDefaultsService
 *
 * Settings panel tab — Tab 4 of 6 planned settings tabs.
 * Future tabs (Tab 5–6) should be added as sibling components
 * and registered in EditorSettingsModal.tsx alongside this one.
 *
 * Controls all visual properties of the curves editor and keyframe handles:
 *   - Property-specific curve line colors (sourced from PROPERTY_COLORS in InterpolationGraph.tsx)
 *   - Curve line widths and opacities
 *   - Keyframe handle shape, size, and colors
 *   - Bezier control point appearance
 *   - Editor background and grid colors
 *
 * Persistence: localStorage key `flashfx_keyframe_defaults`.
 * All changes are saved immediately on update; no Apply button required.
 *
 * CSS variable names are mirrored in InterpolationGraph.tsx.
 * Colors are applied by writing CSS custom properties to :root —
 * the graph reads var(--ffx-kf-*) at paint time, never hardcoded values.
 */

const STORAGE_KEY = 'flashfx_keyframe_defaults';

// ─── CSS variable names ────────────────────────────────────────────────────────
export const KF_CSS_VARS = {
  // Property curve colors — defaults are PROPERTY_COLORS from InterpolationGraph.tsx
  colorX:             '--ffx-kf-color-x',
  colorY:             '--ffx-kf-color-y',
  colorWidth:         '--ffx-kf-color-width',
  colorHeight:        '--ffx-kf-color-height',
  colorRotation:      '--ffx-kf-color-rotation',
  colorOpacity:       '--ffx-kf-color-opacity',
  colorFill:          '--ffx-kf-color-fill',
  colorStroke:        '--ffx-kf-color-stroke',
  colorStrokeWidth:   '--ffx-kf-color-strokewidth',
  colorBorderRadius:  '--ffx-kf-color-borderradius',
  colorScaleX:        '--ffx-kf-color-scalex',
  colorScaleY:        '--ffx-kf-color-scaley',
  colorShadowBlur:    '--ffx-kf-color-shadowblur',
  colorShadowX:       '--ffx-kf-color-shadowx',
  colorShadowY:       '--ffx-kf-color-shadowy',
  colorFontSize:      '--ffx-kf-color-fontsize',
  colorLetterSpacing: '--ffx-kf-color-letterspacing',
  colorDefault:       '--ffx-kf-color-default',
  colorSelected:      '--ffx-kf-color-selected',
  colorHandleLine:    '--ffx-kf-color-handleline',

  // Curve line style
  curveWidth:         '--ffx-kf-curve-width',
  curveWidthSelected: '--ffx-kf-curve-width-selected',
  handleLineWidth:    '--ffx-kf-handle-line-width',
  handleLineOpacity:  '--ffx-kf-handle-line-opacity',
  curveOpacity:       '--ffx-kf-curve-opacity',
  inactiveCurveOpacity: '--ffx-kf-inactive-curve-opacity',

  // Keyframe handle
  handleSize:               '--ffx-kf-handle-size',
  handleFill:               '--ffx-kf-handle-fill',
  handleBorder:             '--ffx-kf-handle-border',
  handleBorderWidth:        '--ffx-kf-handle-border-width',
  handleSelectedFill:       '--ffx-kf-handle-selected-fill',
  handleSelectedBorder:     '--ffx-kf-handle-selected-border',
  handleSelectedMultiplier: '--ffx-kf-handle-selected-multiplier',
  handleHoveredFill:        '--ffx-kf-handle-hovered-fill',

  // Control points
  cpSize:        '--ffx-kf-cp-size',
  cpFill:        '--ffx-kf-cp-fill',
  cpBorder:      '--ffx-kf-cp-border',
  cpBorderWidth: '--ffx-kf-cp-border-width',
  cpSelectedFill:'--ffx-kf-cp-selected-fill',

  // Editor background / grid
  editorBg:     '--ffx-kf-editor-bg',
  gridColor:    '--ffx-kf-grid-color',
  gridOpacity:  '--ffx-kf-grid-opacity',
  zeroLineColor:'--ffx-kf-zero-line-color',
  zeroLineWidth:'--ffx-kf-zero-line-width',
  playheadColor:'--ffx-kf-playhead-color',
} as const;

// ─── Handle shape type ─────────────────────────────────────────────────────────
export type HandleShape = 'diamond' | 'square' | 'circle' | 'rounded-square' | 'triangle';

// ─── Settings Interface ────────────────────────────────────────────────────────
export interface KeyframeSettings {
  // Property curve colors
  colorX: string;
  colorY: string;
  colorWidth: string;
  colorHeight: string;
  colorRotation: string;
  colorOpacity: string;
  colorFill: string;
  colorStroke: string;
  colorStrokeWidth: string;
  colorBorderRadius: string;
  colorScaleX: string;
  colorScaleY: string;
  colorShadowBlur: string;
  colorShadowX: string;
  colorShadowY: string;
  colorFontSize: string;
  colorLetterSpacing: string;
  /** Fallback color for properties not in the explicit map */
  colorDefault: string;
  /** Curve color when that segment/track is selected */
  colorSelected: string;
  /** Color of bezier tangent handle lines */
  colorHandleLine: string;

  // Curve line style
  /** Default stroke width for curve polylines (0.8 in source) */
  curveWidth: number;
  /** Stroke width when segment is selected (1.2 in source) */
  curveWidthSelected: number;
  /** Width of bezier tangent lines (1 in source) */
  handleLineWidth: number;
  /** Opacity of bezier tangent lines (0.6 in source) */
  handleLineOpacity: number;
  /** Overall opacity of curve lines (1 = 100%) */
  curveOpacity: number;
  /** Opacity of non-selected curves when one is selected (0.3 glow in source) */
  inactiveCurveOpacity: number;

  // Keyframe handle shape & style
  /** Shape used for keyframe handles in the curves editor */
  handleShape: HandleShape;
  /** Radius/half-size of handles in SVG units (5 in source — getRhombusPoints default) */
  handleSize: number;
  /** Fill of unselected keyframe handle circles (color in source) */
  handleFill: string;
  /** Border/stroke of unselected handles (#1f2937 in source) */
  handleBorder: string;
  /** Border width of unselected handles (0.5 in source) */
  handleBorderWidth: number;
  /** Fill of selected handles (#22c55e in source) */
  handleSelectedFill: string;
  /** Border of selected handles (#1f2937 in source) */
  handleSelectedBorder: string;
  /** Size multiplier for selected handles vs unselected (r=3 vs r=2, so 1.5) */
  handleSelectedMultiplier: number;
  /** Fill when mouse hovers a handle */
  handleHoveredFill: string;

  // Bezier control point handles (the polygon rhombus at end of tangent lines)
  /** Shape of bezier control point handles */
  cpShape: HandleShape;
  /** Size (half-size) of bezier control points (5 in source — same as handle) */
  cpSize: number;
  /** Fill of bezier control points (#ffffff in source) */
  cpFill: string;
  /** Border of bezier control points (#1f2937 in source) */
  cpBorder: string;
  /** Border width of bezier control points (1 in source) */
  cpBorderWidth: number;
  /** Fill of selected bezier control points */
  cpSelectedFill: string;
  /** When true, moving one bezier handle mirror-moves the other */
  linkedHandles: boolean;

  // Editor background / grid
  /** Background fill of the SVG curves editor (#1f2937 in source) */
  editorBg: string;
  /** Stroke color of grid pattern lines (#000000 in source) */
  gridColor: string;
  /** Opacity of grid lines, 0–100 (0.3 strokeWidth used, effectively ~30%) */
  gridOpacity: number;
  /** Color of the zero-value reference line */
  zeroLineColor: string;
  /** Stroke width of the zero line */
  zeroLineWidth: number;
  /** Color of the playhead vertical line */
  playheadColor: string;
}

// ─── Factory Defaults ──────────────────────────────────────────────────────────
// Every value is sourced directly from the hardcoded values in InterpolationGraph.tsx
// as read during the audit of that file.
export const KF_FACTORY_DEFAULTS: KeyframeSettings = {
  // PROPERTY_COLORS from InterpolationGraph.tsx lines 33-51
  colorX:             '#ef4444',
  colorY:             '#f97316',
  colorWidth:         '#eab308',
  colorHeight:        '#84cc16',
  colorRotation:      '#22c55e',
  colorOpacity:       '#14b8a6',
  colorFill:          '#06b6d4',
  colorStroke:        '#0ea5e9',
  colorStrokeWidth:   '#3b82f6',
  colorBorderRadius:  '#6366f1',
  colorScaleX:        '#8b5cf6',
  colorScaleY:        '#a855f7',
  colorShadowBlur:    '#d946ef',
  colorShadowX:       '#ec4899',
  colorShadowY:       '#f43f5e',
  colorFontSize:      '#fb7185',
  colorLetterSpacing: '#fda4af',
  colorDefault:       '#f59e0b',   // fallback: line 305 `|| '#f59e0b'`
  colorSelected:      '#22c55e',   // line 381 `isSelected ? '#22c55e' : color`
  colorHandleLine:    '#ffffff',   // line 451 `stroke="#ffffff"`

  // Curve line style — from lines 382, 394, 453-454
  curveWidth:           0.8,
  curveWidthSelected:   1.2,
  handleLineWidth:      1,
  handleLineOpacity:    0.6,       // line 454 `opacity="0.6"`
  curveOpacity:         1.0,
  inactiveCurveOpacity: 0.3,       // line 396 selected glow `opacity="0.3"`

  // Keyframe handle — from lines 424-428, 297-299
  handleShape:              'circle',   // line 421-429: rendered as <circle>
  handleSize:               5,          // line 297 getRhombusPoints default size=5; r=2/3 for circles
  handleFill:               '#ef4444',  // line 425 `fill={isSelected ? '#22c55e' : color}` — color=PROPERTY_COLORS[prop]
  handleBorder:             '#1f2937',  // line 426 `stroke="#1f2937"`
  handleBorderWidth:        0.5,        // line 427 unselected `strokeWidth={isSelected ? 1 : 0.5}`
  handleSelectedFill:       '#22c55e',  // line 425
  handleSelectedBorder:     '#1f2937',  // line 426
  handleSelectedMultiplier: 1.5,        // r=3 selected vs r=2 unselected → 1.5×
  handleHoveredFill:        '#f59e0b',  // amber accent, not explicitly in code but logical hover

  // Bezier control point handles — from lines 456-463
  cpShape:        'diamond',     // line 456: rendered as <polygon> with getRhombusPoints = diamond
  cpSize:         5,             // line 457 getRhombusPoints(..., 5)
  cpFill:         '#ffffff',     // line 458 `fill="#ffffff"`
  cpBorder:       '#1f2937',     // line 459 `stroke="#1f2937"`
  cpBorderWidth:  1,             // line 460 `strokeWidth="1"`
  cpSelectedFill: '#22c55e',     // matches selected color
  linkedHandles:  true,

  // Editor background / grid — from lines 569-577
  editorBg:     '#1f2937',   // line 572 `fill="#1f2937"`
  gridColor:    '#000000',   // line 569 `stroke="#000000"`
  gridOpacity:  30,          // strokeWidth 0.3 effectively dimmed grid
  zeroLineColor:'#4b5563',   // line 577 border rect `stroke="#4b5563"`
  zeroLineWidth: 1,
  playheadColor: '#f59e0b',  // app accent color
};

// ─── Service Class ─────────────────────────────────────────────────────────────

class KeyframeDefaultsService {
  getDefaults(): KeyframeSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...KF_FACTORY_DEFAULTS, ...(JSON.parse(raw) as Partial<KeyframeSettings>) };
      }
    } catch {
      // Corrupt localStorage — fall through to factory defaults
    }
    return { ...KF_FACTORY_DEFAULTS };
  }

  update(patch: Partial<KeyframeSettings>): void {
    const current = this.getDefaults();
    const next = { ...current, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage quota — skip silently
    }
    this.applyCssVars(next);
  }

  resetToFactory(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.applyCssVars(KF_FACTORY_DEFAULTS);
  }

  getFactoryDefaults(): KeyframeSettings {
    return { ...KF_FACTORY_DEFAULTS };
  }

  applyCssVars(s: KeyframeSettings): void {
    this.writeVars(document.documentElement, s);
  }

  writeVars(el: HTMLElement, s: KeyframeSettings): void {
    el.style.setProperty(KF_CSS_VARS.colorX,             s.colorX);
    el.style.setProperty(KF_CSS_VARS.colorY,             s.colorY);
    el.style.setProperty(KF_CSS_VARS.colorWidth,         s.colorWidth);
    el.style.setProperty(KF_CSS_VARS.colorHeight,        s.colorHeight);
    el.style.setProperty(KF_CSS_VARS.colorRotation,      s.colorRotation);
    el.style.setProperty(KF_CSS_VARS.colorOpacity,       s.colorOpacity);
    el.style.setProperty(KF_CSS_VARS.colorFill,          s.colorFill);
    el.style.setProperty(KF_CSS_VARS.colorStroke,        s.colorStroke);
    el.style.setProperty(KF_CSS_VARS.colorStrokeWidth,   s.colorStrokeWidth);
    el.style.setProperty(KF_CSS_VARS.colorBorderRadius,  s.colorBorderRadius);
    el.style.setProperty(KF_CSS_VARS.colorScaleX,        s.colorScaleX);
    el.style.setProperty(KF_CSS_VARS.colorScaleY,        s.colorScaleY);
    el.style.setProperty(KF_CSS_VARS.colorShadowBlur,    s.colorShadowBlur);
    el.style.setProperty(KF_CSS_VARS.colorShadowX,       s.colorShadowX);
    el.style.setProperty(KF_CSS_VARS.colorShadowY,       s.colorShadowY);
    el.style.setProperty(KF_CSS_VARS.colorFontSize,      s.colorFontSize);
    el.style.setProperty(KF_CSS_VARS.colorLetterSpacing, s.colorLetterSpacing);
    el.style.setProperty(KF_CSS_VARS.colorDefault,       s.colorDefault);
    el.style.setProperty(KF_CSS_VARS.colorSelected,      s.colorSelected);
    el.style.setProperty(KF_CSS_VARS.colorHandleLine,    s.colorHandleLine);

    el.style.setProperty(KF_CSS_VARS.curveWidth,           String(s.curveWidth));
    el.style.setProperty(KF_CSS_VARS.curveWidthSelected,   String(s.curveWidthSelected));
    el.style.setProperty(KF_CSS_VARS.handleLineWidth,       String(s.handleLineWidth));
    el.style.setProperty(KF_CSS_VARS.handleLineOpacity,     String(s.handleLineOpacity));
    el.style.setProperty(KF_CSS_VARS.curveOpacity,          String(s.curveOpacity));
    el.style.setProperty(KF_CSS_VARS.inactiveCurveOpacity,  String(s.inactiveCurveOpacity));

    el.style.setProperty(KF_CSS_VARS.handleSize,               String(s.handleSize));
    el.style.setProperty(KF_CSS_VARS.handleFill,               s.handleFill);
    el.style.setProperty(KF_CSS_VARS.handleBorder,             s.handleBorder);
    el.style.setProperty(KF_CSS_VARS.handleBorderWidth,        String(s.handleBorderWidth));
    el.style.setProperty(KF_CSS_VARS.handleSelectedFill,       s.handleSelectedFill);
    el.style.setProperty(KF_CSS_VARS.handleSelectedBorder,     s.handleSelectedBorder);
    el.style.setProperty(KF_CSS_VARS.handleSelectedMultiplier, String(s.handleSelectedMultiplier));
    el.style.setProperty(KF_CSS_VARS.handleHoveredFill,        s.handleHoveredFill);

    el.style.setProperty(KF_CSS_VARS.cpSize,        String(s.cpSize));
    el.style.setProperty(KF_CSS_VARS.cpFill,        s.cpFill);
    el.style.setProperty(KF_CSS_VARS.cpBorder,      s.cpBorder);
    el.style.setProperty(KF_CSS_VARS.cpBorderWidth, String(s.cpBorderWidth));
    el.style.setProperty(KF_CSS_VARS.cpSelectedFill,s.cpSelectedFill);

    el.style.setProperty(KF_CSS_VARS.editorBg,     s.editorBg);
    el.style.setProperty(KF_CSS_VARS.gridColor,    s.gridColor);
    el.style.setProperty(KF_CSS_VARS.gridOpacity,  String(s.gridOpacity / 100));
    el.style.setProperty(KF_CSS_VARS.zeroLineColor,s.zeroLineColor);
    el.style.setProperty(KF_CSS_VARS.zeroLineWidth,String(s.zeroLineWidth));
    el.style.setProperty(KF_CSS_VARS.playheadColor,s.playheadColor);
  }
}

export const keyframeDefaultsService = new KeyframeDefaultsService();
