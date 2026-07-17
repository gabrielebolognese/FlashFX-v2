/**
 * ShapeDefaultsService
 *
 * Settings panel tab — Tab 3 of 6 planned settings tabs.
 * Stores user-customizable default properties for every shape type.
 *
 * Persistence: localStorage key `flashfx_shape_defaults`.
 * Defaults are read at shape-creation time, not at settings-render time,
 * so changes take effect immediately for the next shape created.
 */

import { DesignElement } from '../types/design';
import { createDefaultMaterial } from '../types/material';

// ─── Extended shape-specific defaults ─────────────────────────────────────────

export interface ShapeGeometryDefaults {
  // Common
  defaultWidth: number;
  defaultHeight: number;
  defaultRotation: number;
  defaultOpacity: number;
  defaultBlendMode: string;
  lockAspectRatio: boolean;

  // Fill
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity: number;

  // Stroke
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokePosition: 'inside' | 'center' | 'outside';
  strokeOpacity: number;
  strokeType: 'solid' | 'dashed' | 'dotted';
  dashLength: number;
  gapLength: number;

  // Shadow
  shadowEnabled: boolean;
  shadowColor: string;
  shadowOpacity: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  shadowSpread: number;
  shadowType: 'drop' | 'inner';

  // Blur
  blurEnabled: boolean;
  blurType: 'gaussian' | 'motion' | 'zoom';
  blurIntensity: number;
  motionBlurDirection: number;
}

export interface RectangleGeometry extends ShapeGeometryDefaults {
  cornerRadius: number;
}

export interface CircleGeometry extends ShapeGeometryDefaults {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
}

export interface LineGeometry extends ShapeGeometryDefaults {
  lineCap: 'butt' | 'round' | 'square';
  arrowStart: boolean;
  arrowEnd: boolean;
  arrowheadType: 'triangle' | 'circle' | 'bar' | 'diamond';
  arrowheadSize: number;
  smoothing: number;
  closePath: boolean;
}

export interface StarGeometry extends ShapeGeometryDefaults {
  starPoints: number;
  starInnerRadius: number;
}

export interface PolygonGeometry extends ShapeGeometryDefaults {
  sideCount: number;
}

export interface TextGeometry extends ShapeGeometryDefaults {
  defaultText: string;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  fontStyle: string;
  textAlign: string;
  verticalAlign: string;
  textColor: string;
  textTransform: string;
}

export interface ButtonGeometry extends ShapeGeometryDefaults {
  cornerRadius: number;
  paddingH: number;
  paddingV: number;
  defaultText: string;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  textAlign: string;
  textColor: string;
}

export interface ChatBubbleGeometry extends ShapeGeometryDefaults {
  cornerRadius: number;
  defaultText: string;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  textAlign: string;
  textColor: string;
}

export interface ChatFrameGeometry extends ShapeGeometryDefaults {
  cornerRadius: number;
}

export interface GradientGeometry extends ShapeGeometryDefaults {
  gradientType: 'linear' | 'radial' | 'conic';
  gradientAngle: number;
  gradientColor1: string;
  gradientColor2: string;
  gradientPosition1: number;
  gradientPosition2: number;
}

export interface AdjustmentLayerGeometry extends ShapeGeometryDefaults {
  adjustmentType: string;
  adjustmentIntensity: number;
}

export interface SvgGeometry extends ShapeGeometryDefaults {
  svgFillColor: string;
  svgStrokeColor: string;
}

export interface AllShapeGeometry {
  rectangle: RectangleGeometry;
  circle: CircleGeometry;
  text: TextGeometry;
  button: ButtonGeometry;
  chatBubble: ChatBubbleGeometry;
  chatFrame: ChatFrameGeometry;
  line: LineGeometry;
  star: StarGeometry;
  gradient: GradientGeometry;
  adjustmentLayer: AdjustmentLayerGeometry;
  svg: SvgGeometry;
}

// ─── Legacy DesignElement-based interface (used by canvasUtils) ────────────────

export interface ShapeDefaults {
  rectangle: Partial<DesignElement>;
  circle: Partial<DesignElement>;
  text: Partial<DesignElement>;
  button: Partial<DesignElement>;
  chatBubble: Partial<DesignElement>;
  chatFrame: Partial<DesignElement>;
  line: Partial<DesignElement>;
  star: Partial<DesignElement>;
  gradient: Partial<DesignElement>;
  adjustmentLayer: Partial<DesignElement>;
  svg: Partial<DesignElement>;
}

const STORAGE_KEY = 'flashfx_shape_defaults';
const GEOMETRY_STORAGE_KEY = 'flashfx_shape_geometry_defaults';

// ─── Base defaults helper ──────────────────────────────────────────────────────

