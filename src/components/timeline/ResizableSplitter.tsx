import React, { useState, useCallback } from 'react';

interface ResizableSplitterProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

const ResizableSplitter: React.FC<ResizableSplitterProps> = ({
  direction,
  onResize,
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartPos(direction === 'horizontal' ? e.clientX : e.clientY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - (direction === 'horizontal' ? e.clientX : e.clientY);
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, onResize]);

  const cursorClass = direction === 'horizontal' ? 'cursor-ew-resize' : 'cursor-ns-resize';
  const sizeClass = direction === 'horizontal' ? 'w-1 h-full' : 'h-1 w-full';
  const hoverClass = direction === 'horizontal' ? 'hover:bg-blue-500/50' : 'hover:bg-blue-500/50';

  return (
    <div
      className={`${sizeClass} ${cursorClass} ${hoverClass} ${
        isDragging ? 'bg-blue-500' : 'bg-gray-700/30'
      } transition-colors relative group ${className}`}
      onMouseDown={handleMouseDown}
    >
      <div className={`absolute inset-0 ${direction === 'horizontal' ? 'w-2 -translate-x-1/2' : 'h-2 -translate-y-1/2'}`} />
    </div>
  );
};

export default ResizableSplitter;
