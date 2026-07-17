import React, { useRef } from 'react';
import { Upload, Film, Plus, Trash2, Clock, Info } from 'lucide-react';
import { useVideo } from '../../video/VideoContext';
import { VideoAsset } from '../../video/types';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const VideoAssetCard: React.FC<{
  asset: VideoAsset;
  onAddToTimeline: () => void;
  onDelete: () => void;
  onSelectForPlacement: () => void;
}> = ({ asset, onAddToTimeline, onDelete, onSelectForPlacement }) => {
  return (
    <div
      className="group bg-gray-800/60 border border-blue-900/40 hover:border-blue-500/50 rounded-lg overflow-hidden transition-all cursor-crosshair"
      onClick={onSelectForPlacement}
      title="Click to place on canvas"
    >
      {/* Thumbnail */}
      <div className="relative w-full bg-gray-900/60 overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.fileName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-8 h-8 text-blue-900/60" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-1 right-1 p-1 rounded bg-black/50 text-gray-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
          title="Remove from pool"
        >
          <Trash2 className="w-3 h-3" />
        </button>
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white font-mono">
          {formatDuration(asset.duration)}
        </div>
      </div>

      <div className="px-2 py-2">
        <p className="text-xs font-medium text-gray-200 truncate mb-1" title={asset.fileName}>
          {asset.fileName.replace(/\.[^.]+$/, '')}
        </p>

        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1 text-gray-500">
            <Info className="w-3 h-3" />
            <span className="text-xs">{asset.width}×{asset.height}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3 h-3" />
            <span className="text-xs font-mono">{formatDuration(asset.duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-2">
          <span className="text-xs px-1.5 py-0.5 bg-blue-900/40 text-blue-400 rounded font-mono truncate max-w-full">
            {asset.codec}
          </span>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onAddToTimeline(); }}
          className="w-full flex items-center justify-center gap-1 py-1 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 hover:border-blue-500/50 text-blue-400 text-xs rounded transition-all"
          title="Add new clip to timeline at current playhead"
        >
          <Plus className="w-3 h-3" />
          Add to Timeline
        </button>
      </div>
    </div>
  );
};

interface VideoMediaTabProps {
  onSetActiveTool?: (tool: string) => void;
  onSetPendingVideoAsset?: (asset: VideoAsset) => void;
}

const VideoMediaTab: React.FC<VideoMediaTabProps> = ({ onSetActiveTool, onSetPendingVideoAsset }) => {
  const { videoState, importVideo, addClipFromVideoAsset, removeAsset } = useVideo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = React.useState(false);

  const assets = Object.values(videoState.assets);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setImporting(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('video/')) continue;
        await importVideo(file);
      }
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
    if (files.length === 0) return;
    setImporting(true);
    try {
      for (const file of files) {
        await importVideo(file);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleSelectForPlacement = (asset: VideoAsset) => {
    if (onSetActiveTool && onSetPendingVideoAsset) {
      onSetPendingVideoAsset(asset);
      onSetActiveTool('video-placement');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-blue-900/30 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Film className="w-3.5 h-3.5 text-blue-400" />
            <h3 className="text-xs font-semibold text-blue-400">Video Pool</h3>
          </div>
          <span className="text-xs text-gray-500">{assets.length} file{assets.length !== 1 ? 's' : ''}</span>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="w-full py-1.5 px-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 hover:border-blue-500/50 text-blue-400 rounded text-xs font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {importing ? (
            <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload className="w-3 h-3" />
          )}
          {importing ? 'Importing...' : 'Import Video'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="text-xs text-gray-600 mt-1 text-center">MP4 · WebM · MOV</p>
      </div>

      {/* Asset grid — 3 columns so each card is ⅓ of the panel width */}
      <div
        className="flex-1 overflow-y-auto p-2"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-blue-900/40 rounded-lg">
            <Film className="w-8 h-8 text-blue-900/60 mb-2" />
            <p className="text-xs text-gray-500 text-center px-4">
              Drop video files here or click Import Video
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {assets.map(asset => (
              <VideoAssetCard
                key={asset.id}
                asset={asset}
                onAddToTimeline={() => addClipFromVideoAsset(asset.id)}
                onDelete={() => removeAsset(asset.id)}
                onSelectForPlacement={() => handleSelectForPlacement(asset)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoMediaTab;
