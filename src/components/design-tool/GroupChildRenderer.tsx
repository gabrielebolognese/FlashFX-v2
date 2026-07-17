import React from 'react';
import { DesignElement } from '../../types/design';
import { generateShapeMaterialStyle } from '../../types/material';
import ImageWithFilters from '../image/ImageWithFilters';

interface GroupChildRendererProps {
  child: DesignElement;
}

const GroupChildRenderer: React.FC<GroupChildRendererProps> = ({ child }) => {
  if (!child.visible) return null;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: child.x,
    top: child.y,
    width: child.width,
    height: child.height,
    opacity: child.opacity,
    transform: `rotate(${child.rotation}deg)`,
    pointerEvents: 'none',
    userSelect: 'none',
  };

  const getBgStyle = (): React.CSSProperties => {
    if (child.materialConfig?.enabled && child.materialConfig.layers.length > 0) {
      return generateShapeMaterialStyle(child.materialConfig);
    }
    if (child.fill) return { backgroundColor: child.fill };
    return { backgroundColor: '#3B82F6' };
  };

  const getBorder = () =>
    child.strokeWidth > 0 ? `${child.strokeWidth}px solid ${child.stroke}` : 'none';

  const shadowStyle: React.CSSProperties =
    child.shadow?.blur > 0
      ? { boxShadow: `${child.shadow.x}px ${child.shadow.y}px ${child.shadow.blur}px ${child.shadow.color}` }
      : {};

  switch (child.type) {
    case 'rectangle':
      return (
        <div
          style={{
            ...baseStyle,
            ...getBgStyle(),
            border: getBorder(),
            borderRadius: child.borderRadius,
            overflow: 'hidden',
            ...shadowStyle,
          }}
        />
      );

    case 'circle':
      return (
        <div
          style={{
            ...baseStyle,
            ...getBgStyle(),
            border: getBorder(),
            borderRadius: '50%',
            overflow: 'hidden',
            ...shadowStyle,
          }}
        />
      );

    case 'text':
    case 'chat-bubble':
      return (
        <div
          style={{
            ...baseStyle,
            color: child.textColor || '#FFFFFF',
            fontSize: child.fontSize,
            fontWeight: child.fontWeight,
            fontFamily: child.fontFamily || 'Inter',
            fontStyle: child.fontStyle || 'normal',
            textAlign: (child.textAlign as React.CSSProperties['textAlign']) || 'left',
            display: 'flex',
            alignItems: child.verticalAlign === 'top' ? 'flex-start' : child.verticalAlign === 'bottom' ? 'flex-end' : 'center',
            whiteSpace: 'pre-wrap',
            ...(child.type === 'chat-bubble' ? { ...getBgStyle(), borderRadius: child.borderRadius, padding: '12px 16px' } : {}),
          }}
        >
          {child.text}
        </div>
      );

    case 'image':
      return (
        <div
          style={{
            ...baseStyle,
            overflow: 'hidden',
            borderRadius: child.borderRadius || 0,
          }}
        >
          {child.imageData && (
            <ImageWithFilters
              src={child.imageData}
              alt={child.name}
              filters={child.filters}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                display: 'block',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      );

    case 'star': {
      const points = child.starPoints || 5;
      const innerRadius = (child.starInnerRadius || 50) / 100;
      const cx = child.width / 2;
      const cy = child.height / 2;
      const outerR = Math.min(child.width, child.height) / 2;
      const innerR = outerR * innerRadius;
      const starPath: string[] = [];
      for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        starPath.push(`${i === 0 ? 'M' : 'L'} ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`);
      }
      starPath.push('Z');
      return (
        <div style={baseStyle}>
          <svg width="100%" height="100%" style={{ display: 'block' }}>
            <path
              d={starPath.join(' ')}
              fill={child.fill || '#3B82F6'}
              stroke={child.stroke || 'none'}
              strokeWidth={child.strokeWidth || 0}
            />
          </svg>
        </div>
      );
    }

    case 'svg': {
      const svgData = child.svgData || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>';
      const fillColor = child.svgFillColor || '#3B82F6';
      const strokeColor = child.svgStrokeColor || '#1E40AF';
      const processedSvg = svgData
        .replace(/fill="[^"]*"/g, `fill="${fillColor}"`)
        .replace(/stroke="[^"]*"/g, `stroke="${strokeColor}"`)
        .replace(/<svg/, `<svg style="width: 100%; height: 100%; display: block;"`);
      return (
        <div
          style={{ ...baseStyle, borderRadius: child.borderRadius }}
          dangerouslySetInnerHTML={{ __html: processedSvg }}
        />
      );
    }

    default:
      return (
        <div
          style={{
            ...baseStyle,
            ...getBgStyle(),
            border: getBorder(),
            borderRadius: child.borderRadius || 0,
          }}
        />
      );
  }
};

export default GroupChildRenderer;
