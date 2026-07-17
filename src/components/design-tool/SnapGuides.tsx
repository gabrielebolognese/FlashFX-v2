import React from 'react';
import { SnapGuide } from '../../hooks/useSnapping';

interface SnapGuidesProps {
  guides: SnapGuide[];
  canvasSize: { width: number; height: number };
  zoom: number;
  pan: { x: number; y: number };
}

const SnapGuides: React.FC<SnapGuidesProps> = ({ guides }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      {guides.map((guide) => {
        const isCanvasCenter = guide.snapType === 'canvas-center';
        const color = isCanvasCenter ? '#EF4444' : guide.color;
        const lineThickness = 2;

        if (guide.type === 'vertical') {
          const lineHeight = guide.endPos - guide.startPos;

          return (
            <React.Fragment key={guide.id}>
              <div
                className="absolute"
                style={{
                  left: guide.position,
                  top: guide.startPos,
                  width: `${lineThickness}px`,
                  height: `${lineHeight}px`,
                  backgroundColor: color,
                  transform: `translateX(-${lineThickness / 2}px)`,
                }}
              />
              {guide.markerPositions.map((marker, idx) => (
                <div
                  key={`${guide.id}-marker-${idx}`}
                  className="absolute"
                  style={{
                    left: marker.x,
                    top: marker.y,
                    width: '5px',
                    height: '5px',
                    backgroundColor: color,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </React.Fragment>
          );
        } else {
          const lineLength = guide.endPos - guide.startPos;

          return (
            <React.Fragment key={guide.id}>
              <div
                className="absolute"
                style={{
                  left: guide.startPos,
                  top: guide.position,
                  width: `${lineLength}px`,
                  height: `${lineThickness}px`,
                  backgroundColor: color,
                  transform: `translateY(-${lineThickness / 2}px)`,
                }}
              />
              {guide.markerPositions.map((marker, idx) => (
                <div
                  key={`${guide.id}-marker-${idx}`}
                  className="absolute"
                  style={{
                    left: marker.x,
                    top: marker.y,
                    width: '5px',
                    height: '5px',
                    backgroundColor: color,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </React.Fragment>
          );
        }
      })}
    </div>
  );
};

export default SnapGuides;
