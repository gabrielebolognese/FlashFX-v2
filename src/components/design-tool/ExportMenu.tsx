import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image, Film, Layers, FolderDown } from 'lucide-react';

interface ExportMenuProps {
  isOpen: boolean;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
  onExportDesign: () => void;
  onRenderSequence: () => void;
  onExportLayers: () => void;
  onDownloadProject: () => void;
}

const ExportMenu: React.FC<ExportMenuProps> = ({
  isOpen,
  onClose,
  buttonRef,
  onExportDesign,
  onRenderSequence,
  onExportLayers,
  onDownloadProject,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
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
        right: `${position.right}px`,
        minWidth: '200px',
      }}
    >
      <div className="py-1">
        <button
          onClick={() => { onExportDesign(); onClose(); }}
          className="w-full px-3 py-2 flex items-center space-x-2 hover:bg-gray-700/50 transition-colors text-left"
        >
          <Image className="w-4 h-4 text-white" />
          <span className="text-sm text-white">Export Design (png)</span>
        </button>

        <button
          onClick={() => { onRenderSequence(); onClose(); }}
          className="w-full px-3 py-2 flex items-center space-x-2 hover:bg-gray-700/50 transition-colors text-left"
        >
          <Film className="w-4 h-4 text-white" />
          <span className="text-sm text-white">Render sequence</span>
        </button>

        <button
          onClick={() => { onExportLayers(); onClose(); }}
          className="w-full px-3 py-2 flex items-center space-x-2 hover:bg-gray-700/50 transition-colors text-left"
        >
          <Layers className="w-4 h-4 text-white" />
          <span className="text-sm text-white">Export layers</span>
        </button>

        <button
          onClick={() => { onDownloadProject(); onClose(); }}
          className="w-full px-3 py-2 flex items-center space-x-2 hover:bg-gray-700/50 transition-colors text-left"
        >
          <FolderDown className="w-4 h-4 text-white" />
          <span className="text-sm text-white">Download project</span>
        </button>
      </div>
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default ExportMenu;
