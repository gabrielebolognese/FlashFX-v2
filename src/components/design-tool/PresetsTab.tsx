import React, { useState, useEffect, useCallback } from 'react';
import { Palette, Plus, Download, Upload, Trash2, Loader, Bookmark, Diamond, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { Preset, KeyframeAnimationPreset } from '../../types/preset';
import { PresetService } from '../../services/PresetService';
import { KeyframePresetService } from '../../services/KeyframePresetService';
import { DesignElement } from '../../types/design';
import { useAnimation, usePlayback } from '../../animation-engine';

interface PresetsTabProps {
  userId: string | null;
  isGuest: boolean;
  onAddPreset: (elements: DesignElement[]) => void;
  selectedElementId?: string | null;
}

const PresetsTab: React.FC<PresetsTabProps> = ({ userId, isGuest, onAddPreset, selectedElementId }) => {
  const [designPresets, setDesignPresets] = useState<Preset[]>([]);
  const [keyframePresets, setKeyframePresets] = useState<KeyframeAnimationPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [designSectionOpen, setDesignSectionOpen] = useState(true);
  const [animSectionOpen, setAnimSectionOpen] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { addKeyframe, state, initAnimation } = useAnimation();
  const { currentTime } = usePlayback();

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  }, []);

  const loadPresets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isGuest) {
        setDesignPresets(PresetService.loadPresetsFromLocalStorage());
      } else if (userId) {
        setDesignPresets(await PresetService.getUserPresets(userId));
      }
      setKeyframePresets(KeyframePresetService.loadFromLocalStorage());
    } catch (err) {
      console.error('Error loading presets:', err);
      setError('Failed to load presets');
    } finally {
      setIsLoading(false);
    }
  }, [userId, isGuest]);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'keyframe_animation_presets') {
        setKeyframePresets(KeyframePresetService.loadFromLocalStorage());
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleCustomRefresh = () => {
      setKeyframePresets(KeyframePresetService.loadFromLocalStorage());
    };
    window.addEventListener('keyframe-preset-saved', handleCustomRefresh);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('keyframe-preset-saved', handleCustomRefresh);
    };
  }, []);

  const handleDeleteDesignPreset = async (presetId: string) => {
    try {
      if (isGuest) {
        const updated = designPresets.filter(p => p.id !== presetId);
        PresetService.savePresetsToLocalStorage(updated);
        setDesignPresets(updated);
      } else {
        await PresetService.deletePreset(presetId);
        setDesignPresets(designPresets.filter(p => p.id !== presetId));
      }
      showNotification('Preset deleted');
    } catch (err) {
      console.error('Error deleting preset:', err);
      alert('Failed to delete preset');
    }
  };

  const handleDeleteKeyframePreset = (presetId: string) => {
    KeyframePresetService.deletePreset(presetId);
    setKeyframePresets(prev => prev.filter(p => p.id !== presetId));
    setConfirmDeleteId(null);
    showNotification('Animation preset deleted');
  };

  const handleExportDesignPresets = () => {
    try {
      const jsonData = PresetService.exportPresetsToJSON(designPresets);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `design-presets-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting presets:', err);
      alert('Failed to export presets');
    }
  };

  const handleImportDesignPresets = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (isGuest) {
        const importedData = JSON.parse(text);
        const newPresets = importedData.map((p: Preset) => ({
          ...p,
          id: `preset-${Date.now()}-${Math.random()}`,
          user_id: 'guest'
        }));
        const updated = [...designPresets, ...newPresets];
        PresetService.savePresetsToLocalStorage(updated);
        setDesignPresets(updated);
      } else if (userId) {
        const importedPresets = await PresetService.importPresetsFromJSON(userId, text);
        setDesignPresets([...designPresets, ...importedPresets]);
      }
    } catch (err) {
      console.error('Error importing presets:', err);
      alert('Failed to import presets. Please check the file format.');
    }
    event.target.value = '';
  };

  const handleApplyDesignPreset = (preset: Preset) => {
    onAddPreset(preset.elements);
  };

  const handleApplyKeyframePreset = (preset: KeyframeAnimationPreset) => {
    if (!selectedElementId) {
      showNotification('Select an element on the canvas first');
      return;
    }

    const animation = state.animations[selectedElementId];
    if (!animation) {
      initAnimation(selectedElementId);
    }

    const clipStart = animation?.clipStart ?? currentTime;

    KeyframePresetService.applyPresetToElement(
      preset,
      selectedElementId,
      clipStart,
      currentTime,
      addKeyframe
    );

    showNotification(`Applied "${preset.name}"`);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-400">
          <Loader className="w-8 h-8 mx-auto mb-2 animate-spin" />
          <p className="text-sm">Loading presets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-red-400">
          <p className="text-sm">{error}</p>
          <button
            onClick={loadPresets}
            className="mt-2 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">

        {/* ---- Design Presets Section ---- */}
        <div className="border-b border-gray-700/40">
          <button
            onClick={() => setDesignSectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-700/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-gray-200">Design Presets</span>
              <span className="text-xs text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">{designPresets.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); handleExportDesignPresets(); }}
                disabled={designPresets.length === 0}
                className="p-1 rounded hover:bg-gray-600/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Export Design Presets"
              >
                <Download className="w-3 h-3 text-gray-400" />
              </button>
              <label
                className="p-1 rounded hover:bg-gray-600/50 transition-colors cursor-pointer"
                title="Import Design Presets"
                onClick={(e) => e.stopPropagation()}
              >
                <Upload className="w-3 h-3 text-gray-400" />
                <input type="file" accept=".json" onChange={handleImportDesignPresets} className="hidden" />
              </label>
              {designSectionOpen
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              }
            </div>
          </button>

          {designSectionOpen && (
            <div className="px-2 pb-2">
              {designPresets.length === 0 ? (
                <div className="text-center py-6">
                  <Palette className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                  <p className="text-xs text-gray-500 mb-1">No design presets yet</p>
                  <p className="text-xs text-gray-600">Select a group in Layers and save it as a preset</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  {designPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="group relative bg-gray-700/30 border border-gray-600/30 rounded-lg p-3 hover:bg-gray-600/40 hover:border-yellow-400/30 transition-all duration-200 cursor-pointer"
                      onClick={() => handleApplyDesignPreset(preset)}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="text-xs font-medium text-white truncate flex-1 pr-2">{preset.name}</h4>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteDesignPreset(preset.id); }}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-600/50 transition-all"
                          title="Delete Preset"
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                      {preset.description && (
                        <p className="text-xs text-gray-400 mb-1.5 line-clamp-2">{preset.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{preset.element_count} element{preset.element_count !== 1 ? 's' : ''}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus className="w-2.5 h-2.5 text-yellow-400" />
                          <span className="text-xs text-yellow-400">Add</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Animation Presets Section ---- */}
        <div>
          <button
            onClick={() => setAnimSectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-700/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-gray-200">Animation Presets</span>
              <span className="text-xs text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">{keyframePresets.length}</span>
            </div>
            {animSectionOpen
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
            }
          </button>

          {animSectionOpen && (
            <div className="px-2 pb-2">
              {keyframePresets.length === 0 ? (
                <div className="text-center py-6">
                  <Diamond className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                  <p className="text-xs text-gray-500 mb-1">No animation presets yet</p>
                  <p className="text-xs text-gray-600 px-2 text-center">
                    Select keyframes in the timeline and click{' '}
                    <span className="text-amber-400 font-medium">Save Preset</span>
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  {keyframePresets.map((preset) => (
                    <div key={preset.id}>
                      <div
                        className="group relative bg-gray-700/30 border border-gray-600/30 rounded-lg p-3 hover:bg-amber-500/10 hover:border-amber-400/30 transition-all duration-200 cursor-pointer"
                        onClick={() => handleApplyKeyframePreset(preset)}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                            <Diamond className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                            <h4 className="text-xs font-medium text-white truncate">{preset.name}</h4>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(preset.id); }}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-600/50 transition-all flex-shrink-0"
                            title="Delete Preset"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>

                        {preset.description && (
                          <p className="text-xs text-gray-400 mb-1.5 line-clamp-2">{preset.description}</p>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {preset.keyframeCount} kf &bull; {preset.tracks.length} prop{preset.tracks.length !== 1 ? 's' : ''}
                            </span>
                            {preset.duration > 0 && (
                              <span className="text-xs text-gray-600">{preset.duration.toFixed(2)}s</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-2.5 h-2.5 text-amber-400" />
                            <span className="text-xs text-amber-400">Apply</span>
                          </div>
                        </div>
                      </div>

                      {confirmDeleteId === preset.id && (
                        <div className="mt-1 bg-gray-800 border border-red-500/30 rounded-lg p-2.5">
                          <p className="text-xs text-gray-300 mb-2">Delete this animation preset? This cannot be undone.</p>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="flex-1 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeleteKeyframePreset(preset.id)}
                              className="flex-1 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {notification && (
        <div className="px-3 py-2 border-t border-gray-700/40 bg-gray-800/60">
          <p className="text-xs text-center text-amber-400">{notification}</p>
        </div>
      )}
    </div>
  );
};

export default PresetsTab;
