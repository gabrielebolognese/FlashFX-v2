import React, { useState } from 'react';
import { Palette, Film, Zap, BookOpen, GraduationCap } from 'lucide-react';
import { LayoutMode } from '../../hooks/useLayoutMode';
import { DocumentationModal } from '../modals/DocumentationModal';

interface LayoutBarProps {
  currentMode: LayoutMode;
  onModeChange: (mode: LayoutMode) => void;
  isTransitioning: boolean;
  onRequestAdvancedMode?: () => void;
  onStartTutorial?: () => void;
}

const LayoutBar: React.FC<LayoutBarProps> = ({
  currentMode,
  onModeChange,
  isTransitioning,
  onRequestAdvancedMode,
  onStartTutorial
}) => {
  const [showDocModal, setShowDocModal] = useState(false);

  const handleModeChange = (mode: LayoutMode) => {
    if (mode === 'advanced' && currentMode !== 'advanced' && onRequestAdvancedMode) {
      const hideWarning = localStorage.getItem('hideAdvancedModeWarning') === 'true';
      if (hideWarning) {
        onModeChange(mode);
      } else {
        onRequestAdvancedMode();
      }
    } else {
      onModeChange(mode);
    }
  };
  return (
    <div
      data-tutorial-target="layout-bar"
      className="w-full flex items-center px-4 backdrop-blur-xl border-t py-2"
      style={{
        backgroundColor: 'rgba(31, 41, 55, 0.5)',
        borderColor: 'rgba(55, 65, 81, 0.5)'
      }}
    >
      {/* Tutorial Button - Left */}
      <div className="flex-1">
        {onStartTutorial && (
          <button
            onClick={onStartTutorial}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Tutorial</span>
          </button>
        )}
      </div>

      {/* Mode Tabs - Center */}
      <div
        className="flex items-center gap-1 rounded-lg p-1 border"
        style={{
          backgroundColor: 'rgba(17, 24, 39, 0.8)',
          borderColor: 'rgba(55, 65, 81, 0.5)'
        }}
      >
        <button
          onClick={() => handleModeChange('design')}
          disabled={isTransitioning}
          className={`
            flex items-center justify-center gap-2 px-6 py-2 rounded-md font-medium text-sm
            transition-all duration-200
            ${isTransitioning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          style={currentMode === 'design'
            ? { backgroundColor: 'rgba(55, 65, 81, 0.9)', color: '#ffffff' }
            : { color: '#9CA3AF' }
          }
          onMouseEnter={(e) => {
            if (currentMode !== 'design' && !isTransitioning) {
              e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.4)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            if (currentMode !== 'design') {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#9CA3AF';
            }
          }}
        >
          <Palette className="w-4 h-4" />
          <span>Design</span>
        </button>

        <button
          onClick={() => handleModeChange('edit')}
          disabled={isTransitioning}
          data-tutorial-target="edit-mode-button"
          className={`
            flex items-center justify-center gap-2 px-6 py-2 rounded-md font-medium text-sm
            transition-all duration-200
            ${isTransitioning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          style={currentMode === 'edit'
            ? { backgroundColor: 'rgba(55, 65, 81, 0.9)', color: '#ffffff' }
            : { color: '#9CA3AF' }
          }
          onMouseEnter={(e) => {
            if (currentMode !== 'edit' && !isTransitioning) {
              e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.4)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            if (currentMode !== 'edit') {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#9CA3AF';
            }
          }}
        >
          <Film className="w-4 h-4" />
          <span>Edit</span>
        </button>

        <button
          onClick={() => handleModeChange('advanced')}
          disabled={isTransitioning}
          className={`
            flex items-center justify-center gap-2 px-6 py-2 rounded-md font-medium text-sm
            transition-all duration-200
            ${isTransitioning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          style={currentMode === 'advanced'
            ? { backgroundColor: 'rgba(55, 65, 81, 0.9)', color: '#ffffff' }
            : { color: '#9CA3AF' }
          }
          onMouseEnter={(e) => {
            if (currentMode !== 'advanced' && !isTransitioning) {
              e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.4)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            if (currentMode !== 'advanced') {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#9CA3AF';
            }
          }}
        >
          <Zap className="w-4 h-4" />
          <span>Advanced</span>
        </button>

      </div>

      {/* Documentation Button - Right */}
      <div className="flex-1 flex justify-end">
        <button
          onClick={() => setShowDocModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          <span>Documentation</span>
        </button>
      </div>

      <DocumentationModal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
      />
    </div>
  );
};

export default LayoutBar;