const baseDefaults = (
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
  fillEnabled: boolean,
  strokeEnabled: boolean,
  w: number,
  h: number,
  shadowBlur = 0,
  shadowOffsetY = 4,
  shadowColor = 'rgba(0,0,0,0.3)'
): ShapeGeometryDefaults => ({
  defaultWidth: w,
  defaultHeight: h,
  defaultRotation: 0,
  defaultOpacity: 100,
  defaultBlendMode: 'normal',
  lockAspectRatio: false,
  fillEnabled,
  fillColor,
  fillOpacity: 100,
  strokeEnabled,
  strokeColor,
  strokeWidth,
  strokePosition: 'center',
  strokeOpacity: 100,
  strokeType: 'solid',
  dashLength: 8,
  gapLength: 4,
  shadowEnabled: false,
  shadowColor,
  shadowOpacity: 30,
  shadowOffsetX: 0,
  shadowOffsetY,
  shadowBlur,
  shadowSpread: 0,
  shadowType: 'drop',
  blurEnabled: false,
  blurType: 'gaussian',
  blurIntensity: 10,
  motionBlurDirection: 0,
});

// ─── Factory geometry defaults ─────────────────────────────────────────────────

export const SHAPE_GEOMETRY_FACTORY_DEFAULTS: AllShapeGeometry = {
  rectangle: {
    ...baseDefaults('#404040', '#404040', 2, true, false, 800, 500),
    cornerRadius: 0,
  },
  circle: {
    ...baseDefaults('#404040', '#404040', 2, true, false, 600, 600),
    lockAspectRatio: true,
    startAngle: 0,
    endAngle: 360,
    innerRadius: 0,
  },
  text: {
    ...baseDefaults('#FFFFFF', 'transparent', 0, true, false, 600, 120),
    defaultText: 'Hello World',
    fontSize: 24,
    fontWeight: '600',
    fontFamily: 'Inter',
    fontStyle: 'normal',
    textAlign: 'left',
    verticalAlign: 'middle',
    textColor: '#FFFFFF',
    textTransform: 'none',
  },
  button: {
    ...baseDefaults('#FFD700', '#FFA500', 2, true, true, 300, 100, 12, 4, 'rgba(255,215,0,0.4)'),
    cornerRadius: 12,
    paddingH: 20,
    paddingV: 10,
    defaultText: 'Click Me',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter',
    textAlign: 'center',
    textColor: '#000000',
  },
  chatBubble: {
    ...baseDefaults('#1F2937', '#374151', 1, true, true, 400, 120, 8, 2),
    cornerRadius: 18,
    defaultText: 'Hello! How are you?',
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'left',
    textColor: '#FFFFFF',
  },
  chatFrame: {
    ...baseDefaults('#FFFFFF', '#000000', 20, true, true, 640, 1136, 0, 8, 'rgba(0,0,0,0.5)'),
    cornerRadius: 36,
  },
  line: {
    ...baseDefaults('transparent', '#60A5FA', 3, false, true, 300, 2),
    lineCap: 'square',
    arrowStart: false,
    arrowEnd: false,
    arrowheadType: 'triangle',
    arrowheadSize: 12,
    smoothing: 0,
    closePath: false,
  },
  star: {
    ...baseDefaults('#404040', '#404040', 2, true, false, 600, 600),
    lockAspectRatio: true,
    starPoints: 5,
    starInnerRadius: 50,
  },
  gradient: {
    ...baseDefaults('transparent', 'transparent', 0, false, false, 800, 500),
    gradientType: 'linear',
    gradientAngle: 45,
    gradientColor1: '#3B82F6',
    gradientColor2: '#06B6D4',
    gradientPosition1: 0,
    gradientPosition2: 100,
  },
  adjustmentLayer: {
    ...baseDefaults('transparent', 'rgba(99,102,241,0.5)', 2, false, true, 800, 500),
    adjustmentType: 'brightness-contrast',
    adjustmentIntensity: 50,
  },
  svg: {
    ...baseDefaults('transparent', 'transparent', 0, false, false, 400, 400),
    lockAspectRatio: true,
    svgFillColor: '#3B82F6',
    svgStrokeColor: '#1E40AF',
  },
};

// ─── Legacy DesignElement defaults (for canvasUtils) ──────────────────────────

