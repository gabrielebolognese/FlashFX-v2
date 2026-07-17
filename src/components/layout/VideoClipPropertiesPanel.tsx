import React, { useCallback } from 'react';
import { Film, X, Trash2, Clock, Move, Eye } from 'lucide-react';
import { useVideo } from '../../video/VideoContext';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

const VideoClipPropertiesPanel: React.FC = () => {
  const {
    videoState,
    updateClip,
    removeClip,
    selectedVideoClipId,
    setSelectedVideoClipId,
  } = useVideo();

  const clip = selectedVideoClipId ? videoState.clips[selectedVideoClipId] : null;
  const asset = clip ? videoState.assets[clip.assetId] : null;

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedVideoClipId) return;
    updateClip(selectedVideoClipId, { name: e.target.value });
  }, [selectedVideoClipId, updateClip]);

  const handleStartTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!clip || !selectedVideoClipId) return;
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0 && val < clip.endTime) {
      updateClip(selectedVideoClipId, { startTime: val });
    }
  }, [clip, selectedVideoClipId, updateClip]);

  const handleEndTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!clip || !selectedVideoClipId) return;
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > clip.startTime) {
      updateClip(selectedVideoClipId, { endTime: val });
    }
  }, [clip, selectedVideoClipId, updateClip]);

  const handleOffsetChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!clip || !selectedVideoClipId || !asset) return;
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0 && val < asset.duration) {
      updateClip(selectedVideoClipId, { offset: val });
    }
  }, [clip, selectedVideoClipId, updateClip, asset]);

  const handleOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedVideoClipId) return;
    updateClip(selectedVideoClipId, { opacity: parseFloat(e.target.value) / 100 });
  }, [selectedVideoClipId, updateClip]);

  const handleTransformChange = useCallback((
    key: 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation',
    value: string
  ) => {
    if (!clip || !selectedVideoClipId) return;
    const val = parseFloat(value);
    if (isNaN(val)) return;
    updateClip(selectedVideoClipId, {
      transform: { ...clip.transform, [key]: val },
    });
  }, [clip, selectedVideoClipId, updateClip]);

  const handleDelete = useCallback(() => {
    if (!selectedVideoClipId) return;
    removeClip(selectedVideoClipId);
    setSelectedVideoClipId(null);
  }, [selectedVideoClipId, removeClip, setSelectedVideoClipId]);

  if (!clip) return null;

  const duration = clip.endTime - clip.startTime;

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 bg-gray-800/60">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-blue-900/60">
            <Film className="w-3 h-3 text-blue-400" />
          </div>
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Video Clip</span>
        </div>
        <button
          onClick={() => setSelectedVideoClipId(null)}
          className="p-1 rounded hover:bg-gray-700/60 text-gray-500 hover:text-gray-300 transition-colors"
          title="Deselect clip"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-3 flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Name</label>
          <input
            type="text"
            value={clip.name}
            onChange={handleNameChange}
            className="w-full bg-gray-700/60 border border-gray-600/60 rounded text-xs text-gray-100 px-2 py-1.5 focus:outline-none focus:border-blue-500/60 transition-colors"
          />
        </div>

        {/* Source info */}
        {asset && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <Film className="w-3 h-3" /> Source
            </label>
            <div className="flex flex-col gap-1 px-2 py-1.5 bg-gray-700/30 rounded">
              <span className="text-xs text-gray-400 truncate">{asset.fileName}</span>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{asset.width}×{asset.height}</span>
                <span>·</span>
                <span className="font-mono">{asset.codec}</span>
                <span>·</span>
                <span>{formatTime(asset.duration)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Timing */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Clock className="w-3 h-3" /> Timing
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Start</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={clip.startTime.toFixed(2)}
                onChange={handleStartTimeChange}
                className="w-full bg-gray-700/60 border border-gray-600/60 rounded text-xs text-gray-100 px-2 py-1.5 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">End</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={clip.endTime.toFixed(2)}
                onChange={handleEndTimeChange}
                className="w-full bg-gray-700/60 border border-gray-600/60 rounded text-xs text-gray-100 px-2 py-1.5 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 bg-gray-700/30 rounded">
            <span className="text-xs text-gray-500">Duration</span>
            <span className="text-xs font-mono text-gray-300">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Trim offset */}
        {asset && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Trim Offset</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={asset.duration}
              value={clip.offset.toFixed(2)}
              onChange={handleOffsetChange}
              className="w-full bg-gray-700/60 border border-gray-600/60 rounded text-xs text-gray-100 px-2 py-1.5 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
        )}

        {/* Opacity */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <Eye className="w-3 h-3" /> Opacity
            </label>
            <span className="text-xs font-mono text-gray-400">{Math.round(clip.opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(clip.opacity * 100)}
            onChange={handleOpacityChange}
            className="w-full accent-blue-500"
          />
        </div>

        {/* Transform */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Move className="w-3 h-3" /> Transform
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'x', label: 'X' },
                { key: 'y', label: 'Y' },
                { key: 'scaleX', label: 'Scale X' },
                { key: 'scaleY', label: 'Scale Y' },
                { key: 'rotation', label: 'Rotation' },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{label}</span>
                <input
                  type="number"
                  step={key === 'rotation' ? '1' : key.startsWith('scale') ? '0.01' : '1'}
                  value={clip.transform[key]}
                  onChange={(e) => handleTransformChange(key, e.target.value)}
                  className="w-full bg-gray-700/60 border border-gray-600/60 rounded text-xs text-gray-100 px-2 py-1.5 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="flex items-center justify-center gap-2 w-full py-2 rounded text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove Clip
        </button>
      </div>
    </div>
  );
};

export default VideoClipPropertiesPanel;
