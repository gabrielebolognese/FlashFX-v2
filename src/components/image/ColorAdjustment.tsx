import React, { useState } from 'react';
import { DesignElement, ImageFilters } from '../../types/design';
import { getDefaultImageFilters, resetFilterCategory } from '../../utils/imageFilters';
import ImageFilterSlider from './ImageFilterSlider';
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface ColorAdjustmentProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
}

interface CategoryState {
  basic: boolean;
  hsl: boolean;
  colorBalance: boolean;
  levels: boolean;
  rgb: boolean;
  temperatureTint: boolean;
}

const ColorAdjustment: React.FC<ColorAdjustmentProps> = ({
  selectedElements,
  updateElement
}) => {
  const [expandedCategories, setExpandedCategories] = useState<CategoryState>({
    basic: true,
    hsl: false,
    colorBalance: false,
    levels: false,
    rgb: false,
    temperatureTint: false
  });

  if (selectedElements.length === 0 || selectedElements[0].type !== 'image') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-xs">Select an image to adjust colors</p>
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

  const handleResetCategory = (category: 'basic' | 'hsl' | 'colorBalance' | 'levels' | 'rgb' | 'all') => {
    const newFilters = resetFilterCategory(filters, category);
    handleUpdate({ filters: newFilters });
  };

  const toggleCategory = (category: keyof CategoryState) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const CategoryHeader: React.FC<{
    title: string;
    color: string;
    category: keyof CategoryState;
    onReset?: () => void;
  }> = ({ title, color, category, onReset }) => (
    <div className="flex items-center justify-between">
      <button
        onClick={() => toggleCategory(category)}
        className="flex items-center flex-1 group"
      >
        <span className={`w-1 h-1 ${color} rounded-full mr-1.5`}></span>
        <h4 className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
          {title}
        </h4>
        {expandedCategories[category] ? (
          <ChevronUp className="w-3 h-3 ml-1 text-gray-400" />
        ) : (
          <ChevronDown className="w-3 h-3 ml-1 text-gray-400" />
        )}
      </button>
      {onReset && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
          title={`Reset ${title.toLowerCase()}`}
        >
          <RotateCcw className="w-3 h-3 text-gray-400 hover:text-yellow-400" />
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white">Color Adjustments</h3>
          <button
            onClick={handleResetAllFilters}
            className="flex items-center space-x-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-xs text-red-400 hover:text-red-300 transition-all duration-200"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset All</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {/* Basic Adjustments */}
        <div className="space-y-1.5">
          <CategoryHeader
            title="Basic Adjustments"
            color="bg-blue-400"
            category="basic"
            onReset={() => handleResetCategory('basic')}
          />

          {expandedCategories.basic && (
            <div className="space-y-1.5 pl-2">
              <ImageFilterSlider
                label="Brightness"
                value={filters.brightness}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ brightness: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Contrast"
                value={filters.contrast}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ contrast: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Exposure"
                value={filters.exposure}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ exposure: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Gamma"
                value={filters.gamma}
                min={0.1}
                max={3.0}
                step={0.1}
                defaultValue={1.0}
                onChange={(value) => handleFilterUpdate({ gamma: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Saturation"
                value={filters.saturation}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ saturation: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Vibrance"
                value={filters.vibrance}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ vibrance: value })}
                snapToDefault
              />
            </div>
          )}
        </div>

        {/* Temperature & Tint */}
        <div className="space-y-1.5">
          <CategoryHeader
            title="Temperature & Tint"
            color="bg-orange-400"
            category="temperatureTint"
          />

          {expandedCategories.temperatureTint && (
            <div className="space-y-1.5 pl-2">
              <ImageFilterSlider
                label="Temperature"
                value={filters.temperature}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ temperature: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Tint"
                value={filters.tint}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ tint: value })}
                snapToDefault
              />
            </div>
          )}
        </div>

        {/* HSL Adjustments */}
        <div className="space-y-1.5">
          <CategoryHeader
            title="HSL Adjustments"
            color="bg-green-400"
            category="hsl"
            onReset={() => handleResetCategory('hsl')}
          />

          {expandedCategories.hsl && (
            <div className="space-y-1.5 pl-2">
              <ImageFilterSlider
                label="Hue"
                value={filters.hue}
                min={-180}
                max={180}
                defaultValue={0}
                unit="°"
                onChange={(value) => handleFilterUpdate({ hue: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Lightness"
                value={filters.lightness}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ lightness: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Grayscale"
                value={filters.grayscale}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={(value) => handleFilterUpdate({ grayscale: value })}
                snapToDefault={false}
              />

              <ImageFilterSlider
                label="Sepia"
                value={filters.sepia}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={(value) => handleFilterUpdate({ sepia: value })}
                snapToDefault={false}
              />

              <div className="flex items-center justify-between pt-1">
                <label className="text-xs text-gray-400">Invert Colors</label>
                <button
                  onClick={() => handleFilterUpdate({ invert: !filters.invert })}
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                    filters.invert ? 'bg-yellow-400' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      filters.invert ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Color Balance */}
        <div className="space-y-1.5">
          <CategoryHeader
            title="Color Balance"
            color="bg-purple-400"
            category="colorBalance"
            onReset={() => handleResetCategory('colorBalance')}
          />

          {expandedCategories.colorBalance && (
            <div className="space-y-1.5 pl-2">
              <div className="space-y-0.5">
                <p className="text-xs text-gray-400 font-medium">Shadows</p>
                <ImageFilterSlider
                  label="Red"
                  value={filters.shadowsRed}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ shadowsRed: value })}
                  snapToDefault
                />
                <ImageFilterSlider
                  label="Green"
                  value={filters.shadowsGreen}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ shadowsGreen: value })}
                  snapToDefault
                />
                <ImageFilterSlider
                  label="Blue"
                  value={filters.shadowsBlue}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ shadowsBlue: value })}
                  snapToDefault
                />
              </div>

              <div className="space-y-0.5 pt-1">
                <p className="text-xs text-gray-400 font-medium">Midtones</p>
                <ImageFilterSlider
                  label="Red"
                  value={filters.midtonesRed}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ midtonesRed: value })}
                  snapToDefault
                />
                <ImageFilterSlider
                  label="Green"
                  value={filters.midtonesGreen}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ midtonesGreen: value })}
                  snapToDefault
                />
                <ImageFilterSlider
                  label="Blue"
                  value={filters.midtonesBlue}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ midtonesBlue: value })}
                  snapToDefault
                />
              </div>

              <div className="space-y-0.5 pt-1">
                <p className="text-xs text-gray-400 font-medium">Highlights</p>
                <ImageFilterSlider
                  label="Red"
                  value={filters.highlightsRed}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ highlightsRed: value })}
                  snapToDefault
                />
                <ImageFilterSlider
                  label="Green"
                  value={filters.highlightsGreen}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ highlightsGreen: value })}
                  snapToDefault
                />
                <ImageFilterSlider
                  label="Blue"
                  value={filters.highlightsBlue}
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onChange={(value) => handleFilterUpdate({ highlightsBlue: value })}
                  snapToDefault
                />
              </div>
            </div>
          )}
        </div>

        {/* Levels */}
        <div className="space-y-1.5">
          <CategoryHeader
            title="Levels"
            color="bg-pink-400"
            category="levels"
            onReset={() => handleResetCategory('levels')}
          />

          {expandedCategories.levels && (
            <div className="space-y-1.5 pl-2">
              <ImageFilterSlider
                label="Black Point"
                value={filters.levelsBlackPoint}
                min={0}
                max={255}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ levelsBlackPoint: value })}
                snapToDefault={false}
              />

              <ImageFilterSlider
                label="Mid Point"
                value={filters.levelsMidPoint}
                min={0.1}
                max={9.99}
                step={0.1}
                defaultValue={1.0}
                onChange={(value) => handleFilterUpdate({ levelsMidPoint: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="White Point"
                value={filters.levelsWhitePoint}
                min={0}
                max={255}
                defaultValue={255}
                onChange={(value) => handleFilterUpdate({ levelsWhitePoint: value })}
                snapToDefault={false}
              />
            </div>
          )}
        </div>

        {/* RGB Channels */}
        <div className="space-y-1.5">
          <CategoryHeader
            title="RGB Channels"
            color="bg-red-400"
            category="rgb"
            onReset={() => handleResetCategory('rgb')}
          />

          {expandedCategories.rgb && (
            <div className="space-y-1.5 pl-2">
              <ImageFilterSlider
                label="Red Channel"
                value={filters.redChannel}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ redChannel: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Green Channel"
                value={filters.greenChannel}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ greenChannel: value })}
                snapToDefault
              />

              <ImageFilterSlider
                label="Blue Channel"
                value={filters.blueChannel}
                min={-100}
                max={100}
                defaultValue={0}
                onChange={(value) => handleFilterUpdate({ blueChannel: value })}
                snapToDefault
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ColorAdjustment;
