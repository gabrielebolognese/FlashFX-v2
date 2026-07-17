import { DesignElement } from '../types/design';
import { shapeDefaultsService, ShapeDefaults, AllShapeGeometry } from '../services/ShapeDefaultsService';
import { createSolidColorMaterialConfig } from '../types/material';

export interface CanvasViewport {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  zoom: number;
}

const calculateCanvasCenter = (
  canvasSize: { width: number; height: number },
  viewport: CanvasViewport
): { x: number; y: number } => {
  const centerX = (viewport.width / 2 - viewport.scrollX) / viewport.zoom;
  const centerY = (viewport.height / 2 - viewport.scrollY) / viewport.zoom;
  return {
    x: Math.min(Math.max(0, centerX), canvasSize.width),
    y: Math.min(Math.max(0, centerY), canvasSize.height)
  };
};

/**
 * Map shape types to defaults service keys
 */
const mapShapeTypeToDefaultsKey = (type: string): keyof ShapeDefaults | null => {
  const mapping: Record<string, keyof ShapeDefaults> = {
    'rectangle': 'rectangle',
    'circle': 'circle',
    'text': 'text',
    'button': 'button',
    'chat-bubble': 'chatBubble',
    'chat-frame': 'chatFrame',
    'line': 'line',
    'star': 'star',
    'gradient': 'gradient',
    'adjustment-layer': 'adjustmentLayer',
    'svg': 'svg'
  };
  return mapping[type] || null;
};

/**
 * Get dimensions for a specific shape type, reading from user geometry defaults
 */
const getShapeDimensions = (type: DesignElement['type']): { width: number; height: number } => {
  if (type === 'hbox') return { width: 400, height: 120 };
  if (type === 'vbox') return { width: 200, height: 300 };
  const geoKey = mapShapeTypeToDefaultsKey(type) as keyof AllShapeGeometry | null;
  if (geoKey) {
    const geo = shapeDefaultsService.getShapeGeometry(geoKey);
    return { width: geo.defaultWidth, height: geo.defaultHeight };
  }
  return { width: 800, height: 500 };
};

/**
 * Create a new shape at the center of the visible canvas
 */
export const createShapeAtCenter = (
  type: DesignElement['type'],
  canvasSize: { width: number; height: number },
  viewport: CanvasViewport,
  customProps?: Partial<DesignElement>
): DesignElement => {
  const center = calculateCanvasCenter(canvasSize, viewport);
  const dimensions = getShapeDimensions(type);

  const x = center.x - (dimensions.width / 2);
  const y = center.y - (dimensions.height / 2);

  const defaultsKey = mapShapeTypeToDefaultsKey(type);
  const defaults = defaultsKey ? shapeDefaultsService.getShapeDefaults(defaultsKey) : {};

  const defaultColor = (defaults as any).material?.color || (defaults as any).fill || '#3B82F6';

  const baseElement: DesignElement = {
    id: Date.now().toString(),
    type,
    name: type.charAt(0).toUpperCase() + type.slice(1),
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: dimensions.width,
    height: dimensions.height,
    rotation: 0,
    locked: false,
    visible: true,
    ...defaults,
    materialConfig: createSolidColorMaterialConfig(defaultColor),
    ...customProps
  };

  if (type === 'line') {
    return {
      ...baseElement,
      cornerRadius: 0,
      pointCornerRadii: [],
      points: [
        { x: 0, y: 0, radius: 0 },
        { x: 300, y: 0, radius: 0 }
      ],
      trimStart: 0,
      trimEnd: 1,
      closePath: false,
      autoScaleArrows: false
    };
  }

  if (type === 'star') {
    return {
      starPoints: 5,
      starInnerRadius: 50,
      ...baseElement
    };
  }

  if (type === 'gradient') {
    return {
      gradientEnabled: true,
      gradientType: 'linear',
      gradientAngle: 45,
      gradientCenterX: 50,
      gradientCenterY: 50,
      ...baseElement
    };
  }

  if (type === 'adjustment-layer') {
    return {
      adjustmentType: 'brightness-contrast',
      adjustmentIntensity: 50,
      blendMode: 'normal',
      ...baseElement,
      x: 0,
      y: 0,
      width: canvasSize.width,
      height: canvasSize.height,
    };
  }

  if (type === 'svg') {
    return {
      svgData: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
      svgViewBox: '0 0 24 24',
      svgPreserveAspectRatio: 'xMidYMid meet',
      svgFillColor: '#3B82F6',
      svgStrokeColor: '#1E40AF',
      ...baseElement
    };
  }

  if (type === 'hbox' || type === 'vbox') {
    return {
      ...baseElement,
      fill: 'transparent',
      stroke: 'transparent',
      strokeWidth: 0,
      borderRadius: 0,
      opacity: 1,
      shadow: { blur: 0, color: 'transparent', x: 0, y: 0 },
      padding: 0,
      margin: 0,
      childIds: [],
    };
  }

  return baseElement;
};

