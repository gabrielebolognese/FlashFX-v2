import React from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, ExternalLink } from 'lucide-react';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleViewDocumentation = () => {
    window.open('https://documentation.flashfx.app', '_blank', 'noopener,noreferrer');
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-xl border shadow-2xl"
        style={{
          backgroundColor: 'rgb(17, 24, 39)',
          borderColor: 'rgba(55, 65, 81, 0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(55, 65, 81, 0.5)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(55, 65, 81, 0.6)' }}>
              <BookOpen className="w-4 h-4 text-gray-300" />
            </div>
            <span className="text-sm font-semibold text-white">Documentation</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors text-gray-500 hover:text-gray-200"
            style={{ backgroundColor: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(55,65,81,0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm text-gray-400 leading-relaxed mb-5">
            Open the FlashFX documentation in a new tab to explore guides, references, and tutorials.
          </p>

          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-colors"
              style={{ backgroundColor: 'rgba(55, 65, 81, 0.5)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.6)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.5)'; }}
            >
              Cancel
            </button>
            <button
              onClick={handleViewDocumentation}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-900 flex items-center justify-center gap-1.5 transition-colors"
              style={{ backgroundColor: '#facc15' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fbbf24'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#facc15'; }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Docs
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
