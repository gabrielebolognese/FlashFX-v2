import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Search, Sparkles } from 'lucide-react';

interface ImageImportMenuProps {
  isOpen: boolean;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
  onImportFile: () => void;
  onSearchImage: () => void;
  onGenerateAI: () => void;
}

const ImageImportMenu: React.FC<ImageImportMenuProps> = ({
  isOpen,
  onClose,
  buttonRef,
  onImportFile,
  onSearchImage,
  onGenerateAI,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: buttonRect.bottom + 8,
        left: buttonRect.left,
      });
    }
  }, [isOpen, buttonRef]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose, buttonRef]);

  if (!isOpen) return null;

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: '180px',
      }}
    >
      <div className="py-1">
        <button
          onClick={() => {
            onImportFile();
            onClose();
          }}
          className="w-full px-3 py-2 flex items-center space-x-2 hover:bg-gray-700/50 transition-colors text-left"
        >
          <Upload className="w-4 h-4 text-white" />
          <span className="text-sm text-white">Import Image</span>
        </button>

        <button
          onClick={() => {
            onSearchImage();
            onClose();
          }}
          className="w-full px-3 py-2 flex items-center space-x-2 hover:bg-gray-700/50 transition-colors text-left"
        >
          <Search className="w-4 h-4 text-white" />
          <span className="text-sm text-white">Search Image</span>
        </button>

        <button
          onClick={() => {
            onGenerateAI();
            onClose();
          }}
          className="w-full px-3 py-2 flex items-center space-x-2 hover:bg-gray-700/50 transition-colors text-left"
        >
          <Sparkles className="w-4 h-4 text-white" />
          <span className="text-sm text-white">Generate with AI</span>
        </button>
      </div>
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default ImageImportMenu;
