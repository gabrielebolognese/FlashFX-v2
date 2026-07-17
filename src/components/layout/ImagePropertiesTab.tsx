import React, { useState } from 'react';
import { DesignElement, ImageFilters } from '../../types/design';
import { getDefaultImageFilters, resetFilterCategory } from '../../utils/imageFilters';
import ImageFilterSlider from '../image/ImageFilterSlider';
import ColorAdjustment from '../image/ColorAdjustment';
import ChromaKeyPanel from '../image/ChromaKeyPanel';
import { RotateCcw, Lock, Unlock, FlipHorizontal, FlipVertical } from 'lucide-react';

interface ImagePropertiesTabProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
}

const ImagePropertiesTab: React.FC<ImagePropertiesTabProps> = ({
  selectedElements,
  updateElement
}) => {
  const [activeTab, setActiveTab] = useState<'image' | 'color' | 'filters'>('image');

  if (selectedElements.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-xs">No image elements selected</p>
        </div>
      </div>
    );
  }

  const selectedElement = selectedElements[0];
  const isMultiSelect = selectedElements.length > 1;
  const filters = selectedElement.filters || getDefaultImageFilters();

  const handleUpdate = (updates: Partial<DesignElement>) => {
    if (isMultiSelect) {
      selectedElements.forEach(element => {
        updateElement(element.id, updates);
      });
    } else {
      updateElement(selectedElement.id, updates);
    }
  };

  const handleFilterUpdate = (filterUpdates: Partial<ImageFilters>) => {
    const newFilters = { ...filters, ...filterUpdates };
    handleUpdate({ filters: newFilters });
  };

  const handleResetAllFilters = () => {
    handleUpdate({ filters: getDefaultImageFilters() });
  };

  const handleResetCategory = (category: 'basic' | 'hsl' | 'blur' | 'all') => {
    const newFilters = resetFilterCategory(filters, category);
    handleUpdate({ filters: newFilters });
  };

  const toggleAspectRatio = () => {
    handleUpdate({ aspectRatioLocked: !selectedElement.aspectRatioLocked });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab Navigation */}
      <div className="p-2 border-b border-gray-700/50">
        <div className="grid grid-cols-3 gap-0.5 bg-gray-700/30 rounded p-0.5 text-xs">
          <button
            onClick={() => setActiveTab('image')}
            className={`flex-1 flex items-center justify-center px-1.5 py-1 rounded font-medium transition-all duration-200 ${
              activeTab === 'image'
                ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            Image
          </button>

          <button
            onClick={() => setActiveTab('color')}
            className={`flex-1 flex items-center justify-center px-1.5 py-1 rounded font-medium transition-all duration-200 ${
              activeTab === 'color'
                ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            Color
          </button>

          <button
            onClick={() => setActiveTab('filters')}
            className={`flex-1 flex items-center justify-center px-1.5 py-1 rounded font-medium transition-all duration-200 ${
              activeTab === 'filters'
                ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            Filters
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
        {activeTab === 'image' && (
          <>
            {/* Position & Size */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-gray-300 flex items-center">
                <span className="w-1 h-1 bg-yellow-400 rounded-full mr-1.5"></span>
                Position & Size
              </h4>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">X</label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.x)}
                    onChange={(e) => handleUpdate({ x: Number(e.target.value) })}
                    className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Y</label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.y)}
                    onChange={(e) => handleUpdate({ y: Number(e.target.value) })}
                    className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Width</label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.width)}
                    onChange={(e) => {
                      const newWidth = Number(e.target.value);
                      if (selectedElement.aspectRatioLocked && selectedElement.originalHeight && selectedElement.originalWidth) {
                        const aspectRatio = selectedElement.originalWidth / selectedElement.originalHeight;
                        handleUpdate({ width: newWidth, height: newWidth / aspectRatio });
                      } else {
                        handleUpdate({ width: newWidth });
                      }
                    }}
                    className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Height</label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.height)}
                    onChange={(e) => {
                      const newHeight = Number(e.target.value);
                      if (selectedElement.aspectRatioLocked && selectedElement.originalHeight && selectedElement.originalWidth) {
                        const aspectRatio = selectedElement.originalWidth / selectedElement.originalHeight;
                        handleUpdate({ height: newHeight, width: newHeight * aspectRatio });
                      } else {
                        handleUpdate({ height: newHeight });
                      }
                    }}
                    className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">Lock Aspect Ratio</label>
                <button
                  onClick={toggleAspectRatio}
                  className="p-1 rounded hover:bg-gray-600/50 transition-colors"
                >
                  {selectedElement.aspectRatioLocked ? (
                    <Lock className="w-4 h-4 text-yellow-400" />
                  ) : (
                    <Unlock className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Rotation & Opacity */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-gray-300 flex items-center">
                <span className="w-1 h-1 bg-orange-400 rounded-full mr-1.5"></span>
                Transform
              </h4>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Rotation</label>
                <input
                  type="number"
                  value={Math.round(selectedElement.rotation)}
                  onChange={(e) => handleUpdate({ rotation: Number(e.target.value) })}
                  className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Opacity</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={selectedElement.opacity}
                    onChange={(e) => handleUpdate({ opacity: Number(e.target.value) })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {Math.round(selectedElement.opacity * 100)}%
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Mirror</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate({ mirrorH: !selectedElement.mirrorH })}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      selectedElement.mirrorH
                        ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                        : 'bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:text-white hover:bg-gray-600/50'
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    Horizontal
                  </button>
                  <button
                    onClick={() => handleUpdate({ mirrorV: !selectedElement.mirrorV })}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      selectedElement.mirrorV
                        ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                        : 'bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:text-white hover:bg-gray-600/50'
                    }`}
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                    Vertical
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'color' && (
          <ColorAdjustment
            selectedElements={selectedElements}
            updateElement={updateElement}
          />
        )}

        {activeTab === 'filters' && (
          <>
            {/* Blur Effects */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-gray-300 flex items-center">
                  <span className="w-1 h-1 bg-cyan-400 rounded-full mr-1.5"></span>
                  Blur Effects
                </h4>
                <button
                  onClick={() => handleResetCategory('blur')}
                  className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                  title="Reset blur effects"
                >
                  <RotateCcw className="w-3 h-3 text-gray-400 hover:text-yellow-400" />
                </button>
              </div>

              <ImageFilterSlider
                label="Gaussian Blur"
                value={filters.gaussianBlur}
                min={0}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ gaussianBlur: value })}
                snapToDefault={false}
              />

              <ImageFilterSlider
                label="Box Blur"
                value={filters.boxBlur}
                min={0}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ boxBlur: value })}
                snapToDefault={false}
              />

              <ImageFilterSlider
                label="Surface Blur"
                value={filters.surfaceBlur}
                min={0}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ surfaceBlur: value })}
                snapToDefault={false}
              />
            </div>

            {/* Sharpen */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-gray-300 flex items-center">
                <span className="w-1 h-1 bg-red-400 rounded-full mr-1.5"></span>
                Sharpen
              </h4>

              <ImageFilterSlider
                label="Sharpen"
                value={filters.sharpen}
                min={0}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ sharpen: value })}
                snapToDefault={false}
              />

              <ImageFilterSlider
                label="Clarity"
                value={filters.clarity}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ clarity: value })}
                snapToDefault
              />
            </div>

            {/* Chroma Key */}
            <ChromaKeyPanel
              selectedElement={selectedElement}
              onFilterUpdate={handleFilterUpdate}
            />

            {/* Reset All Button */}
            <div className="pt-2">
              <button
                onClick={handleResetAllFilters}
                className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-xs text-red-400 hover:text-red-300 transition-all duration-200"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset All Filters</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ImagePropertiesTab;
