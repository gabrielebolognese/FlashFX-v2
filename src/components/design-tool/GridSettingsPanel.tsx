import React from 'react';
import { Grid, Settings, X, Palette, Magnet } from 'lucide-react';
import { GridSettings } from '../../hooks/useGridSystem';

interface GridSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  gridSettings: GridSettings;
  updateGridSettings: (updates: Partial<GridSettings>) => void;
  shapeSnapEnabled?: boolean;
  onToggleShapeSnap?: () => void;
}

const GridSettingsPanel: React.FC<GridSettingsPanelProps> = ({
  isOpen,
  onClose,
  gridSettings,
  updateGridSettings,
  shapeSnapEnabled = true,
  onToggleShapeSnap
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500">
                <Grid className="w-6 h-6 text-gray-900" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Grid Settings</h2>
                <p className="text-sm text-gray-400">Configure canvas grid system</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Grid Dimensions */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-300 flex items-center">
                <Settings className="w-4 h-4 mr-2" />
                Grid Dimensions
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-2">Columns</label>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={gridSettings.columns}
                    onChange={(e) => updateGridSettings({ columns: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-400 block mb-2">Rows</label>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={gridSettings.rows}
                    onChange={(e) => updateGridSettings({ rows: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
              </div>
            </div>

            {/* Grid Appearance */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-300 flex items-center">
                <Palette className="w-4 h-4 mr-2" />
                Appearance
              </h3>
              
              <div>
                <label className="text-xs text-gray-400 block mb-2">Grid Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={gridSettings.color}
                    onChange={(e) => updateGridSettings({ color: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-gray-600"
                  />
                  <input
                    type="text"
                    value={gridSettings.color}
                    onChange={(e) => updateGridSettings({ color: e.target.value })}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-xs text-gray-400 block mb-2">
                  Opacity: {Math.round(gridSettings.opacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={gridSettings.opacity}
                  onChange={(e) => updateGridSettings({ opacity: Number(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
            </div>

            {/* Grid Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-white">Show Grid</div>
                  <div className="text-xs text-gray-400">Display grid lines on canvas</div>
                </div>
                <button
                  onClick={() => updateGridSettings({ enabled: !gridSettings.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    gridSettings.enabled ? 'bg-yellow-400' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      gridSettings.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-white">Snap to Grid</div>
                  <div className="text-xs text-gray-400">Align shapes to grid intersections</div>
                </div>
                <button
                  onClick={() => updateGridSettings({ snapEnabled: !gridSettings.snapEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    gridSettings.snapEnabled ? 'bg-yellow-400' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      gridSettings.snapEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              {onToggleShapeSnap && (
                <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-white flex items-center">
                      <Magnet className="w-4 h-4 mr-2" />
                      Toggle Shape Snapping
                    </div>
                    <div className="text-xs text-gray-400">Enable snapping between shapes</div>
                  </div>
                  <button
                    onClick={onToggleShapeSnap}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      shapeSnapEnabled ? 'bg-yellow-400' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        shapeSnapEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Grid Info */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="text-xs text-blue-400 space-y-1">
                <div><strong>Cell Size:</strong> {Math.round(3840 / gridSettings.columns)}px × {Math.round(2160 / gridSettings.rows)}px</div>
                <div><strong>Total Cells:</strong> {gridSettings.columns * gridSettings.rows}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridSettingsPanel;