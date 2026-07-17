import React, { useRef, useState, useCallback } from 'react';
import { Square, Circle, Type, MessageCircle, Smartphone, Grid2x2 as Grid, Settings, Plus, Download, Star, Palette, Layers, Upload, FolderOpen, Save, LogOut, Undo2, Redo2, Library } from 'lucide-react';
import { IconLibraryModal } from '../icons/IconLibraryModal';
import type { IconData } from '../icons/types';
import { iconToSvgString } from '../icons/iconToSvgString';
import { DesignElement } from '../../types/design';
import { createShapeAtCenter, CanvasViewport } from '../../utils/canvasUtils';
import { LayoutMode } from '../../hooks/useLayoutMode';
import ImageImportMenu from '../image/ImageImportMenu';
import ExportMenu from '../design-tool/ExportMenu';
import GoogleImageSearchModal from '../image/GoogleImageSearchModal';
import DalleGenerateModal from '../image/DalleGenerateModal';
import { getDefaultImageFilters } from '../../utils/imageFilters';

interface HorizontalShapesBarProps {
  onAddElement: (element: DesignElement) => void;
  onAddMultipleElements?: (elements: DesignElement[]) => void;
  canvasSize: { width: number; height: number };
  viewport: CanvasViewport;
  zoom?: number;
  setZoom?: (zoom: number) => void;
  onOpenGridSettings: () => void;
  onOpenEditorSettings?: () => void;
  onOpenTutorial?: () => void;
  onExportDesign?: () => void;
  onRenderSequence?: () => void;
  onExportLayers?: () => void;
  onDownloadProject?: () => void;
  gridEnabled: boolean;
  snapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onLoadProject?: () => void;
  onSaveCurrentProject?: () => void;
  onExitToHome?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  // Layout mode props
  currentMode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  isTransitioning?: boolean;
  activeTool?: string;
  onSetActiveTool?: (tool: string) => void;
}


