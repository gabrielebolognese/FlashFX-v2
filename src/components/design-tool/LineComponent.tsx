import React, { useState, useRef, useCallback } from 'react';
import { DesignElement } from '../../types/design';

interface LineComponentProps {
  element: DesignElement;
  isSelected: boolean;
  onUpdate: (updates: Partial<DesignElement>) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  absoluteX: number;
  absoluteY: number;
}

const LineComponent: React.FC<LineComponentProps> = ({
  element,
  isSelected,
  onUpdate,
  onMouseDown,
  onContextMenu,
  absoluteX,
  absoluteY
}) => {
  const [isDraggingPoint, setIsDraggingPoint] = useState<number | null>(null);
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const points = element.points || [{ x: 0, y: 0 }, { x: element.width, y: 0 }];
  
  // Calculate bounding box for the line
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  
  const width = Math.max(maxX - minX, 10);
  const height = Math.max(maxY - minY, 10);

  // Generate SVG path
  const generatePath = useCallback(() => {
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x - minX} ${points[0].y - minY}`;
    
    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      const prevPoint = points[i - 1];
      
      if (element.smoothing && element.smoothing > 0 && point.smooth !== false) {
        // Create smooth curves using quadratic bezier
        const smoothness = element.smoothing * 20;
        const midX = (prevPoint.x + point.x) / 2;
        const midY = (prevPoint.y + point.y) / 2;
        
        path += ` Q ${prevPoint.x - minX + smoothness} ${prevPoint.y - minY + smoothness} ${midX - minX} ${midY - minY}`;
        path += ` Q ${point.x - minX - smoothness} ${point.y - minY - smoothness} ${point.x - minX} ${point.y - minY}`;
      } else {
        path += ` L ${point.x - minX} ${point.y - minY}`;
      }
    }
    
    return path;
  }, [points, minX, minY, element.smoothing]);

  // Generate arrowhead markers
  const generateArrowhead = (type: string, size: number, id: string) => {
    const markerSize = size;
    
    switch (type) {
      case 'triangle':
        return (
          <marker
            id={id}
            markerWidth={markerSize}
            markerHeight={markerSize}
            refX={markerSize - 1}
            refY={markerSize / 2}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon
              points={`0,0 0,${markerSize} ${markerSize},${markerSize / 2}`}
              fill={element.stroke}
            />
          </marker>
        );
      case 'circle':
        return (
          <marker
            id={id}
            markerWidth={markerSize}
            markerHeight={markerSize}
            refX={markerSize / 2}
            refY={markerSize / 2}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <circle
              cx={markerSize / 2}
              cy={markerSize / 2}
              r={markerSize / 3}
              fill={element.stroke}
            />
          </marker>
        );
      case 'bar':
        return (
          <marker
            id={id}
            markerWidth={markerSize}
            markerHeight={markerSize}
            refX={markerSize / 2}
            refY={markerSize / 2}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <rect
              x={markerSize / 2 - 1}
              y={0}
              width={2}
              height={markerSize}
              fill={element.stroke}
            />
          </marker>
        );
      case 'diamond':
        return (
          <marker
            id={id}
            markerWidth={markerSize}
            markerHeight={markerSize}
            refX={markerSize / 2}
            refY={markerSize / 2}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon
              points={`${markerSize / 2},0 ${markerSize},${markerSize / 2} ${markerSize / 2},${markerSize} 0,${markerSize / 2}`}
              fill={element.stroke}
            />
          </marker>
        );
      default:
        return null;
    }
  };

  const handlePointDrag = useCallback((e: React.MouseEvent, pointIndex: number) => {
    e.stopPropagation();
    setIsDraggingPoint(pointIndex);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!svgRef.current) return;
      
      const rect = svgRef.current.getBoundingClientRect();
      const newX = (moveEvent.clientX - rect.left) + minX;
      const newY = (moveEvent.clientY - rect.top) + minY;
      
      const newPoints = [...points];
      newPoints[pointIndex] = { ...newPoints[pointIndex], x: newX, y: newY };
      
      onUpdate({ points: newPoints });
    };
    
    const handleMouseUp = () => {
      setIsDraggingPoint(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [points, minX, minY, onUpdate]);

  const handleAddPoint = useCallback((e: React.MouseEvent) => {
    if (!isSelected || element.lineType !== 'pen') return;
    
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const newX = (e.clientX - rect.left) + minX;
    const newY = (e.clientY - rect.top) + minY;
    
    const newPoints = [...points, { x: newX, y: newY }];
    onUpdate({ points: newPoints });
  }, [isSelected, element.lineType, points, minX, minY, onUpdate]);

  const dashArrayString = element.dashArray && element.dashArray.length > 0 
    ? element.dashArray.join(',') 
    : undefined;

  const trimmedPath = generatePath();
  const pathLength = trimmedPath ? 1000 : 0; // Approximate path length for trim effect
  const trimStartOffset = (element.trimStart || 0) * pathLength;
  const trimEndOffset = (1 - (element.trimEnd || 1)) * pathLength;

  return (
    <div
      data-element-id={element.id}
      style={{
        position: 'absolute',
        left: absoluteX + minX,
        top: absoluteY + minY,
        width: width,
        height: height,
        opacity: element.opacity,
        transform: `rotate(${element.rotation}deg)`,
        pointerEvents: element.locked ? 'none' : 'auto'
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ overflow: 'visible' }}
        onClick={handleAddPoint}
      >
        <defs>
          {element.arrowStart && generateArrowhead(
            element.arrowheadType || 'triangle',
            element.arrowheadSize || 12,
            `arrowStart-${element.id}`
          )}
          {element.arrowEnd && generateArrowhead(
            element.arrowheadType || 'triangle',
            element.arrowheadSize || 12,
            `arrowEnd-${element.id}`
          )}
        </defs>
        
        <path
          d={trimmedPath}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          strokeLinecap={element.lineCap || 'round'}
          strokeLinejoin={element.lineJoin || 'round'}
          strokeDasharray={dashArrayString}
          strokeDashoffset={trimStartOffset}
          fill="none"
          markerStart={element.arrowStart ? `url(#arrowStart-${element.id})` : undefined}
          markerEnd={element.arrowEnd ? `url(#arrowEnd-${element.id})` : undefined}
          style={{
            filter: element.shadow.blur > 0 
              ? `drop-shadow(${element.shadow.x}px ${element.shadow.y}px ${element.shadow.blur}px ${element.shadow.color})`
              : undefined
          }}
        />
        
        {/* Control points for selected lines */}
        {isSelected && !element.locked && points.map((point, index) => (
          <circle
            key={index}
            cx={point.x - minX}
            cy={point.y - minY}
            r={4}
            fill="#FFD700"
            stroke="#FFA500"
            strokeWidth={2}
            style={{ cursor: 'move' }}
            onMouseDown={(e) => handlePointDrag(e, index)}
          />
        ))}
      </svg>
      
      {/* Selection outline */}
      {isSelected && !element.locked && (
        <div
          style={{
            position: 'absolute',
            left: -2,
            top: -2,
            width: width + 4,
            height: height + 4,
            border: '2px dashed #FFD700',
            borderRadius: 4,
            pointerEvents: 'none'
          }}
        />
      )}
    </div>
  );
};

export default LineComponent;