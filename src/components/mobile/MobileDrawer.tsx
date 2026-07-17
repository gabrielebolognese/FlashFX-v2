import React, { useRef, useEffect } from 'react';

interface MobileDrawerProps {
  side: 'left' | 'right';
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

const MobileDrawer: React.FC<MobileDrawerProps> = ({ side, isOpen, onClose, children, title }) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleTouchStart = (e: TouchEvent) => {
      dragStartX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (dragStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - dragStartX.current;
      const threshold = 60;
      if (side === 'left' && dx < -threshold) onClose();
      if (side === 'right' && dx > threshold) onClose();
      dragStartX.current = null;
    };

    const el = drawerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isOpen, side, onClose]);

  const translateValue = isOpen ? '0' : side === 'left' ? '-100%' : '100%';

  return (
    <>
      {isOpen && (
        <div
          className="absolute inset-0 bg-black/50 z-40"
          style={{ touchAction: 'none' }}
          onPointerDown={onClose}
        />
      )}
      <div
        ref={drawerRef}
        className="absolute top-0 bottom-0 z-50 flex flex-col bg-gray-800 border-gray-700/60 overflow-hidden"
        style={{
          [side]: 0,
          width: '42vw',
          maxWidth: 320,
          borderRight: side === 'left' ? '1px solid rgba(75,85,99,0.6)' : undefined,
          borderLeft: side === 'right' ? '1px solid rgba(75,85,99,0.6)' : undefined,
          transform: `translateX(${translateValue})`,
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform',
        }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/60 flex-shrink-0 bg-gray-900/80">
          {title && <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{title}</span>}
          <button
            className="ml-auto text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-700/60 transition-colors"
            onPointerDown={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
};

export default MobileDrawer;