const DEFAULT_SHAPE_SETTINGS: ShapeDefaults = {
  rectangle: {
    material: { ...createDefaultMaterial('matte'), color: '#404040' },
    fill: '#404040',
    stroke: '#404040',
    strokeWidth: 2,
    borderRadius: 0,
    opacity: 1,
    shadow: { blur: 0, color: 'rgba(0, 0, 0, 0.3)', x: 0, y: 4 }
  },
  circle: {
    fill: '#404040',
    material: { ...createDefaultMaterial('matte'), color: '#404040' },
    stroke: '#404040',
    strokeWidth: 2,
    borderRadius: 50,
    opacity: 1,
    shadow: { blur: 0, color: 'rgba(0, 0, 0, 0.3)', x: 0, y: 4 }
  },
  text: {
    material: { ...createDefaultMaterial('matte'), color: '#FFFFFF' },
    stroke: 'transparent',
    strokeWidth: 0,
    borderRadius: 0,
    opacity: 1,
    shadow: { blur: 0, color: 'rgba(0, 0, 0, 0)', x: 0, y: 0 },
    text: 'Hello World',
    fontSize: 24,
    fontWeight: '600',
    fontFamily: 'Inter',
    fontStyle: 'normal',
    textTransform: 'none',
    textAlign: 'left',
    verticalAlign: 'middle',
    textColor: '#FFFFFF'
  },
  button: {
    material: { ...createDefaultMaterial('matte'), color: '#FFD700' },
    stroke: '#FFA500',
    strokeWidth: 2,
    borderRadius: 12,
    opacity: 1,
    shadow: { blur: 12, color: 'rgba(255, 215, 0, 0.4)', x: 0, y: 4 },
    text: 'Click Me',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter',
    fontStyle: 'normal',
    textTransform: 'none',
    textAlign: 'center',
    verticalAlign: 'middle',
    textColor: '#000000'
  },
  chatBubble: {
    material: { ...createDefaultMaterial('matte'), color: '#1F2937' },
    stroke: '#374151',
    strokeWidth: 1,
    borderRadius: 18,
    opacity: 1,
    shadow: { blur: 8, color: 'rgba(0, 0, 0, 0.3)', x: 0, y: 2 },
    text: 'Hello! How are you?',
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Inter',
    fontStyle: 'normal',
    textTransform: 'none',
    textAlign: 'left',
    verticalAlign: 'middle',
    textColor: '#FFFFFF'
  },
  chatFrame: {
    material: { ...createDefaultMaterial('matte'), color: '#FFFFFF' },
    stroke: '#000000',
    strokeWidth: 20,
    borderRadius: 36,
    opacity: 1,
    shadow: { blur: 0, color: 'rgba(0, 0, 0, 0.5)', x: 0, y: 8 }
  },
  line: {
    material: { ...createDefaultMaterial('matte'), color: 'transparent' },
    stroke: '#60A5FA',
    strokeWidth: 3,
    borderRadius: 0,
    opacity: 1,
    shadow: { blur: 0, color: '#000000', x: 0, y: 0 },
    lineType: 'line',
    arrowStart: false,
    arrowEnd: false,
    arrowheadType: 'triangle',
    arrowheadSize: 12,
    lineCap: 'square',
    lineJoin: 'round',
    dashArray: [],
    smoothing: 0
  },
  star: {
    material: { ...createDefaultMaterial('matte'), color: '#404040' },
    stroke: '#404040',
    strokeWidth: 2,
    borderRadius: 0,
    opacity: 1,
    shadow: { blur: 0, color: 'rgba(0, 0, 0, 0.3)', x: 0, y: 4 },
    starPoints: 5,
    starInnerRadius: 50
  },
  gradient: {
    material: { ...createDefaultMaterial('matte'), color: 'transparent' },
    stroke: 'transparent',
    strokeWidth: 0,
    borderRadius: 0,
    opacity: 1,
    shadow: { blur: 0, color: '#000000', x: 0, y: 0 },
    gradientEnabled: true,
    gradientType: 'linear',
    gradientAngle: 45,
    gradientColors: [
      { color: '#3B82F6', position: 0, id: 'gradient-1' },
      { color: '#06B6D4', position: 100, id: 'gradient-2' }
    ],
    gradientCenterX: 50,
    gradientCenterY: 50
  },
  adjustmentLayer: {
    material: { ...createDefaultMaterial('matte'), color: 'transparent' },
    stroke: 'rgba(99, 102, 241, 0.5)',
    strokeWidth: 2,
    borderRadius: 0,
    opacity: 0.8,
    shadow: { blur: 0, color: '#000000', x: 0, y: 0 },
    adjustmentType: 'brightness-contrast',
    adjustmentIntensity: 50,
    blendMode: 'normal'
  },
  svg: {
    material: { ...createDefaultMaterial('matte'), color: 'transparent' },
    stroke: 'transparent',
    strokeWidth: 0,
    borderRadius: 0,
    opacity: 1,
    shadow: { blur: 0, color: '#000000', x: 0, y: 0 },
    svgData: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
    svgViewBox: '0 0 24 24',
    svgPreserveAspectRatio: 'xMidYMid meet',
    svgFillColor: '#3B82F6',
    svgStrokeColor: '#1E40AF'
  }
};