const HorizontalShapesBar: React.FC<HorizontalShapesBarProps> = ({
  onAddElement,
  onAddMultipleElements,
  canvasSize,
  viewport,
  onOpenGridSettings,
  onOpenEditorSettings,
  onOpenTutorial,
  onExportDesign,
  onRenderSequence,
  onExportLayers,
  onDownloadProject,
  gridEnabled,
  snapEnabled,
  onToggleGrid,
  onToggleSnap,
  onLoadProject,
  onSaveCurrentProject,
  onExitToHome,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  currentMode,
  onModeChange,
  isTransitioning,
  activeTool = 'select',
  onSetActiveTool,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgFileInputRef = useRef<HTMLInputElement>(null);
  const imageButtonRef = useRef<HTMLButtonElement>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showGoogleSearch, setShowGoogleSearch] = useState(false);
  const [showDalleGenerate, setShowDalleGenerate] = useState(false);
  const [showIconLibrary, setShowIconLibrary] = useState(false);
  const handleIconSelect = useCallback((icon: IconData, color: string) => {
    const svgString = iconToSvgString(icon);
    const element = createShapeAtCenter('svg' as DesignElement['type'], canvasSize, viewport, {
      svgData: svgString,
      svgFillColor: 'none',
      svgStrokeColor: color,
    });
    onAddElement(element);
  }, [canvasSize, viewport, onAddElement]);
  const tools = [
    { icon: Square, label: 'Rectangle', type: 'rectangle' as DesignElement['type'] },
    { icon: Circle, label: 'Circle', type: 'circle' as DesignElement['type'] },
    { icon: Type, label: 'Text', type: 'text' as DesignElement['type'] },
    { icon: MessageCircle, label: 'Chat Bubble', type: 'chat-bubble' as DesignElement['type'] },
    { icon: Smartphone, label: 'Chat Frame', type: 'chat-frame' as DesignElement['type'] }
  ];

  const advancedShapes = [
    { icon: Star, label: 'Star', type: 'star' as DesignElement['type'] },
    { icon: Palette, label: 'Gradient', type: 'gradient' as DesignElement['type'] },
    { icon: Layers, label: 'Adjustment Layer', type: 'adjustment-layer' as DesignElement['type'] }
  ];

  const handleSvgUploadClick = () => {
    svgFileInputRef.current?.click();
  };

  const handleSvgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();

      // Basic validation that it's an SVG
      if (!text.trim().startsWith('<svg')) {
        alert('Please upload a valid SVG file');
        return;
      }

      // Create SVG element at center
      const element = createShapeAtCenter('svg' as DesignElement['type'], canvasSize, viewport, {
        svgData: text,
        svgFillColor: '#3B82F6',
        svgStrokeColor: '#1E40AF'
      });

      onAddElement(element);
    } catch (error) {
      console.error('Failed to load SVG file:', error);
      alert('Failed to load SVG file');
    }

    // Reset input
    if (svgFileInputRef.current) {
      svgFileInputRef.current.value = '';
    }
  };

  const handleMenuToggle = () => {
    setShowImageMenu(!showImageMenu);
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleSearchImage = () => {
    setShowGoogleSearch(true);
  };

  const handleGenerateAI = () => {
    setShowDalleGenerate(true);
  };

  const handleImportFromUrl = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = base64;
        });

        const maxImageSize = 400;
        let width = img.width;
        let height = img.height;
        const aspectRatio = width / height;

        if (width > maxImageSize || height > maxImageSize) {
          if (width > height) {
            width = maxImageSize;
            height = width / aspectRatio;
          } else {
            height = maxImageSize;
            width = height * aspectRatio;
          }
        }

        const x = canvasSize.width / 2 - width / 2;
        const y = canvasSize.height / 2 - height / 2;

        const element: DesignElement = {
          id: `${Date.now()}`,
          type: 'image',
          name: 'Imported Image',
          x,
          y,
          width,
          height,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fill: 'transparent',
          stroke: 'transparent',
          strokeWidth: 0,
          borderRadius: 0,
          shadow: {
            blur: 0,
            color: 'transparent',
            x: 0,
            y: 0
          },
          imageData: base64,
          originalWidth: img.width,
          originalHeight: img.height,
          aspectRatioLocked: true,
          blendMode: 'normal',
          filters: getDefaultImageFilters()
        };

        onAddElement(element);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Failed to import image from URL:', error);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageElements: DesignElement[] = [];
    const fileArray = Array.from(files);

    // Calculate grid layout for multiple images
    const cols = Math.ceil(Math.sqrt(fileArray.length));
    const rows = Math.ceil(fileArray.length / cols);
    const spacing = 50;
    const maxImageSize = 400;

    // Center starting position
    const startX = canvasSize.width / 2 - ((cols * maxImageSize + (cols - 1) * spacing) / 2);
    const startY = canvasSize.height / 2 - ((rows * maxImageSize + (rows - 1) * spacing) / 2);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];

      try {
        // Convert to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Load image to get dimensions
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = base64;
        });

        // Calculate scaled dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        const aspectRatio = width / height;

        if (width > maxImageSize || height > maxImageSize) {
          if (width > height) {
            width = maxImageSize;
            height = width / aspectRatio;
          } else {
            height = maxImageSize;
            width = height * aspectRatio;
          }
        }

        // Calculate position in grid
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (maxImageSize + spacing);
        const y = startY + row * (maxImageSize + spacing);

        const element: DesignElement = {
          id: `${Date.now()}-${i}`,
          type: 'image',
          name: file.name.replace(/\.[^/.]+$/, ''),
          x,
          y,
          width,
          height,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fill: 'transparent',
          stroke: 'transparent',
          strokeWidth: 0,
          borderRadius: 0,
          shadow: {
            blur: 0,
            color: 'transparent',
            x: 0,
            y: 0
          },
          imageData: base64,
          originalWidth: img.width,
          originalHeight: img.height,
          aspectRatioLocked: true,
          blendMode: 'normal',
        };

        imageElements.push(element);
      } catch (error) {
        console.error(`Failed to load image ${file.name}:`, error);
      }
    }

    // Add all images at once
    if (imageElements.length > 0) {
      if (onAddMultipleElements && imageElements.length > 1) {
        onAddMultipleElements(imageElements);
      } else {
        imageElements.forEach(el => onAddElement(el));
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-12 bg-gray-800/50 backdrop-blur-xl border-b border-gray-700/50 flex items-center justify-between px-2 flex-shrink-0 min-w-0" data-tutorial-target="toolbar">
      {/* Left side - Shape tools */}
      <div className="flex items-center min-w-0 overflow-x-auto flex-1">
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Image Import Button - FIRST */}
          <button
            ref={imageButtonRef}
            onClick={handleMenuToggle}
            data-tutorial-target="image-button"
            className="w-8 h-8 rounded-md bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 transition-all duration-200 hover:scale-105 group flex items-center justify-center relative"
            title="Import Images"
          >
            <Plus
              className={`w-4 h-4 text-gray-900 transition-all duration-300 absolute ${
                showImageMenu ? 'rotate-45 opacity-100' : 'rotate-0 opacity-100'
              }`}
            />
          </button>

          {/* Image Import Menu */}
          <ImageImportMenu
            isOpen={showImageMenu}
            onClose={() => setShowImageMenu(false)}
            buttonRef={imageButtonRef}
            onImportFile={handleImportFile}
            onSearchImage={handleSearchImage}
            onGenerateAI={handleGenerateAI}
          />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* SVG Upload Button - SECOND, next to Image Import */}
          <button
            onClick={handleSvgUploadClick}
            className="w-8 h-8 rounded-md bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 transition-all duration-200 hover:scale-105 group flex items-center justify-center"
            title="Upload SVG"
          >
            <Upload className="w-4 h-4 text-gray-900" />
          </button>

          <button
            onClick={() => setShowIconLibrary(true)}
            className="w-8 h-8 rounded-md bg-gradient-to-r from-teal-400 to-cyan-500 hover:from-teal-300 hover:to-cyan-400 transition-all duration-200 hover:scale-105 group flex items-center justify-center"
            title="Icon Library"
          >
            <Library className="w-4 h-4 text-gray-900" />
          </button>

          {/* Hidden SVG file input */}
          <input
            ref={svgFileInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            onChange={handleSvgFileChange}
            className="hidden"
          />

          {tools.map((tool, index) => {
            const isActive = activeTool === tool.type;
            return (
              <button
                key={index}
                onClick={() => onSetActiveTool?.(isActive ? 'select' : tool.type)}
                className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-105 flex items-center justify-center ${
                  isActive
                    ? 'bg-yellow-400/20 border border-yellow-400/50'
                    : 'bg-gray-700/50 hover:bg-gray-600/50 group'
                }`}
                title={tool.label}
              >
                <tool.icon className={`w-4 h-4 ${isActive ? 'text-yellow-400' : 'text-gray-300 group-hover:text-yellow-400'}`} />
              </button>
            );
          })}

          {/* Advanced Shapes - Star, Gradient, Adjustment Layer */}
          {advancedShapes.map((tool, index) => {
            const isActive = activeTool === tool.type;
            return (
              <button
                key={index}
                onClick={() => onSetActiveTool?.(isActive ? 'select' : tool.type)}
                className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-105 flex items-center justify-center ${
                  isActive
                    ? 'bg-yellow-400/20 border border-yellow-400/50'
                    : 'bg-gray-700/50 hover:bg-gray-600/50 group'
                }`}
                title={tool.label}
              >
                <tool.icon className={`w-4 h-4 ${isActive ? 'text-yellow-400' : 'text-gray-300 group-hover:text-yellow-400'}`} />
              </button>
            );
          })}

          <button
            onClick={() => onSetActiveTool?.(activeTool === 'hbox' ? 'select' : 'hbox')}
            className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-105 flex items-center justify-center ${
              activeTool === 'hbox'
                ? 'bg-yellow-400/20 border border-yellow-400/50'
                : 'bg-gray-700/50 hover:bg-gray-600/50 group'
            }`}
            title="Add HBox (horizontal layout container)"
          >
            <svg className={`w-4 h-4 ${activeTool === 'hbox' ? 'text-yellow-400' : 'text-gray-300 group-hover:text-yellow-400'}`} viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="4" width="4" height="8" rx="1" opacity="0.9"/>
              <rect x="6" y="4" width="4" height="8" rx="1" opacity="0.9"/>
              <rect x="11" y="4" width="4" height="8" rx="1" opacity="0.9"/>
            </svg>
          </button>

          <button
            onClick={() => onSetActiveTool?.(activeTool === 'vbox' ? 'select' : 'vbox')}
            className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-105 flex items-center justify-center ${
              activeTool === 'vbox'
                ? 'bg-yellow-400/20 border border-yellow-400/50'
                : 'bg-gray-700/50 hover:bg-gray-600/50 group'
            }`}
            title="Add VBox (vertical layout container)"
          >
            <svg className={`w-4 h-4 ${activeTool === 'vbox' ? 'text-yellow-400' : 'text-gray-300 group-hover:text-yellow-400'}`} viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="1" width="10" height="4" rx="1" opacity="0.9"/>
              <rect x="3" y="6" width="10" height="4" rx="1" opacity="0.9"/>
              <rect x="3" y="11" width="10" height="4" rx="1" opacity="0.9"/>
            </svg>
          </button>

        </div>
      </div>

      {/* Right side - Undo/Redo, Grid controls, Load, Settings, Export, Save, Exit */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        {/* Undo/Redo Controls */}
        {onUndo && onRedo && (
          <div className="flex items-center gap-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-105 flex items-center justify-center ${
                canUndo
                  ? 'bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30'
                  : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-105 flex items-center justify-center ${
                canRedo
                  ? 'bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30'
                  : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Grid Controls */}
        <div className="flex items-center gap-1">
        <button
          onClick={onToggleGrid}
          className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-105 flex items-center justify-center ${
            gridEnabled
              ? 'bg-yellow-400/20 text-yellow-400'
              : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300'
          }`}
          title="Toggle Grid"
        >
          <Grid className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleSnap}
          className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-105 flex items-center justify-center ${
            snapEnabled
              ? 'bg-yellow-400/20 text-yellow-400'
              : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300'
          }`}
          title="Snap to Grid"
        >
          <div className="w-4 h-4 grid grid-cols-2 gap-0.5">
            <div className="w-1 h-1 bg-current rounded-full"></div>
            <div className="w-1 h-1 bg-current rounded-full"></div>
            <div className="w-1 h-1 bg-current rounded-full"></div>
            <div className="w-1 h-1 bg-current rounded-full"></div>
          </div>
        </button>

        {onLoadProject && (
          <button
            onClick={onLoadProject}
            className="w-8 h-8 rounded-md bg-gray-700/50 hover:bg-gray-600/50 transition-all duration-200 hover:scale-105 flex items-center justify-center"
            title="Load Project"
          >
            <FolderOpen className="w-4 h-4 text-gray-300 hover:text-yellow-400" />
          </button>
        )}

        {onOpenEditorSettings && (
          <button
            onClick={onOpenEditorSettings}
            data-tutorial-target="settings-button"
            className="w-8 h-8 rounded-md bg-gray-700/50 hover:bg-gray-600/50 transition-all duration-200 hover:scale-105 flex items-center justify-center"
            title="Editor Settings"
          >
            <Settings className="w-4 h-4 text-gray-300 hover:text-yellow-400" />
          </button>
        )}

        <button
          ref={exportButtonRef}
          onClick={() => setShowExportMenu(!showExportMenu)}
          className="w-8 h-8 rounded-md bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 transition-all duration-200 hover:scale-105 flex items-center justify-center shadow-lg"
          title="Export"
        >
          <Download className={`w-4 h-4 text-gray-900 transition-all duration-300 ${showExportMenu ? 'rotate-180' : 'rotate-0'}`} />
        </button>

        <ExportMenu
          isOpen={showExportMenu}
          onClose={() => setShowExportMenu(false)}
          buttonRef={exportButtonRef}
          onExportDesign={onExportDesign || (() => {})}
          onRenderSequence={onRenderSequence || (() => {})}
          onExportLayers={onExportLayers || (() => {})}
          onDownloadProject={onDownloadProject || (() => {})}
        />

        {onSaveCurrentProject && (
          <button
            onClick={onSaveCurrentProject}
            className="w-8 h-8 rounded-md bg-green-500/20 hover:bg-green-500/30 transition-all duration-200 hover:scale-105 flex items-center justify-center border border-green-500/30"
            title="Save Project"
          >
            <Save className="w-4 h-4 text-green-400" />
          </button>
        )}

        {onExitToHome && (
          <button
            onClick={onExitToHome}
            data-tutorial-target="exit-button"
            className="w-8 h-8 rounded-md bg-red-500/20 hover:bg-red-500/30 transition-all duration-200 hover:scale-105 flex items-center justify-center border border-red-500/30"
            title="Exit to Home"
          >
            <LogOut className="w-4 h-4 text-red-400" />
          </button>
        )}
        </div>
      </div>

      {/* Modals */}
      <GoogleImageSearchModal
        isOpen={showGoogleSearch}
        onClose={() => setShowGoogleSearch(false)}
        onImport={handleImportFromUrl}
      />

      <DalleGenerateModal
        isOpen={showDalleGenerate}
        onClose={() => setShowDalleGenerate(false)}
        onImport={handleImportFromUrl}
      />

      <IconLibraryModal
        isOpen={showIconLibrary}
        onClose={() => setShowIconLibrary(false)}
        onSelect={handleIconSelect}
      />
    </div>
  );
};

export default HorizontalShapesBar;