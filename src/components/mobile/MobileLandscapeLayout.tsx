import React, { useState, useRef, useCallback, useEffect } from 'react';
import MobileDrawer from './MobileDrawer';
import { LayoutMode } from '../../hooks/useLayoutMode';

interface MobileLandscapeLayoutProps {
  canvasElement: React.ReactNode;
  leftDrawerContent: React.ReactNode;
  rightDrawerContent: React.ReactNode;

  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExportDesign?: () => void;
  onExitToHome?: () => void;
  onSaveCurrentProject?: () => void;

  activeTool: string;
  setActiveTool: (tool: string) => void;

  currentMode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  isTransitioning: boolean;

  zoom: number;
  setZoom: (zoom: number) => void;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;

  timelineContent?: React.ReactNode;
  showTimeline?: boolean;
  onToggleTimeline?: () => void;

  children?: React.ReactNode;
}

type ActiveDrawer = 'left' | 'right' | null;

const EDGE_ZONE = 44;

const MobileLandscapeLayout: React.FC<MobileLandscapeLayoutProps> = ({
  canvasElement,
  leftDrawerContent,
  rightDrawerContent,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExportDesign,
  onExitToHome,
  onSaveCurrentProject,
  activeTool,
  setActiveTool,
  currentMode,
  setMode,
  isTransitioning,
  zoom,
  setZoom,
  pan,
  setPan,
  timelineContent,
  showTimeline = false,
  onToggleTimeline,
  children,
}) => {
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>(null);
  const [timelineVisible, setTimelineVisible] = useState(showTimeline);
  const containerRef = useRef<HTMLDivElement>(null);
  const edgeDragRef = useRef<{ side: 'left' | 'right'; startX: number } | null>(null);

  useEffect(() => {
    setTimelineVisible(showTimeline);
  }, [showTimeline]);

  const openDrawer = useCallback((side: 'left' | 'right') => {
    setActiveDrawer(side);
  }, []);

  const closeDrawer = useCallback(() => {
    setActiveDrawer(null);
  }, []);

  const handleEdgeTouchStart = useCallback((e: React.TouchEvent) => {
    if (activeDrawer) return;
    const touch = e.touches[0];
    const w = window.innerWidth;
    if (touch.clientX < EDGE_ZONE) {
      edgeDragRef.current = { side: 'left', startX: touch.clientX };
    } else if (touch.clientX > w - EDGE_ZONE) {
      edgeDragRef.current = { side: 'right', startX: touch.clientX };
    }
  }, [activeDrawer]);

  const handleEdgeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!edgeDragRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - edgeDragRef.current.startX;
    const threshold = 40;
    if (edgeDragRef.current.side === 'left' && dx > threshold) {
      openDrawer('left');
    } else if (edgeDragRef.current.side === 'right' && dx < -threshold) {
      openDrawer('right');
    }
    edgeDragRef.current = null;
  }, [openDrawer]);

  const isEditMode = currentMode === 'edit';

  const toolIcon = (tool: string) => {
    if (tool === 'select') return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 3l14 9-7 1-4 7z" />
      </svg>
    );
    if (tool === 'pen') return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    );
    if (tool === 'line') return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="5" y1="19" x2="19" y2="5" />
      </svg>
    );
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-gray-900"
      style={{ touchAction: 'none' }}
      onTouchStart={handleEdgeTouchStart}
      onTouchEnd={handleEdgeTouchEnd}
    >
      {/* Canvas - full screen base layer */}
      <div className="absolute inset-0 z-0">
        {canvasElement}
      </div>

      {/* Timeline overlay - anchored to bottom above bottom strip */}
      {timelineVisible && timelineContent && (
        <div
          className="absolute left-0 right-0 z-20 bg-gray-900/95 border-t border-gray-700/60"
          style={{ bottom: 44, height: '20vh', minHeight: 80 }}
        >
          {timelineContent}
        </div>
      )}

      {/* Top minimal bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-1 px-2 py-1.5 bg-gray-900/90 border-b border-gray-700/50 backdrop-blur-sm" style={{ height: 44 }}>
        {/* Left drawer trigger */}
        <button
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-700/60 text-gray-300 hover:bg-gray-600/60 active:bg-gray-500/60 transition-colors"
          onPointerDown={() => openDrawer('left')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Undo */}
        <button
          className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${canUndo ? 'bg-gray-700/60 text-gray-200 hover:bg-gray-600/60 active:bg-gray-500/60' : 'bg-gray-800/40 text-gray-600'}`}
          onPointerDown={canUndo ? onUndo : undefined}
          disabled={!canUndo}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
        </button>

        {/* Redo */}
        <button
          className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${canRedo ? 'bg-gray-700/60 text-gray-200 hover:bg-gray-600/60 active:bg-gray-500/60' : 'bg-gray-800/40 text-gray-600'}`}
          onPointerDown={canRedo ? onRedo : undefined}
          disabled={!canRedo}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 14 20 9 15 4" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" />
          </svg>
        </button>

        {/* Zoom display */}
        <div className="flex items-center gap-1 ml-1">
          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-700/60 text-gray-300 hover:bg-gray-600/60 active:bg-gray-500/60 transition-colors"
            onPointerDown={() => setZoom(Math.max(0.05, zoom - 0.1))}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <span className="text-xs text-gray-400 w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-700/60 text-gray-300 hover:bg-gray-600/60 active:bg-gray-500/60 transition-colors"
            onPointerDown={() => setZoom(Math.min(3, zoom + 0.1))}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>

        <div className="flex-1" />

        {/* Save */}
        {onSaveCurrentProject && (
          <button
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-700/60 text-gray-300 hover:bg-gray-600/60 active:bg-gray-500/60 transition-colors"
            onPointerDown={onSaveCurrentProject}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>
          </button>
        )}

        {/* Export */}
        {onExportDesign && (
          <button
            className="flex items-center justify-center h-9 px-3 rounded-lg bg-blue-600/80 text-white hover:bg-blue-500/80 active:bg-blue-700/80 transition-colors text-xs font-semibold"
            onPointerDown={onExportDesign}
          >
            Export
          </button>
        )}

        {/* Right drawer trigger */}
        <button
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-700/60 text-gray-300 hover:bg-gray-600/60 active:bg-gray-500/60 transition-colors ml-1"
          onPointerDown={() => openDrawer('right')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Bottom control strip */}
      <div
        className="absolute left-0 right-0 bottom-0 z-30 flex items-center gap-1 px-2 bg-gray-900/90 border-t border-gray-700/50 backdrop-blur-sm"
        style={{ height: 44 }}
      >
        {/* Mode buttons */}
        <button
          className={`flex items-center justify-center h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${currentMode === 'design' ? 'bg-gray-600 text-white' : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'}`}
          onPointerDown={() => setMode('design')}
        >
          Design
        </button>
        <button
          className={`flex items-center justify-center h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${currentMode === 'edit' ? 'bg-gray-600 text-white' : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'}`}
          onPointerDown={() => setMode('edit')}
        >
          Edit
        </button>

        <div className="w-px h-6 bg-gray-700/60 mx-1" />

        {/* Drawing tool buttons */}
        {(['select', 'pen', 'line'] as const).map(tool => (
          <button
            key={tool}
            className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs transition-colors ${activeTool === tool ? 'bg-blue-600/80 text-white' : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'}`}
            onPointerDown={() => setActiveTool(tool)}
            title={tool}
          >
            {toolIcon(tool)}
          </button>
        ))}

        <div className="flex-1" />

        {/* Timeline toggle */}
        {isEditMode && (
          <button
            className={`flex items-center justify-center w-9 h-8 rounded-lg text-xs transition-colors ${timelineVisible ? 'bg-blue-600/80 text-white' : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'}`}
            onPointerDown={() => setTimelineVisible(v => !v)}
            title="Toggle Timeline"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="3" rx="1" /><rect x="3" y="10" width="12" height="3" rx="1" /><rect x="3" y="16" width="16" height="3" rx="1" />
            </svg>
          </button>
        )}

        {/* Exit */}
        {onExitToHome && (
          <button
            className="flex items-center justify-center w-9 h-8 rounded-lg bg-gray-800/60 text-gray-400 hover:bg-gray-700/60 active:bg-gray-600/60 transition-colors"
            onPointerDown={onExitToHome}
            title="Exit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        )}
      </div>

      {/* Left Drawer */}
      <MobileDrawer side="left" isOpen={activeDrawer === 'left'} onClose={closeDrawer} title="Layers & Media">
        {leftDrawerContent}
      </MobileDrawer>

      {/* Right Drawer */}
      <MobileDrawer side="right" isOpen={activeDrawer === 'right'} onClose={closeDrawer} title="Properties">
        {rightDrawerContent}
      </MobileDrawer>

      {/* Portal-mounted modals/overlays */}
      {children}
    </div>
  );
};

export default MobileLandscapeLayout;
