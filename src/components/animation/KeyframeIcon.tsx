import React from 'react';
import { EasingType, EASING_CONFIGS } from '../../animation-engine/types';

interface KeyframeIconProps {
  easing: EasingType;
  size?: number;
  className?: string;
  isSelected?: boolean;
  isHovered?: boolean;
  isHighlighted?: boolean;
  hoverMode?: 'select' | 'delete';
}

const KeyframeIcon: React.FC<KeyframeIconProps> = ({
  easing,
  size = 12,
  className = '',
  isSelected = false,
  isHovered = false,
  isHighlighted = false,
  hoverMode = 'select'
}) => {
  const config = EASING_CONFIGS.find(c => c.type === easing);
  const iconType = config?.icon || 'rhombus';

  const hoverColor = hoverMode === 'select' ? '#22c55e' : '#ef4444';
  const highlightColor = '#3b82f6';
  const color = isHighlighted ? highlightColor : isHovered ? hoverColor : isSelected ? '#22c55e' : '#f59e0b';
  const fillColor = isHighlighted ? highlightColor : isHovered ? hoverColor : isSelected ? '#22c55e' : 'rgba(245, 158, 11, 0.7)';

  const renderIcon = () => {
    switch (iconType) {
      case 'rhombus':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <polygon
              points="6,1 11,6 6,11 1,6"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );

      case 'triangle-right':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <polygon
              points="2,2 10,6 2,10"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );

      case 'triangle-left':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <polygon
              points="10,2 2,6 10,10"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );

      case 'diamond':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <polygon
              points="6,0 12,6 6,12 0,6"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
            <line x1="6" y1="3" x2="6" y2="9" stroke={color} strokeWidth="1" />
          </svg>
        );

      case 'circle':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <circle
              cx="6"
              cy="6"
              r="5"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );

      case 'triangle-sharp-tail':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <polygon
              points="1,6 5,2 11,6 5,10"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );

      case 'triangle-sharp-head':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <polygon
              points="11,6 7,2 1,6 7,10"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );

      case 'quarter-circle-right':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <path
              d="M 2 10 Q 2 2 10 2 L 10 10 Z"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );

      case 'quarter-circle-left':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <path
              d="M 10 10 Q 10 2 2 2 L 2 10 Z"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );

      case 'arrow-loop':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <path
              d="M 2 6 Q 6 2 8 6 Q 10 8 8 6 L 10 6"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
            />
            <circle cx="10" cy="6" r="2" fill={fillColor} stroke={color} strokeWidth="1" />
          </svg>
        );

      case 'wave':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <path
              d="M 1 6 Q 3 2 5 6 Q 7 10 9 6 Q 10 4 11 6"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
            />
            <circle cx="11" cy="6" r="1.5" fill={fillColor} />
          </svg>
        );

      case 'bounce':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <path
              d="M 1 10 Q 3 2 5 10 Q 6 6 7 10 Q 8 8 9 10 L 11 10"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
            />
          </svg>
        );

      case 'vertical-line':
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <line
              x1="6"
              y1="1"
              x2="6"
              y2="11"
              stroke={color}
              strokeWidth="2"
            />
          </svg>
        );

      default:
        return (
          <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
            <polygon
              points="6,1 11,6 6,11 1,6"
              fill={fillColor}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );
    }
  };

  return renderIcon();
};

export default KeyframeIcon;
