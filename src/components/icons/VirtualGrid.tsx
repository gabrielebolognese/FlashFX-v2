import { useEffect, useRef, useState, type ReactNode } from 'react';

interface VirtualGridProps<T> {
  items: T[];
  itemSize: number;
  gap: number;
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
}

export function VirtualGrid<T>({
  items,
  itemSize,
  gap,
  overscan = 4,
  renderItem,
  className,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cellSize = itemSize + gap;
  const columns = Math.max(1, Math.floor((containerWidth + gap) / cellSize));
  const rowCount = Math.ceil(items.length / columns);
  const totalHeight = rowCount * cellSize - (rowCount > 0 ? gap : 0);

  const startRow = Math.max(0, Math.floor(scrollTop / cellSize) - overscan);
  const visibleRows = Math.ceil(containerHeight / cellSize) + overscan * 2;
  const endRow = Math.min(rowCount, startRow + visibleRows);

  const visibleItems: { item: T; index: number; row: number; col: number }[] = [];
  for (let row = startRow; row < endRow; row++) {
    for (let col = 0; col < columns; col++) {
      const index = row * columns + col;
      if (index >= items.length) break;
      visibleItems.push({ item: items[index], index, row, col });
    }
  }

  return (
    <div
      ref={containerRef}
      className={className}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{ overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
        {visibleItems.map(({ item, index, row, col }) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              top: row * cellSize,
              left: col * cellSize,
              width: itemSize,
              height: itemSize,
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
