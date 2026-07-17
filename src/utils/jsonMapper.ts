import { DesignElement } from '../types/design';
import { HighLevelShape, LowLevelShape } from '../types/aiPipeline';

export class JSONMapper {
  static mapToDesignElement(
    highLevelShape: HighLevelShape,
    lowLevelShape: LowLevelShape,
    index: number
  ): DesignElement {
    const timestamp = Date.now() + index * 100;
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const uniqueId = `ai-gen-${timestamp}-${index}-${randomSuffix}`;

    const shapeType = this.normalizeShapeType(lowLevelShape.shapeType);
    const settings = lowLevelShape.settings;

    const width = settings.dimensions?.width || highLevelShape.width || 100;
    const height = settings.dimensions?.height || highLevelShape.height || 100;

    const scaledWidth = width * (settings.scale?.x || 1);
    const scaledHeight = height * (settings.scale?.y || 1);

    const baseElement: DesignElement = {
      id: uniqueId,
      type: shapeType,
      name: lowLevelShape.name || `AI ${shapeType} ${index + 1}`,
      x: highLevelShape.positionX,
      y: highLevelShape.positionY,
      width: scaledWidth,
      height: scaledHeight,
      rotation: settings.rotation?.angle || 0,
      opacity: settings.style?.opacity !== undefined ? settings.style.opacity : 1,
      visible: true,
      locked: false,
      fill: settings.style?.fillColor || '#3B82F6',
      stroke: settings.style?.strokeColor || '#1E40AF',
      strokeWidth: settings.style?.strokeWidth || 2,
      borderRadius: settings.style?.borderRadius || 0,
      shadow: {
        blur: 4,
        x: 0,
        y: 2,
        color: 'rgba(0, 0, 0, 0.2)',
      },
    };

    if (settings.style?.useGradientFill && settings.style?.gradientColors) {
      baseElement.gradientEnabled = true;
      baseElement.gradientType = settings.style.gradientType || 'linear';
      baseElement.gradientColors = settings.style.gradientColors.map((gc, idx) => ({
        color: gc.color,
        position: gc.position,
        id: `gradient-${uniqueId}-${idx}`,
      }));
      baseElement.gradientAngle = settings.style.gradientAngle || 0;
    }

    if (shapeType === 'text' || settings.text || highLevelShape.content) {
      baseElement.text = settings.text?.content || highLevelShape.content || 'Text';
      baseElement.fontSize = settings.text?.fontSize || 16;
      baseElement.fontWeight = settings.text?.fontWeight || '400';
      baseElement.fontFamily = settings.text?.fontFamily || 'Inter';
      baseElement.textColor = settings.text?.textColor || settings.style?.fillColor || '#FFFFFF';
      baseElement.textAlign = settings.text?.textAlign || 'center';
      baseElement.verticalAlign = settings.text?.verticalAlign || 'middle';

      if (shapeType === 'text') {
        baseElement.fill = 'transparent';
        baseElement.stroke = 'transparent';
        baseElement.strokeWidth = 0;
      }
    }

    if (shapeType === 'line') {
      baseElement.lineType = settings.line?.lineType || 'line';
      baseElement.points = [
        { x: 0, y: 0 },
        { x: scaledWidth, y: scaledHeight },
      ];
      baseElement.arrowStart = settings.line?.arrowStart || false;
      baseElement.arrowEnd = settings.line?.arrowEnd || false;
      baseElement.arrowheadType = settings.line?.arrowheadType || 'triangle';
      baseElement.arrowheadSize = settings.line?.arrowheadSize || 12;
      baseElement.lineCap = settings.line?.lineCap || 'round';
      baseElement.lineJoin = settings.line?.lineJoin || 'round';
      baseElement.dashArray = settings.line?.dashArray || [];
      baseElement.smoothing = 0;
      baseElement.trimStart = 0;
      baseElement.trimEnd = 1;
    }

    if (shapeType === 'circle') {
      baseElement.borderRadius = 50;
    }

    return baseElement;
  }

  static normalizeShapeType(
    shapeType: string
  ): DesignElement['type'] {
    const normalized = shapeType.toLowerCase().trim();

    const typeMap: Record<string, DesignElement['type']> = {
      'rectangle': 'rectangle',
      'rect': 'rectangle',
      'square': 'rectangle',
      'box': 'rectangle',
      'circle': 'circle',
      'ellipse': 'circle',
      'oval': 'circle',
      'text': 'text',
      'label': 'text',
      'line': 'line',
      'arrow': 'line',
      'connector': 'line',
      'button': 'button',
      'btn': 'button',
    };

    return typeMap[normalized] || 'rectangle';
  }

  static validateLowLevelShape(shape: any): boolean {
    if (!shape || typeof shape !== 'object') {
      return false;
    }

    if (!shape.shapeType || !shape.settings) {
      return false;
    }

    if (!shape.settings.dimensions || !shape.settings.style) {
      return false;
    }

    return true;
  }

  static createFallbackElement(
    highLevelShape: HighLevelShape,
    index: number,
    error: string
  ): DesignElement {
    console.warn(`Creating fallback element for shape ${index}:`, error);

    const timestamp = Date.now() + index * 100;
    const uniqueId = `ai-fallback-${timestamp}-${index}`;

    return {
      id: uniqueId,
      type: highLevelShape.type,
      name: `Fallback ${highLevelShape.type} ${index + 1}`,
      x: highLevelShape.positionX,
      y: highLevelShape.positionY,
      width: highLevelShape.width || 100,
      height: highLevelShape.height || 100,
      rotation: 0,
      opacity: 0.7,
      visible: true,
      locked: false,
      fill: '#6B7280',
      stroke: '#4B5563',
      strokeWidth: 2,
      borderRadius: highLevelShape.type === 'circle' ? 50 : 8,
      shadow: {
        blur: 4,
        x: 0,
        y: 2,
        color: 'rgba(0, 0, 0, 0.2)',
      },
      text: highLevelShape.content,
      fontSize: 14,
      textColor: '#FFFFFF',
      textAlign: 'center',
      verticalAlign: 'middle',
    };
  }

  static clampToCanvas(
    element: DesignElement,
    canvasWidth: number = 3840,
    canvasHeight: number = 2160
  ): DesignElement {
    const clampedX = Math.max(0, Math.min(canvasWidth - element.width, element.x));
    const clampedY = Math.max(0, Math.min(canvasHeight - element.height, element.y));

    if (clampedX !== element.x || clampedY !== element.y) {
      console.warn(
        `Element ${element.name} position clamped from (${element.x}, ${element.y}) to (${clampedX}, ${clampedY})`
      );
    }

    return {
      ...element,
      x: clampedX,
      y: clampedY,
    };
  }
}
