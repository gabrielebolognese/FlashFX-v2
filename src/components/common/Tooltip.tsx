import React, { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  title: string;
  description: string;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({ title, description, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isVisible && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    }
  }, [isVisible]);

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <>
      {React.cloneElement(children, {
        ref: (el: HTMLElement) => {
          buttonRef.current = el;
          if (typeof children.ref === 'function') {
            children.ref(el);
          } else if (children.ref) {
            (children.ref as any).current = el;
          }
        },
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
      })}
      {isVisible && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl px-3 py-2 max-w-xs">
            <div className="text-sm font-semibold text-white mb-1">{title}</div>
            <div className="text-xs text-gray-400">{description}</div>
          </div>
        </div>
      )}
    </>
  );
};
