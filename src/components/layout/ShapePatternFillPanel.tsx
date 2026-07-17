import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DesignElement } from '../../types/design';

interface ShapePatternFillPanelProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
}

const PATTERN_TYPES = ['dots', 'lines', 'grid', 'diagonal', 'chevron'] as const;

const ShapePatternFillPanel: React.FC<ShapePatternFillPanelProps> = ({
  selectedElements,
  updateElement
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (selectedElements.length === 0) return null;

  const element = selectedElements[0];

  const handleUpdate = (updates: Partial<DesignElement>) => {
    selectedElements.forEach(el => {
      updateElement(el.id, updates);
    });
  };

  const handleToggle = () => {
    if (!element.shapePatternFillEnabled) {
      handleUpdate({
        shapePatternFillEnabled: true,
        shapePatternType: element.shapePatternType || 'dots',
        shapePatternColor: element.shapePatternColor || '#FFFFFF',
        shapePatternBackgroundColor: element.shapePatternBackgroundColor || 'transparent',
        shapePatternSize: element.shapePatternSize ?? 45,
        shapePatternSpacing: element.shapePatternSpacing ?? 35,
        shapePatternAngle: element.shapePatternAngle ?? 0,
        shapePatternOpacity: element.shapePatternOpacity ?? 100,
      });
    } else {
      handleUpdate({ shapePatternFillEnabled: false });
    }
  };

  const noneActive = !element.shapePatternFillEnabled;

  return (
    <div className="bg-gray-700/20 rounded-lg border border-gray-600/30">
      <div className="flex items-center justify-between hover:bg-gray-600/20 transition-colors">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center justify-between p-2"
        >
          <h4 className="text-xs font-medium text-white flex items-center">
            <span className="w-1 h-1 bg-blue-400 rounded-full mr-1.5"></span>
            Pattern Fill
          </h4>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </button>
        <button
          onClick={() => {
            if (!noneActive) {
              handleUpdate({ shapePatternFillEnabled: false });
            }
          }}
          className={`text-xs font-medium px-2 py-0.5 mr-1 rounded ${
            noneActive
              ? 'text-yellow-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          None
        </button>
      </div>

      {isExpanded && (
        <div className="p-3 border-t border-gray-600/30 space-y-3">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-2.5 bg-gray-900/50 rounded">
            <span className="text-xs text-gray-300">Enable Pattern Fill</span>
            <button
              onClick={handleToggle}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                element.shapePatternFillEnabled ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${
                element.shapePatternFillEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {element.shapePatternFillEnabled && (
            <>
              {/* Pattern Type */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Pattern Type</label>
                <div className="grid grid-cols-5 gap-0.5 bg-gray-700/30 rounded p-0.5">
                  {PATTERN_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => handleUpdate({ shapePatternType: type })}
                      className={`px-1 py-1 rounded text-xs font-medium transition-all duration-200 capitalize ${
                        (element.shapePatternType || 'dots') === type
                          ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                          : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pattern Color */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Pattern Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={element.shapePatternColor || '#FFFFFF'}
                    onChange={(e) => handleUpdate({ shapePatternColor: e.target.value })}
                    className="w-10 h-8 bg-gray-900 border border-gray-600 rounded cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={element.shapePatternColor || '#FFFFFF'}
                    onChange={(e) => handleUpdate({ shapePatternColor: e.target.value })}
                    className="flex-1 px-2 py-1.5 bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 text-xs focus:outline-none focus:border-gray-500"
                  />
                </div>
              </div>

              {/* Background Color */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Background Color</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={element.shapePatternBackgroundColor === 'transparent' ? '#000000' : (element.shapePatternBackgroundColor || '#000000')}
                    onChange={(e) => handleUpdate({ shapePatternBackgroundColor: e.target.value })}
                    className="w-10 h-8 bg-gray-900 border border-gray-600 rounded cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={element.shapePatternBackgroundColor || 'transparent'}
                    onChange={(e) => handleUpdate({ shapePatternBackgroundColor: e.target.value })}
                    className="flex-1 px-2 py-1.5 bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 text-xs focus:outline-none focus:border-gray-500"
                  />
                  <button
                    onClick={() => handleUpdate({ shapePatternBackgroundColor: 'transparent' })}
                    className={`px-2 py-1.5 rounded text-xs font-medium transition-all duration-200 flex-shrink-0 ${
                      element.shapePatternBackgroundColor === 'transparent'
                        ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                        : 'text-gray-400 hover:text-white hover:bg-gray-600/30 border border-transparent'
                    }`}
                    title="Set transparent"
                  >
                    None
                  </button>
                </div>
              </div>

              {/* Pattern Size */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Size <span className="text-gray-500">{element.shapePatternSize ?? 45}px</span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="range"
                    min="2"
                    max="300"
                    value={element.shapePatternSize ?? 45}
                    onChange={(e) => handleUpdate({ shapePatternSize: parseFloat(e.target.value) })}
                    className="flex-1 accent-blue-500"
                  />
                  <input
                    type="number"
                    value={element.shapePatternSize ?? 45}
                    min="2"
                    max="300"
                    onChange={(e) => handleUpdate({ shapePatternSize: parseFloat(e.target.value) || 45 })}
                    className="w-16 px-2 py-1 bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 text-xs focus:outline-none focus:border-gray-500"
                  />
                </div>
              </div>

              {/* Pattern Spacing */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Spacing <span className="text-gray-500">{element.shapePatternSpacing ?? 35}px</span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="range"
                    min="0"
                    max="150"
                    value={element.shapePatternSpacing ?? 35}
                    onChange={(e) => handleUpdate({ shapePatternSpacing: parseFloat(e.target.value) })}
                    className="flex-1 accent-blue-500"
                  />
                  <input
                    type="number"
                    value={element.shapePatternSpacing ?? 35}
                    min="0"
                    max="150"
                    onChange={(e) => handleUpdate({ shapePatternSpacing: parseFloat(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 text-xs focus:outline-none focus:border-gray-500"
                  />
                </div>
              </div>

              {/* Pattern Angle */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Angle <span className="text-gray-500">{element.shapePatternAngle ?? 0}°</span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={element.shapePatternAngle ?? 0}
                    onChange={(e) => handleUpdate({ shapePatternAngle: parseFloat(e.target.value) })}
                    className="flex-1 accent-blue-500"
                  />
                  <input
                    type="number"
                    value={element.shapePatternAngle ?? 0}
                    min="0"
                    max="360"
                    onChange={(e) => handleUpdate({ shapePatternAngle: parseFloat(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 text-xs focus:outline-none focus:border-gray-500"
                  />
                </div>
              </div>

              {/* Opacity */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Pattern Opacity <span className="text-gray-500">{element.shapePatternOpacity ?? 100}%</span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={element.shapePatternOpacity ?? 100}
                    onChange={(e) => handleUpdate({ shapePatternOpacity: parseFloat(e.target.value) })}
                    className="flex-1 accent-blue-500"
                  />
                  <input
                    type="number"
                    value={element.shapePatternOpacity ?? 100}
                    min="0"
                    max="100"
                    onChange={(e) => handleUpdate({ shapePatternOpacity: parseFloat(e.target.value) || 100 })}
                    className="w-16 px-2 py-1 bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 text-xs focus:outline-none focus:border-gray-500"
                  />
                </div>
              </div>

              {/* Custom SVG */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-gray-400">Custom SVG Pattern</label>
                  {element.shapePatternType === 'custom' && element.shapePatternCustomSvg && (
                    <button
                      onClick={() => handleUpdate({ shapePatternCustomSvg: undefined, shapePatternType: 'dots' })}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  value={element.shapePatternCustomSvg || ''}
                  placeholder='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">...</svg>'
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    handleUpdate({
                      shapePatternCustomSvg: val || undefined,
                      shapePatternType: val ? 'custom' : (element.shapePatternType || 'dots'),
                    });
                  }}
                  rows={3}
                  className="w-full px-2 py-1.5 bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 text-xs font-mono focus:outline-none focus:border-gray-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">Paste an SVG string to use as a custom repeating tile</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export function generatePatternDataUri(
  type: string,
  color: string,
  bgColor: string,
  size: number,
  spacing: number,
  angle: number
): string {
  const totalSize = Math.max(1, size + spacing);
  let patternContent = '';

  switch (type) {
    case 'dots':
      patternContent = `<circle cx="${totalSize / 2}" cy="${totalSize / 2}" r="${size / 2}" fill="${color}"/>`;
      break;
    case 'lines':
      patternContent = `<line x1="0" y1="${totalSize / 2}" x2="${totalSize}" y2="${totalSize / 2}" stroke="${color}" stroke-width="${size}"/>`;
      break;
    case 'grid':
      patternContent = `<line x1="0" y1="${totalSize / 2}" x2="${totalSize}" y2="${totalSize / 2}" stroke="${color}" stroke-width="${size / 2}"/><line x1="${totalSize / 2}" y1="0" x2="${totalSize / 2}" y2="${totalSize}" stroke="${color}" stroke-width="${size / 2}"/>`;
      break;
    case 'diagonal':
      patternContent = `<line x1="0" y1="${totalSize}" x2="${totalSize}" y2="0" stroke="${color}" stroke-width="${size}"/>`;
      break;
    case 'chevron':
      patternContent = `<polyline points="0,${totalSize / 2} ${totalSize / 2},0 ${totalSize},${totalSize / 2}" fill="none" stroke="${color}" stroke-width="${size}"/>`;
      break;
    default:
      patternContent = `<rect width="${totalSize}" height="${totalSize}" fill="${color}"/>`;
  }

  const bg = bgColor === 'transparent' ? 'none' : bgColor;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}"><rect width="100%" height="100%" fill="${bg}"/><g transform="rotate(${angle} ${totalSize / 2} ${totalSize / 2})">${patternContent}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function generatePatternSvgUrl(
  type: string,
  color: string,
  bgColor: string,
  size: number,
  spacing: number,
  angle: number
): string {
  const totalSize = Math.max(1, size + spacing);
  let patternContent = '';

  switch (type) {
    case 'dots':
      patternContent = `<circle cx="${totalSize / 2}" cy="${totalSize / 2}" r="${size / 2}" fill="${color}"/>`;
      break;
    case 'lines':
      patternContent = `<line x1="0" y1="${totalSize / 2}" x2="${totalSize}" y2="${totalSize / 2}" stroke="${color}" stroke-width="${size}"/>`;
      break;
    case 'grid':
      patternContent = `
        <line x1="0" y1="${totalSize / 2}" x2="${totalSize}" y2="${totalSize / 2}" stroke="${color}" stroke-width="${size / 2}"/>
        <line x1="${totalSize / 2}" y1="0" x2="${totalSize / 2}" y2="${totalSize}" stroke="${color}" stroke-width="${size / 2}"/>
      `;
      break;
    case 'diagonal':
      patternContent = `<line x1="0" y1="${totalSize}" x2="${totalSize}" y2="0" stroke="${color}" stroke-width="${size}"/>`;
      break;
    case 'chevron':
      patternContent = `<polyline points="0,${totalSize / 2} ${totalSize / 2},0 ${totalSize},${totalSize / 2}" fill="none" stroke="${color}" stroke-width="${size}"/>`;
      break;
    default:
      patternContent = `<rect width="${totalSize}" height="${totalSize}" fill="${color}"/>`;
  }

  const bg = bgColor === 'transparent' ? 'none' : bgColor;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}"><rect width="100%" height="100%" fill="${bg}"/><g transform="rotate(${angle} ${totalSize / 2} ${totalSize / 2})">${patternContent}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export default ShapePatternFillPanel;
