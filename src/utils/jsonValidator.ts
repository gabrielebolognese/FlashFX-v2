import { HighLevelShape, LowLevelShape } from '../types/aiPipeline';

export class JSONValidator {
  static validateHighLevelShape(shape: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!shape || typeof shape !== 'object') {
      errors.push('Shape is not an object');
      return { valid: false, errors };
    }

    if (!shape.type || typeof shape.type !== 'string') {
      errors.push('Missing or invalid "type" field');
    }

    if (shape.positionX === undefined || typeof shape.positionX !== 'number') {
      errors.push('Missing or invalid "positionX" field');
    }

    if (shape.positionY === undefined || typeof shape.positionY !== 'number') {
      errors.push('Missing or invalid "positionY" field');
    }

    if (shape.width !== undefined && typeof shape.width !== 'number') {
      errors.push('Invalid "width" field');
    }

    if (shape.height !== undefined && typeof shape.height !== 'number') {
      errors.push('Invalid "height" field');
    }

    const validTypes = ['rectangle', 'circle', 'text', 'line', 'button'];
    if (shape.type && !validTypes.includes(shape.type.toLowerCase())) {
      errors.push(`Unsupported shape type: ${shape.type}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static validateHighLevelArray(data: any): { valid: boolean; errors: string[]; validShapes: HighLevelShape[] } {
    const errors: string[] = [];
    const validShapes: HighLevelShape[] = [];

    if (!Array.isArray(data)) {
      errors.push('Data is not an array');
      return { valid: false, errors, validShapes };
    }

    if (data.length === 0) {
      errors.push('Array is empty');
      return { valid: false, errors, validShapes };
    }

    data.forEach((shape, index) => {
      const validation = this.validateHighLevelShape(shape);
      if (validation.valid) {
        validShapes.push(shape as HighLevelShape);
      } else {
        errors.push(`Shape ${index}: ${validation.errors.join(', ')}`);
      }
    });

    return {
      valid: validShapes.length > 0,
      errors,
      validShapes,
    };
  }

  static validateLowLevelShape(shape: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!shape || typeof shape !== 'object') {
      errors.push('Shape is not an object');
      return { valid: false, errors };
    }

    if (!shape.shapeType || typeof shape.shapeType !== 'string') {
      errors.push('Missing or invalid "shapeType" field');
    }

    if (!shape.settings || typeof shape.settings !== 'object') {
      errors.push('Missing or invalid "settings" field');
      return { valid: false, errors };
    }

    const settings = shape.settings;

    if (!settings.dimensions || typeof settings.dimensions !== 'object') {
      errors.push('Missing or invalid "settings.dimensions"');
    } else {
      if (typeof settings.dimensions.width !== 'number') {
        errors.push('Invalid "settings.dimensions.width"');
      }
      if (typeof settings.dimensions.height !== 'number') {
        errors.push('Invalid "settings.dimensions.height"');
      }
    }

    if (!settings.style || typeof settings.style !== 'object') {
      errors.push('Missing or invalid "settings.style"');
    } else {
      if (settings.style.fillColor && typeof settings.style.fillColor !== 'string') {
        errors.push('Invalid "settings.style.fillColor"');
      }
      if (settings.style.strokeColor && typeof settings.style.strokeColor !== 'string') {
        errors.push('Invalid "settings.style.strokeColor"');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static repairLowLevelShape(shape: any): LowLevelShape {
    const repaired: any = {
      name: shape.name || `Shape_${Date.now()}`,
      version: shape.version || '1.0',
      timestamp: shape.timestamp || new Date().toISOString(),
      shapeType: shape.shapeType || 'rectangle',
      settings: {
        style: {
          fillColor: shape.settings?.style?.fillColor || '#3B82F6',
          strokeColor: shape.settings?.style?.strokeColor || '#1E40AF',
          strokeWidth: shape.settings?.style?.strokeWidth ?? 2,
          opacity: shape.settings?.style?.opacity ?? 1,
          borderRadius: shape.settings?.style?.borderRadius ?? 0,
          useGradientFill: shape.settings?.style?.useGradientFill || false,
        },
        dimensions: {
          width: shape.settings?.dimensions?.width || 100,
          height: shape.settings?.dimensions?.height || 100,
        },
        scale: {
          x: shape.settings?.scale?.x ?? 1,
          y: shape.settings?.scale?.y ?? 1,
          uniform: shape.settings?.scale?.uniform ?? true,
        },
        rotation: {
          angle: shape.settings?.rotation?.angle ?? 0,
        },
      },
    };

    if (shape.settings?.style?.gradientType) {
      repaired.settings.style.gradientType = shape.settings.style.gradientType;
    }
    if (shape.settings?.style?.gradientColors) {
      repaired.settings.style.gradientColors = shape.settings.style.gradientColors;
    }
    if (shape.settings?.style?.gradientAngle !== undefined) {
      repaired.settings.style.gradientAngle = shape.settings.style.gradientAngle;
    }

    if (shape.settings?.text) {
      repaired.settings.text = {
        content: shape.settings.text.content || 'Text',
        fontSize: shape.settings.text.fontSize || 16,
        fontWeight: shape.settings.text.fontWeight || '400',
        fontFamily: shape.settings.text.fontFamily || 'Inter',
        textColor: shape.settings.text.textColor || '#FFFFFF',
        textAlign: shape.settings.text.textAlign || 'center',
        verticalAlign: shape.settings.text.verticalAlign || 'middle',
      };
    }

    if (shape.settings?.line) {
      repaired.settings.line = {
        lineType: shape.settings.line.lineType || 'line',
        arrowStart: shape.settings.line.arrowStart || false,
        arrowEnd: shape.settings.line.arrowEnd || false,
        arrowheadType: shape.settings.line.arrowheadType || 'triangle',
        arrowheadSize: shape.settings.line.arrowheadSize || 12,
        lineCap: shape.settings.line.lineCap || 'round',
        lineJoin: shape.settings.line.lineJoin || 'round',
        dashArray: shape.settings.line.dashArray || [],
      };
    }

    return repaired as LowLevelShape;
  }

  static sanitizeJSON(jsonString: string): string {
    let cleaned = jsonString.trim();

    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    return cleaned;
  }

  static extractJSONFromText(text: string): string | null {
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return arrayMatch[0];
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }

    return null;
  }
}