// ─── Service Class ─────────────────────────────────────────────────────────────

class ShapeDefaultsService {
  getDefaults(): ShapeDefaults {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ShapeDefaults>;
        return { ...DEFAULT_SHAPE_SETTINGS, ...parsed };
      }
    } catch {
      // corrupt storage — fall through
    }
    return { ...DEFAULT_SHAPE_SETTINGS };
  }

  getShapeDefaults(shapeType: keyof ShapeDefaults): Partial<DesignElement> {
    return this.getDefaults()[shapeType] || {};
  }

  saveDefaults(defaults: ShapeDefaults): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      // storage quota — ignore
    }
  }

  updateShapeDefaults(shapeType: keyof ShapeDefaults, updates: Partial<DesignElement>): void {
    const current = this.getDefaults();
    current[shapeType] = { ...current[shapeType], ...updates };
    this.saveDefaults(current);
  }

  resetToDefaults(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  getFactoryDefaults(): ShapeDefaults {
    return { ...DEFAULT_SHAPE_SETTINGS };
  }

  // ─── Extended geometry defaults ────────────────────────────────────────────

  getAllGeometryDefaults(): AllShapeGeometry {
    try {
      const stored = localStorage.getItem(GEOMETRY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AllShapeGeometry>;
        const result = {} as AllShapeGeometry;
        for (const k of Object.keys(SHAPE_GEOMETRY_FACTORY_DEFAULTS) as (keyof AllShapeGeometry)[]) {
          result[k] = { ...SHAPE_GEOMETRY_FACTORY_DEFAULTS[k], ...(parsed[k] ?? {}) } as AllShapeGeometry[typeof k];
        }
        return result;
      }
    } catch {
      // corrupt storage
    }
    return this._cloneGeometry();
  }

  getShapeGeometry<K extends keyof AllShapeGeometry>(shapeType: K): AllShapeGeometry[K] {
    return this.getAllGeometryDefaults()[shapeType];
  }

  updateShapeGeometry<K extends keyof AllShapeGeometry>(
    shapeType: K,
    updates: Partial<AllShapeGeometry[K]>
  ): void {
    const all = this.getAllGeometryDefaults();
    all[shapeType] = { ...all[shapeType], ...updates } as AllShapeGeometry[K];
    this._saveGeometry(all);
    this._syncLegacyFromGeometry(shapeType, all[shapeType]);
  }

  resetShapeGeometry(shapeType: keyof AllShapeGeometry): void {
    const all = this.getAllGeometryDefaults();
    all[shapeType] = { ...SHAPE_GEOMETRY_FACTORY_DEFAULTS[shapeType] } as AllShapeGeometry[typeof shapeType];
    this._saveGeometry(all);
    this._syncLegacyFromGeometry(shapeType, all[shapeType]);
  }

  resetAllGeometry(): void {
    try {
      localStorage.removeItem(GEOMETRY_STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  getFactoryGeometry(): AllShapeGeometry {
    return this._cloneGeometry();
  }

  private _cloneGeometry(): AllShapeGeometry {
    return JSON.parse(JSON.stringify(SHAPE_GEOMETRY_FACTORY_DEFAULTS)) as AllShapeGeometry;
  }

  private _saveGeometry(all: AllShapeGeometry): void {
    try {
      localStorage.setItem(GEOMETRY_STORAGE_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  }

  /**
   * Keep the legacy ShapeDefaults in sync so canvasUtils still reads
   * fill color, stroke, shadow etc. correctly when creating shapes.
   */
  private _syncLegacyFromGeometry(
    shapeType: keyof AllShapeGeometry,
    g: ShapeGeometryDefaults
  ): void {
    const legacyKey = shapeType as keyof ShapeDefaults;
    const updates: Partial<DesignElement> = {
      opacity: g.defaultOpacity / 100,
      stroke: g.strokeEnabled ? g.strokeColor : 'transparent',
      strokeWidth: g.strokeEnabled ? g.strokeWidth : 0,
      shadow: {
        blur: g.shadowBlur,
        color: g.shadowColor,
        x: g.shadowOffsetX,
        y: g.shadowOffsetY,
      },
    };

    if (g.fillEnabled) {
      const mat = createDefaultMaterial('matte');
      updates.material = { ...mat, color: g.fillColor };
      updates.fill = g.fillColor;
    }

    const cur = this.getDefaults();
    cur[legacyKey] = { ...cur[legacyKey], ...updates };
    this.saveDefaults(cur);
  }
}

export const shapeDefaultsService = new ShapeDefaultsService();
