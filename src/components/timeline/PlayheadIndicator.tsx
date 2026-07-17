import React, { useRef, useEffect, useCallback } from 'react';
import { usePlayback } from '../../animation-engine';

interface PlayheadIndicatorProps {
  pixelsPerSecond: number;
  isDraggable?: boolean;
  showHandle?: boolean;
  className?: string;
  isSnapped?: boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
  duration?: number;
  seekTo?: (time: number) => void;
  layoutZoom?: number;
  onFindSnap?: (time: number) => number | null;
  onSnapChange?: (isSnapped: boolean) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onTimeChange?: (time: number) => void;
}

const PlayheadIndicator = React.forwardRef<HTMLDivElement, PlayheadIndicatorProps>(({
  pixelsPerSecond,
  isDraggable = false,
  showHandle = false,
  className = '',
  isSnapped = false,
  containerRef,
  duration: durationProp,
  seekTo: seekToProp,
  layoutZoom = 0.8,
  onFindSnap,
  onSnapChange,
  onDragStart,
  onDragEnd,
  onTimeChange,
}, forwardedRef) => {
  const { currentTime } = usePlayback();
  const lineRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(0);

  const setLineRef = useCallback((el: HTMLDivElement | null) => {
    (lineRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  }, [forwardedRef]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    if (lineRef.current) {
      lineRef.current.style.transform = `translateX(${currentTime * pixelsPerSecond}px)`;
    }
  }, [currentTime, pixelsPerSecond]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (!isDraggable) return;
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef?.current ?? null;
    const pixPerSec = pixelsPerSecond;
    const dur = durationProp ?? 10;
    const zoom = layoutZoom;

    isDraggingRef.current = true;
    onDragStart?.();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    const getTime = (clientX: number): number => {
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const x = (clientX - rect.left) / zoom + scrollLeft;
      const rawTime = x / pixPerSec;
      const snapped = onFindSnap?.(rawTime) ?? null;
      onSnapChange?.(snapped !== null);
      return Math.max(0, Math.min(snapped ?? rawTime, dur));
    };

    let lastClientX = e.clientX;

    const onMouseMove = (ev: MouseEvent) => {
      lastClientX = ev.clientX;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const time = getTime(lastClientX);
        if (lineRef.current) {
          lineRef.current.style.transform = `translateX(${time * pixPerSec}px)`;
        }
        onTimeChange?.(time);
      });
    };

    const onMouseUp = (ev: MouseEvent) => {
      cancelAnimationFrame(rafRef.current);
      isDraggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      onDragEnd?.();
      onSnapChange?.(false);
      const finalTime = getTime(ev.clientX);
      if (lineRef.current) {
        lineRef.current.style.transform = `translateX(${finalTime * pixPerSec}px)`;
      }
      onTimeChange?.(finalTime);
      seekToProp?.(finalTime);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [isDraggable, containerRef, pixelsPerSecond, durationProp, layoutZoom, onFindSnap, onSnapChange, onDragStart, onDragEnd, onTimeChange, seekToProp]);

  const lineColorClass = isSnapped
    ? 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
    : 'bg-amber-400';

  const handleColorClass = isSnapped
    ? 'bg-red-400 shadow-[0_0_10px_rgba(239,68,68,0.9)]'
    : 'bg-amber-400';

  return (
    <div
      ref={setLineRef}
      className={`absolute top-0 bottom-0 w-0.5 ${lineColorClass} ${className}`}
      style={{
        willChange: 'transform',
        left: 0,
        transform: `translateX(${currentTime * pixelsPerSecond}px)`,
      }}
    >
      {showHandle && (
        <div
          className={`sticky top-0 left-1/2 -translate-x-1/2 w-4 h-4 cursor-ew-resize ${handleColorClass}`}
          style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100)', zIndex: 10 }}
          onMouseDown={startDrag}
        />
      )}
      {isDraggable && (
        <div
          className="absolute inset-y-0 cursor-ew-resize"
          style={{ left: '-6px', right: '-6px', zIndex: 5 }}
          onMouseDown={startDrag}
        />
      )}
    </div>
  );
});

PlayheadIndicator.displayName = 'PlayheadIndicator';

export default PlayheadIndicator;
