import React, { useState, useRef } from 'react';
import { DesignElement } from '../../types/design';
import { useSnapping } from '../../hooks/useSnapping';
import LineComponent from './LineComponent';

interface DesignElementComponentProps {
  element: DesignElement;
  isSelected: boolean;
  onSelect: (ctrlKey: boolean) => void;
  onUpdate: (updates: Partial<DesignElement>) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  parentOffset?: { x: number; y: number };
  allElements?: DesignElement[];
  zoom?: number;
  snapEnabled?: boolean;
  canvasSize?: { width: number; height: number };
  onGridSnap?: (x: number, y: number) => { x: number; y: number };
  onGridSnapSize?: (width: number, height: number) => { width: number; height: number };
}

const DesignElementComponent: React.FC<DesignElementComponentProps> = ({
  element,
  isSelected,
  onSelect,
  onUpdate,
  onContextMenu,
  parentOffset = { x: 0, y: 0 },
  allElements = [],
  zoom = 1,
  snapEnabled = true,
  canvasSize = { width: 3840, height: 2160 },
  onGridSnap,
  onGridSnapSize
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, elementX: 0, elementY: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const elementRef = useRef<HTMLDivElement>(null);
  
  const canvasCenter = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
  const {
    detectSnaps,
    showGuides,
    hideGuides
  } = useSnapping(allElements, canvasCenter, zoom, snapEnabled, canvasSize);

  if (!element.visible) return null;

  const absoluteX = parentOffset.x + element.x;
  const absoluteY = parentOffset.y + element.y;

  // Clamp position to canvas boundaries
  const clampToCanvas = (x: number, y: number, width: number, height: number) => {
    const clampedX = Math.max(0, Math.min(canvasSize.width - width, x));
    const clampedY = Math.max(0, Math.min(canvasSize.height - height, y));
    return { x: clampedX, y: clampedY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (element.locked) return;
    
    e.stopPropagation();
    onSelect(e.ctrlKey || e.metaKey);
    
    setIsDragging(true);
    // Store both mouse position and current element position
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      elementX: element.x,
      elementY: element.y
    });
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (element.locked) return;
    
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: element.width,
      height: element.height
    });
  };

  React.useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        // Calculate zoom-adjusted delta
        const deltaX = (e.clientX - dragStart.x) / zoom;
        const deltaY = (e.clientY - dragStart.y) / zoom;
        
        // Calculate new position based on original element position + zoom-adjusted delta
        const rawX = dragStart.elementX + deltaX;
        const rawY = dragStart.elementY + deltaY;
        
        // Apply canvas boundary clamping
        const clamped = clampToCanvas(rawX, rawY, element.width, element.height);
        
        // Apply grid snapping if available and enabled
        let finalX = clamped.x;
        let finalY = clamped.y;
        if (onGridSnap) {
          const gridSnapped = onGridSnap(clamped.x, clamped.y);
          finalX = gridSnapped.x;
          finalY = gridSnapped.y;
        }
        
        // Apply snapping if enabled
        const snapResult = detectSnaps(element, finalX, finalY, snapEnabled);
        if (snapResult.x !== undefined) finalX = snapResult.x;
        if (snapResult.y !== undefined) finalY = snapResult.y;
        
        // Show snap guides
        showGuides(snapResult.guides);
        
        onUpdate({ x: finalX, y: finalY });
      }
      
      if (isResizing) {
        // Calculate zoom-adjusted resize delta
        const deltaX = (e.clientX - resizeStart.x) / zoom;
        const deltaY = (e.clientY - resizeStart.y) / zoom;
        
        const newWidth = Math.max(10, resizeStart.width + deltaX);
        const newHeight = Math.max(10, resizeStart.height + deltaY);
        
        // Apply grid snapping to size if available
        let finalWidth = newWidth;
        let finalHeight = newHeight;
        if (onGridSnapSize) {
          const sizeSnapped = onGridSnapSize(newWidth, newHeight);
          finalWidth = sizeSnapped.width;
          finalHeight = sizeSnapped.height;
        }
        
        // Ensure resized element stays within canvas bounds
        const maxWidth = canvasSize.width - element.x;
        const maxHeight = canvasSize.height - element.y;
        
        const clampedWidth = Math.min(finalWidth, maxWidth);
        const clampedHeight = Math.min(finalHeight, maxHeight);
        
        onUpdate({ width: clampedWidth, height: clampedHeight });
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      hideGuides();
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [
    isDragging, 
    isResizing, 
    dragStart, 
    resizeStart, 
    onUpdate, 
    element, 
    detectSnaps, 
    showGuides, 
    hideGuides, 
    snapEnabled, 
    zoom,
    canvasSize,
    onGridSnap,
    onGridSnapSize
  ]);

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: absoluteX,
    top: absoluteY,
    width: element.width,
    height: element.height,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg)`,
    cursor: element.locked ? 'default' : 'pointer',
    pointerEvents: element.locked ? 'none' : 'auto'
  };

  const shadowStyle = element.shadow?.blur > 0 ? {
    boxShadow: `${element.shadow.x}px ${element.shadow.y}px ${element.shadow.blur}px ${element.shadow.color}`
  } : {};

  // Generate gradient CSS
  const getGradientStyle = (element: DesignElement) => {
    if (!element.gradientEnabled || !element.gradientColors || element.gradientColors.length < 2) {
      return { backgroundColor: element.fill };
    }
    
    const sortedColors = [...element.gradientColors].sort((a, b) => a.position - b.position);
    const colorStops = sortedColors.map(gc => `${gc.color} ${gc.position}%`).join(', ');
    
    if (element.gradientType === 'radial') {
      return {
        background: `radial-gradient(circle, ${colorStops})`
      };
    } else {
      const angle = element.gradientAngle || 45;
      return {
        background: `linear-gradient(${angle}deg, ${colorStops})`
      };
    }
  };
  const renderElement = () => {
    if (element.type === 'group') {
      return (
        <div
          style={{
            ...baseStyle,
            border: isSelected ? '2px dashed #FFD700' : '2px dashed transparent',
            backgroundColor: 'transparent'
          }}
          onMouseDown={handleMouseDown}
          onContextMenu={onContextMenu}
        />
      );
    }

    switch (element.type) {
      case 'rectangle':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...baseStyle,
              ...getGradientStyle(element),
              border: element.strokeWidth > 0 ? `${element.strokeWidth}px solid ${element.stroke}` : 'none',
              borderRadius: element.borderRadius,
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
          />
        );

      case 'circle':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...baseStyle,
              ...getGradientStyle(element),
              border: element.strokeWidth > 0 ? `${element.strokeWidth}px solid ${element.stroke}` : 'none',
              borderRadius: '50%',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
          />
        );

      case 'text':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...baseStyle,
              color: element.textColor,
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.fontStyle || 'normal',
              textTransform: element.textTransform || 'none',
              textDecoration: element.textDecoration || 'none',
              letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : 'normal',
              lineHeight: element.lineHeight || 1.2,
              wordSpacing: element.wordSpacing ? `${element.wordSpacing}px` : 'normal',
              textAlign: element.textAlign || 'left',
              display: 'flex',
              alignItems: element.verticalAlign === 'top' ? 'flex-start' : 
                        element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
              justifyContent: element.textAlign === 'center' ? 'center' : 
                           element.textAlign === 'right' ? 'flex-end' : 
                           element.textAlign === 'justify' ? 'stretch' : 'flex-start',
              padding: '4px',
              whiteSpace: element.textAlign === 'justify' ? 'normal' : 'pre-wrap',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
          >
            {element.text}
          </div>
        );

      case 'button':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...baseStyle,
              ...getGradientStyle(element),
              border: element.strokeWidth > 0 ? `${element.strokeWidth}px solid ${element.stroke}` : 'none',
              borderRadius: element.borderRadius,
              color: element.textColor,
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.fontStyle || 'normal',
              textTransform: element.textTransform || 'none',
              textDecoration: element.textDecoration || 'none',
              letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : 'normal',
              lineHeight: element.lineHeight || 1.2,
              wordSpacing: element.wordSpacing ? `${element.wordSpacing}px` : 'normal',
              textAlign: element.textAlign || 'center',
              display: 'flex',
              alignItems: element.verticalAlign === 'top' ? 'flex-start' : 
                        element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
              justifyContent: element.textAlign === 'center' ? 'center' : 
                           element.textAlign === 'right' ? 'flex-end' : 
                           element.textAlign === 'justify' ? 'stretch' : 'flex-start',
              whiteSpace: element.textAlign === 'justify' ? 'normal' : 'pre-wrap',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
          >
            {element.text}
          </div>
        );

      case 'chat-bubble':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...baseStyle,
              ...getGradientStyle(element),
              border: element.strokeWidth > 0 ? `${element.strokeWidth}px solid ${element.stroke}` : 'none',
              borderRadius: element.borderRadius,
              color: element.textColor,
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.fontStyle || 'normal',
              textTransform: element.textTransform || 'none',
              letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : 'normal',
              lineHeight: element.lineHeight || 1.2,
              wordSpacing: element.wordSpacing ? `${element.wordSpacing}px` : 'normal',
              textDecoration: element.textDecoration || 'none',
              display: 'flex',
              alignItems: element.verticalAlign === 'top' ? 'flex-start' : 
                        element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
              justifyContent: element.textAlign === 'center' ? 'center' : 
                           element.textAlign === 'right' ? 'flex-end' : 
                           element.textAlign === 'justify' ? 'stretch' : 'flex-start',
              textAlign: element.textAlign || 'left',
              padding: '12px 16px',
              whiteSpace: element.textAlign === 'justify' ? 'normal' : 'pre-wrap',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
          >
            {element.text}
          </div>
        );

      case 'chat-frame':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...baseStyle,
              ...getGradientStyle(element),
              border: element.strokeWidth > 0 ? `${element.strokeWidth}px solid ${element.stroke}` : 'none',
              borderRadius: element.borderRadius,
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
          >
            {/* Phone notch */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '40%',
                height: '20px',
                ...(element.gradientEnabled ? getGradientStyle(element) : { backgroundColor: element.fill }),
                borderRadius: '0 0 12px 12px'
              }}
            />
          </div>
        );
        
      case 'line':
        return (
          <LineComponent
            element={element}
            isSelected={isSelected}
            onUpdate={onUpdate}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
            absoluteX={absoluteX}
            absoluteY={absoluteY}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div>
      {renderElement()}
      
      {/* Selection outline and handles */}
      {isSelected && !element.locked && element.type !== 'group' && (
        <div
          style={{
            position: 'absolute',
            left: absoluteX - 2,
            top: absoluteY - 2,
            width: element.width + 4,
            height: element.height + 4,
            border: '2px solid #FFD700',
            borderRadius: element.borderRadius + 2,
            pointerEvents: 'none'
          }}
        >
          {/* Resize handle */}
          <div
            style={{
              position: 'absolute',
              right: -12,
              bottom: -12,
              width: 24,
              height: 24,
              backgroundColor: '#FFD700',
              border: '2px solid #FFA500',
              borderRadius: '4px',
              cursor: 'se-resize',
              pointerEvents: 'auto'
            }}
            onMouseDown={handleResizeStart}
          />
        </div>
      )}
    </div>
  );
};

export default DesignElementComponent;