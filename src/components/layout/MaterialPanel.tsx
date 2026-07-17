import React from 'react';
import { DesignElement } from '../../types/design';
import {
  MaterialType,
  Material,
  createDefaultMaterial,
} from '../../types/material';

interface MaterialPanelProps {
  element: DesignElement;
  updateElement: (updates: Partial<DesignElement>) => void;
}

const MATERIAL_TYPES: { value: MaterialType; label: string; description: string }[] = [
  { value: 'matte', label: 'Matte', description: 'Flat, no reflection' },
  { value: 'glossy', label: 'Glossy', description: 'Smooth plastic reflection' },
  { value: 'metallic', label: 'Metallic', description: 'Hard reflection, sharp contrast' },
  { value: 'glass', label: 'Glass', description: 'Transparent with edge highlights' },
  { value: 'neon', label: 'Neon', description: 'Bright core with glow' },
  { value: 'holographic', label: 'Holographic', description: 'Color shifting surface' },
  { value: 'plastic', label: 'Plastic', description: 'Soft reflection, low contrast' },
];

const MaterialPanel: React.FC<MaterialPanelProps> = ({ element, updateElement }) => {
  const material = element.material || createDefaultMaterial('matte');

  const changeMaterialType = (type: MaterialType) => {
    const newMaterial = createDefaultMaterial(type);
    if (material.type === 'matte' && 'color' in newMaterial) {
      newMaterial.color = material.color;
    }
    updateElement({ material: newMaterial });
  };

  const updateMaterial = (updates: Partial<Material>) => {
    updateElement({
      material: { ...material, ...updates },
    });
  };

  const renderMaterialSettings = () => {
    switch (material.type) {
      case 'matte':
        return (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <input
                type="color"
                value={material.color}
                onChange={(e) => updateMaterial({ color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Opacity: {material.opacity.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.opacity}
                onChange={(e) => updateMaterial({ opacity: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>
          </>
        );

      case 'glossy':
        return (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <input
                type="color"
                value={material.color}
                onChange={(e) => updateMaterial({ color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Highlight Strength: {material.highlightStrength.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.01"
                value={material.highlightStrength}
                onChange={(e) =>
                  updateMaterial({ highlightStrength: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Gloss Softness: {material.glossSoftness.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.01"
                value={material.glossSoftness}
                onChange={(e) =>
                  updateMaterial({ glossSoftness: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Light Direction: {material.lightDirection}°
              </label>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={material.lightDirection}
                onChange={(e) =>
                  updateMaterial({ lightDirection: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </>
        );

      case 'metallic':
        return (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <input
                type="color"
                value={material.color}
                onChange={(e) => updateMaterial({ color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Reflection Color</label>
              <input
                type="color"
                value={material.reflectionColor}
                onChange={(e) => updateMaterial({ reflectionColor: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Reflection Intensity: {material.reflectionIntensity.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.01"
                value={material.reflectionIntensity}
                onChange={(e) =>
                  updateMaterial({ reflectionIntensity: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Gloss Softness: {material.glossSoftness.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.01"
                value={material.glossSoftness}
                onChange={(e) =>
                  updateMaterial({ glossSoftness: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Light Direction: {material.lightDirection}°
              </label>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={material.lightDirection}
                onChange={(e) =>
                  updateMaterial({ lightDirection: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </>
        );

      case 'glass':
        return (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <input
                type="color"
                value={material.color}
                onChange={(e) => updateMaterial({ color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Opacity: {material.opacity.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.opacity}
                onChange={(e) => updateMaterial({ opacity: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Edge Brightness: {material.edgeBrightness.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.edgeBrightness}
                onChange={(e) =>
                  updateMaterial({ edgeBrightness: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </>
        );

      case 'neon':
        return (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <input
                type="color"
                value={material.color}
                onChange={(e) => updateMaterial({ color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Core Brightness: {material.coreBrightness.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.coreBrightness}
                onChange={(e) =>
                  updateMaterial({ coreBrightness: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Glow Radius: {material.glowRadius}
              </label>
              <input
                type="range"
                min="0"
                max="1600"
                step="1"
                value={material.glowRadius}
                onChange={(e) =>
                  updateMaterial({ glowRadius: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Glow Intensity: {material.glowIntensity.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.glowIntensity}
                onChange={(e) =>
                  updateMaterial({ glowIntensity: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Flicker Amount: {material.flickerAmount.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.flickerAmount}
                onChange={(e) =>
                  updateMaterial({ flickerAmount: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </>
        );

      case 'holographic':
        return (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Base Color</label>
              <input
                type="color"
                value={material.baseColor}
                onChange={(e) => updateMaterial({ baseColor: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Hue Shift Speed: {material.hueShiftSpeed.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={material.hueShiftSpeed}
                onChange={(e) =>
                  updateMaterial({ hueShiftSpeed: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Saturation: {material.saturation.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.saturation}
                onChange={(e) =>
                  updateMaterial({ saturation: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Shimmer Intensity: {material.shimmerIntensity.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.shimmerIntensity}
                onChange={(e) =>
                  updateMaterial({ shimmerIntensity: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </>
        );

      case 'plastic':
        return (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <input
                type="color"
                value={material.color}
                onChange={(e) => updateMaterial({ color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Gloss Strength: {material.glossStrength.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.glossStrength}
                onChange={(e) =>
                  updateMaterial({ glossStrength: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Softness: {material.softness.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.softness}
                onChange={(e) =>
                  updateMaterial({ softness: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Light Angle: {material.lightAngle}°
              </label>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={material.lightAngle}
                onChange={(e) =>
                  updateMaterial({ lightAngle: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const currentMaterialType = MATERIAL_TYPES.find((t) => t.value === material.type);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Material Type</label>
        <select
          value={material.type}
          onChange={(e) => changeMaterialType(e.target.value as MaterialType)}
          className="w-full bg-gray-700/50 text-gray-300 text-xs px-3 py-2 rounded border border-gray-600/50 hover:bg-gray-700 transition-colors cursor-pointer"
        >
          {MATERIAL_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label} - {type.description}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
        {renderMaterialSettings()}
      </div>
    </div>
  );
};

export default MaterialPanel;
