import React, { useState, useRef, useCallback } from 'react';
import { DesignElement } from '../../types/design';

interface EnhancedLineComponentProps {
  element: DesignElement;
  isSelected: boolean;
  isHovered: boolean;
  onUpdate: (updates: Partial<DesignElement>) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick?: (x: number, y: number) => void;
  absoluteX: number;
  absoluteY: number;
  zoom?: number;
}

interface PointHandle {
  x: number;
  y: number;
  index: number;
}

const EnhancedLineComponent: React.FC<EnhancedLineComponentProps> = ({
  element,
  isSelected,
  isHovered,
  onUpdate,
  onMouseDown,
  onContextMenu,
  onDoubleClick,
  absoluteX,
  absoluteY,
  zoom = 1
}) => {
  const [isDraggingPoint, setIsDraggingPoint] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [contextMenuPoint, setContextMenuPoint] = useState<number | null>(null);
  const [isDuplicatingPoint, setIsDuplicatingPoint] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const points = element.points || [{ x: 0, y: 0 }, { x: element.width, y: 0 }];
  
  // Calculate enhanced bounding box
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  
  const padding = 20; // Extra padding for handles
  const width = Math.max(maxX - minX + padding * 2, 20);
  const height = Math.max(maxY - minY + padding * 2, 20);

  // Enhanced path generation with corner radius support
  const generateEnhancedPath = useCallback(() => {
    if (points.length < 2) return '';
    
    const adjustedPoints = points.map(p => ({
      x: p.x - minX + padding,
      y: p.y - minY + padding
    }));
    
    // Check if we have corner rounding enabled
    const hasCornerRounding = element.cornerRadius && element.cornerRadius > 0;
    const pointCornerRadii = element.pointCornerRadii || [];
    
    if ((element.lineType === 'pen' && element.smoothing && element.smoothing > 0) || hasCornerRounding) {
      // Generate smooth curves with enhanced smoothing
      let path = `M ${adjustedPoints[0].x} ${adjustedPoints[0].y}`;
      
      for (let i = 1; i < adjustedPoints.length; i++) {
        const current = adjustedPoints[i];
        const previous = adjustedPoints[i - 1];
        const originalPoint = points[i];
        
        // Check for corner rounding at this point
        const pointCornerRadius = pointCornerRadii[i] || element.cornerRadius || 0;
        const shouldRound = originalPoint.smooth !== false || pointCornerRadius > 0;
        
        if (shouldRound && i > 0 && i < adjustedPoints.length - 1) {
          // Calculate corner rounding for this connection point
          const radius = pointCornerRadius > 0 ? pointCornerRadius * 10 : (element.smoothing || 0) * 30;
          
          const prev = adjustedPoints[i - 1];
          const next = adjustedPoints[i + 1] || current;
          
          // Calculate vectors for rounded corner
          const vec1 = { x: prev.x - current.x, y: prev.y - current.y };
          const vec2 = { x: next.x - current.x, y: next.y - current.y };
          
          const len1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
          const len2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);
          
          if (len1 > 0 && len2 > 0) {
            // Normalize vectors
            vec1.x /= len1; vec1.y /= len1;
            vec2.x /= len2; vec2.y /= len2;
            
            // Calculate control points for smooth corner
            const controlRadius = Math.min(radius, len1 / 3, len2 / 3);
            const cp1x = current.x + vec1.x * controlRadius;
            const cp1y = current.y + vec1.y * controlRadius;
            const cp2x = current.x + vec2.x * controlRadius;
            const cp2y = current.y + vec2.y * controlRadius;
            
            // Create smooth corner transition
            path += ` L ${cp1x} ${cp1y}`;
            path += ` Q ${current.x} ${current.y} ${cp2x} ${cp2y}`;
          } else {
            path += ` L ${current.x} ${current.y}`;
          }
        } else {
          path += ` L ${current.x} ${current.y}`;
        }
      }
      
      // Close path if enabled
      if (element.closePath) {
        path += ' Z';
      }
      
      return path;
    } else {
      // Standard linear path
      let path = `M ${adjustedPoints[0].x} ${adjustedPoints[0].y}`;
      for (let i = 1; i < adjustedPoints.length; i++) {
        path += ` L ${adjustedPoints[i].x} ${adjustedPoints[i].y}`;
      }
      
      if (element.closePath) {
        path += ' Z';
      }
      
      return path;
    }
  }, [points, minX, minY, element.smoothing, element.lineType, element.closePath, padding]);

  // Enhanced arrowhead generation
  const generateEnhancedArrowhead = (type: string, size: number, id: string) => {
    const actualSize = element.autoScaleArrows ? element.strokeWidth * 3 : size;
    
    switch (type) {
      case 'triangle':
        return (
          <marker
            id={id}
            markerWidth={actualSize * 2}
            markerHeight={actualSize * 2}
            refX={actualSize * 1.5}
            refY={actualSize}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon
              points={`0,0 0,${actualSize * 2} ${actualSize * 2},${actualSize}`}
              fill={element.stroke}
              stroke={element.stroke}
              strokeWidth="1"
            />
          </marker>
        );
      case 'circle':
        return (
          <marker
            id={id}
            markerWidth={actualSize * 2}
            markerHeight={actualSize * 2}
            refX={actualSize}
            refY={actualSize}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <circle
              cx={actualSize}
              cy={actualSize}
              r={actualSize * 0.8}
              fill={element.stroke}
              stroke={element.stroke}
              strokeWidth="1"
            />
          </marker>
        );
      case 'diamond':
        return (
          <marker
            id={id}
            markerWidth={actualSize * 2}
            markerHeight={actualSize * 2}
            refX={actualSize}
            refY={actualSize}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon
              points={`${actualSize},0 ${actualSize * 2},${actualSize} ${actualSize},${actualSize * 2} 0,${actualSize}`}
              fill={element.stroke}
              stroke={element.stroke}
              strokeWidth="1"
            />
          </marker>
        );
      case 'bar':
        return (
          <marker
            id={id}
            markerWidth={actualSize}
            markerHeight={actualSize * 2}
            refX={actualSize / 2}
            refY={actualSize}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <rect
              x={0}
              y={0}
              width={actualSize / 2}
              height={actualSize * 2}
              fill={element.stroke}
            />
          </marker>
        );
      default:
        return null;
    }
  };

  // Enhanced point dragging with real-time preview
  const handlePointDrag = useCallback((e: React.MouseEvent, pointIndex: number) => {
    e.stopPropagation();
    
    // Check for CTRL key for point duplication
    if (e.ctrlKey) {
      setIsDuplicatingPoint(true);
      // Create duplicate point at current position
      const pointToDuplicate = points[pointIndex];
      const newPoint = { 
        ...pointToDuplicate,
        x: pointToDuplicate.x + 20,
        y: pointToDuplicate.y + 20
      };
      const newPoints = [...points];
      newPoints.splice(pointIndex + 1, 0, newPoint);
      onUpdate({ points: newPoints });
      
      // Start dragging the new point immediately
      setIsDraggingPoint(pointIndex + 1);
    } else {
      setIsDraggingPoint(pointIndex);
    }
    
    setIsDraggingPoint(pointIndex);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!svgRef.current) return;
      
      const rect = svgRef.current.getBoundingClientRect();
      const zoomAdjustedX = (moveEvent.clientX - rect.left) / zoom;
      const zoomAdjustedY = (moveEvent.clientY - rect.top) / zoom;
      
      let newX = zoomAdjustedX + minX - padding;
      let newY = zoomAdjustedY + minY - padding;
      
      // Snap to 45-degree angles if Shift is held
      if (moveEvent.shiftKey && points.length >= 2) {
        const referencePoint = pointIndex > 0 ? points[pointIndex - 1] : points[pointIndex + 1];
        if (referencePoint) {
          const deltaX = newX - referencePoint.x;
          const deltaY = newY - referencePoint.y;
          const angle = Math.atan2(deltaY, deltaX);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          
          newX = referencePoint.x + Math.cos(snappedAngle) * distance;
          newY = referencePoint.y + Math.sin(snappedAngle) * distance;
        }
      }
      
      const newPoints = [...points];
      newPoints[pointIndex] = { ...newPoints[pointIndex], x: newX, y: newY };
      
      onUpdate({ points: newPoints });
    };
    
    const handleMouseUp = () => {
      setIsDraggingPoint(null);
      setIsDuplicatingPoint(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [points, minX, minY, onUpdate, zoom, padding]);

  // Handle double-click to add points
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!isSelected) return;
    
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clickX = (e.clientX - rect.left) / zoom + minX - padding;
    const clickY = (e.clientY - rect.top) / zoom + minY - padding;
    
    // Find the closest segment to insert the new point
    let closestSegment = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      // Calculate distance from click point to line segment
      const segmentLength = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      const t = Math.max(0, Math.min(1, ((clickX - p1.x) * (p2.x - p1.x) + (clickY - p1.y) * (p2.y - p1.y)) / (segmentLength ** 2)));
      const projectedX = p1.x + t * (p2.x - p1.x);
      const projectedY = p1.y + t * (p2.y - p1.y);
      const distance = Math.sqrt((clickX - projectedX) ** 2 + (clickY - projectedY) ** 2);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestSegment = i;
      }
    }
    
    const newPoint = { 
      x: clickX, 
      y: clickY, 
      smooth: true, 
      cornerRadius: 0 
    };
    
    const newPoints = [...points];
    newPoints.splice(closestSegment + 1, 0, newPoint);
    onUpdate({ points: newPoints });
  }, [isSelected, element.lineType, points, minX, minY, onUpdate, zoom, padding]);

  // Handle right-click on points
  const handlePointContextMenu = useCallback((e: React.MouseEvent, pointIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPoint(pointIndex);
    
    // Simple context menu for point deletion
    if (points.length > 2) {
      if (confirm(`Delete point ${pointIndex + 1}?`)) {
        removePoint(pointIndex);
      }
    }
  }, [points.length]);

  const removePoint = (index: number) => {
    if (points.length > 2) {
      const newPoints = points.filter((_, i) => i !== index);
      onUpdate({ points: newPoints });
    }
  };

  const dashArrayString = element.dashArray && element.dashArray.length > 0 
    ? element.dashArray.join(',') 
    : undefined;

  const enhancedPath = generateEnhancedPath();
  const pathLength = 1000; // Approximate for trim effects
  const trimStartOffset = (element.trimStart || 0) * pathLength;
  const trimEndLength = ((element.trimEnd || 1) - (element.trimStart || 0)) * pathLength;

  // Enhanced handle size based on zoom level
  const handleSize = Math.max(8, Math.min(16, 12 / zoom));

  return (
    <div
      data-element-id={element.id}
      style={{
        position: 'absolute',
        left: absoluteX + minX - padding,
        top: absoluteY + minY - padding,
        width: width,
        height: height,
        opacity: element.opacity,
        transform: `rotate(${element.rotation}deg)`,
        pointerEvents: element.locked ? 'none' : 'auto'
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ overflow: 'visible' }}
        className="absolute inset-0"
      >
        <defs>
          {element.arrowStart && generateEnhancedArrowhead(
            element.arrowheadType || 'triangle',
            element.arrowheadSize || 12,
            `arrowStart-${element.id}`
          )}
          {element.arrowEnd && generateEnhancedArrowhead(
            element.arrowheadType || 'triangle',
            element.arrowheadSize || 12,
            `arrowEnd-${element.id}`
          )}
        </defs>
        
        {/* Main path */}
        <path
          d={enhancedPath}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          strokeLinecap={element.lineCap || 'round'}
          strokeLinejoin={element.lineJoin || 'round'}
          strokeDasharray={dashArrayString}
          strokeDashoffset={trimStartOffset}
          fill={element.lineType === 'pen' && element.closePath ? element.fill : 'none'}
          markerStart={element.arrowStart ? `url(#arrowStart-${element.id})` : undefined}
          markerEnd={element.arrowEnd ? `url(#arrowEnd-${element.id})` : undefined}
          style={{
            filter: element.shadow && element.shadow.blur > 0 
              ? `drop-shadow(${element.shadow.x}px ${element.shadow.y}px ${element.shadow.blur}px ${element.shadow.color})`
              : undefined,
            cursor: isSelected ? 'move' : 'pointer'
          }}
          className={`transition-all duration-200 ${isHovered ? 'stroke-cyan-400' : ''}`}
        />
        
        {/* Enhanced control points with larger handles */}
        {(isSelected || isHovered) && !element.locked && points.map((point, index) => (
          <g key={index}>
            {/* Handle background (larger hit area) */}
            <circle
              cx={point.x - minX + padding}
              cy={point.y - minY + padding}
              r={handleSize * 1.5}
              fill="transparent"
              style={{ cursor: 'move' }}
              onMouseDown={(e) => handlePointDrag(e, index)}
              onMouseEnter={() => setHoveredPoint(index)}
              onMouseLeave={() => setHoveredPoint(null)}
              onContextMenu={(e) => handlePointContextMenu(e, index)}
            />
            
            {/* Visible handle */}
            <circle
              cx={point.x - minX + padding}
              cy={point.y - minY + padding}
              r={handleSize}
              fill={hoveredPoint === index ? '#06B6D4' : '#FFD700'}
              stroke={hoveredPoint === index ? '#0891B2' : '#FFA500'}
              strokeWidth="2"
              style={{ 
                cursor: 'move',
                filter: hoveredPoint === index ? 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.6))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
              }}
              className="transition-all duration-200 resize-handle"
              pointerEvents="none"
            />
            
            {/* Point index label */}
            {isSelected && (
              <text
                x={point.x - minX + padding}
                y={point.y - minY + padding - handleSize - 5}
                fontSize="10"
                fill="#FFD700"
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontWeight="600"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {index + 1}
              </text>
            )}
            
            {/* Corner radius indicator for pen tool */}
            {element.lineType === 'pen' && (point.radius || element.cornerRadius || 0) > 0 && (
              <circle
                cx={point.x - minX + padding}
                cy={point.y - minY + padding}
                r={(point.radius || element.cornerRadius || 0) / 4 + 3}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="2"
                strokeDasharray="2,2"
                style={{ pointerEvents: 'none' }}
                opacity={0.7}
              />
            )}
          </g>
        ))}
      </svg>
      
      {/* Enhanced selection outline */}
      {(isSelected || isHovered) && !element.locked && (
        <div
          style={{
            position: 'absolute',
            left: -4,
            top: -4,
            width: width + 8,
            height: height + 8,
            border: `2px ${isSelected ? 'solid' : 'dashed'} ${isSelected ? '#FFD700' : 'rgba(6, 182, 212, 0.5)'}`,
            borderRadius: 8,
            pointerEvents: 'none',
            backgroundColor: isSelected ? 'rgba(255, 215, 0, 0.05)' : 'transparent'
          }}
        />
      )}
      
      {/* Path preview during editing */}
      {isDraggingPoint !== null && (
        <div
          style={{
            position: 'absolute',
            left: -2,
            top: -2,
            width: width + 4,
            height: height + 4,
            border: '1px solid rgba(6, 182, 212, 0.8)',
            borderRadius: 4,
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            pointerEvents: 'none'
          }}
        />
      )}
    </div>
  );
};

export default EnhancedLineComponent;