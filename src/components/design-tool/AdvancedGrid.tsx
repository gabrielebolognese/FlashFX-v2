import React from 'react';
import { GridSettings, GridCalculations } from '../../hooks/useGridSystem';

interface AdvancedGridProps {
  gridSettings: GridSettings;
  gridCalculations: GridCalculations;
  canvasSize: { width: number; height: number };
}

const AdvancedGrid: React.FC<AdvancedGridProps> = ({
  gridSettings,
  gridCalculations,
  canvasSize
}) => {
  if (!gridSettings.enabled) return null;

  const { cellWidth, cellHeight } = gridCalculations;
  const { columns, rows, color, opacity } = gridSettings;

  // Generate grid lines
  const verticalLines = [];
  const horizontalLines = [];

  // Vertical lines (columns)
  for (let i = 0; i <= columns; i++) {
    const x = i * cellWidth;
    verticalLines.push(
      <line
        key={`v-${i}`}
        x1={x}
        y1={0}
        x2={x}
        y2={canvasSize.height}
        stroke={color}
        strokeWidth={i === 0 || i === columns ? 2 : 1}
        opacity={opacity}
      />
    );
  }

  // Horizontal lines (rows)
  for (let i = 0; i <= rows; i++) {
    const y = i * cellHeight;
    horizontalLines.push(
      <line
        key={`h-${i}`}
        x1={0}
        y1={y}
        x2={canvasSize.width}
        y2={y}
        stroke={color}
        strokeWidth={i === 0 || i === rows ? 2 : 1}
        opacity={opacity}
      />
    );
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10"
      width={canvasSize.width}
      height={canvasSize.height}
      style={{ overflow: 'visible' }}
    >
      {/* Grid lines */}
      {verticalLines}
      {horizontalLines}
      
      {/* Grid dots at intersections for better visibility */}
      {gridSettings.snapEnabled && (
        <g opacity={opacity * 0.5}>
          {Array.from({ length: columns + 1 }).map((_, col) =>
            Array.from({ length: rows + 1 }).map((_, row) => (
              <circle
                key={`dot-${col}-${row}`}
                cx={col * cellWidth}
                cy={row * cellHeight}
                r={1.5}
                fill={color}
              />
            ))
          )}
        </g>
      )}
    </svg>
  );
};

export default AdvancedGrid;