/**
 * Create a new shape centered at a specific canvas coordinate
 */
export const createShapeAtPosition = (
  type: DesignElement['type'],
  canvasX: number,
  canvasY: number,
  customProps?: Partial<DesignElement>,
  canvasSize?: { width: number; height: number }
): DesignElement => {
  const dimensions = getShapeDimensions(type);
  const x = canvasX - dimensions.width / 2;
  const y = canvasY - dimensions.height / 2;

  const defaultsKey = mapShapeTypeToDefaultsKey(type);
  const defaults = defaultsKey ? shapeDefaultsService.getShapeDefaults(defaultsKey) : {};
  const defaultColor = (defaults as any).material?.color || (defaults as any).fill || '#3B82F6';

  const baseElement: DesignElement = {
    id: Date.now().toString(),
    type,
    name: type.charAt(0).toUpperCase() + type.slice(1),
    x,
    y,
    width: dimensions.width,
    height: dimensions.height,
    rotation: 0,
    locked: false,
    visible: true,
    ...defaults,
    materialConfig: createSolidColorMaterialConfig(defaultColor),
    ...customProps
  };

  if (type === 'line') {
    return {
      ...baseElement,
      cornerRadius: 0,
      pointCornerRadii: [],
      points: [
        { x: 0, y: 0, radius: 0 },
        { x: 300, y: 0, radius: 0 }
      ],
      trimStart: 0,
      trimEnd: 1,
      closePath: false,
      autoScaleArrows: false
    };
  }

  if (type === 'star') {
    return {
      starPoints: 5,
      starInnerRadius: 50,
      ...baseElement
    };
  }

  if (type === 'gradient') {
    return {
      gradientEnabled: true,
      gradientType: 'linear',
      gradientAngle: 45,
      gradientCenterX: 50,
      gradientCenterY: 50,
      ...baseElement
    };
  }

  if (type === 'adjustment-layer') {
    const adjWidth = canvasSize?.width ?? baseElement.width;
    const adjHeight = canvasSize?.height ?? baseElement.height;
    return {
      adjustmentType: 'brightness-contrast',
      adjustmentIntensity: 50,
      blendMode: 'normal',
      ...baseElement,
      x: 0,
      y: 0,
      width: adjWidth,
      height: adjHeight,
    };
  }

  if (type === 'svg') {
    return {
      svgData: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
      svgViewBox: '0 0 24 24',
      svgPreserveAspectRatio: 'xMidYMid meet',
      svgFillColor: '#3B82F6',
      svgStrokeColor: '#1E40AF',
      ...baseElement
    };
  }

  if (type === 'hbox' || type === 'vbox') {
    return {
      ...baseElement,
      fill: 'transparent',
      stroke: 'transparent',
      strokeWidth: 0,
      borderRadius: 0,
      opacity: 1,
      shadow: { blur: 0, color: 'transparent', x: 0, y: 0 },
      padding: 0,
      margin: 0,
      childIds: [],
    };
  }

  return baseElement;
};