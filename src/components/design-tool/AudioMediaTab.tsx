import React, { useRef } from 'react';
import { Upload, Music, Plus, Trash2, Clock } from 'lucide-react';
import { useAudio } from '../../audio/AudioContext';
import { AudioAsset } from '../../audio/types';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

const WaveformPreview: React.FC<{ waveform: number[]; rmsWaveform?: number[]; color?: string }> = ({
  waveform,
  rmsWaveform,
  color = 'rgba(74,222,128,0.6)',
}) => {
  if (!waveform.length) return null;
  const n = waveform.length;
  const topPts = waveform.map((p, i) => `${i},${(0.5 - p * 0.44).toFixed(4)}`).join(' ');
  const botPts = [...waveform].reverse().map((p, i) => `${n - 1 - i},${(0.5 + p * 0.44).toFixed(4)}`).join(' ');
  const rmsTopPts = rmsWaveform
    ? rmsWaveform.map((p, i) => `${i},${(0.5 - p * 0.44).toFixed(4)}`).join(' ')
    : null;
  const rmsBotPts = rmsWaveform
    ? [...rmsWaveform].reverse().map((p, i) => `${n - 1 - i},${(0.5 + p * 0.44).toFixed(4)}`).join(' ')
    : null;

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${n} 1`} preserveAspectRatio="none">
      <polygon points={`${topPts} ${botPts}`} fill={color} opacity="0.35" />
      {rmsTopPts && rmsBotPts && (
        <polygon points={`${rmsTopPts} ${rmsBotPts}`} fill={color} opacity="0.8" />
      )}
    </svg>
  );
};

const AudioAssetCard: React.FC<{
  asset: AudioAsset;
  onAddToTimeline: () => void;
  onDelete: () => void;
}> = ({ asset, onAddToTimeline, onDelete }) => {
  return (
    <div className="group bg-gray-800/60 border border-green-900/40 hover:border-green-500/50 rounded-lg overflow-hidden transition-all">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 rounded flex items-center justify-center bg-green-900/50 shrink-0">
              <Music className="w-3.5 h-3.5 text-green-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate" title={asset.fileName}>
                {asset.fileName.replace(/\.[^.]+$/, '')}
              </p>
              <p className="text-xs text-gray-500 truncate">{asset.fileName.split('.').pop()?.toUpperCase()}</p>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            title="Remove from pool"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <div className="h-10 bg-gray-900/50 rounded overflow-hidden border border-gray-700/30 mb-2">
          <WaveformPreview waveform={asset.waveform} rmsWaveform={asset.rmsWaveform} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3 h-3" />
            <span className="text-xs font-mono">{formatDuration(asset.duration)}</span>
          </div>
          <button
            onClick={onAddToTimeline}
            className="flex items-center gap-1 px-2 py-1 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 hover:border-green-500/50 text-green-400 text-xs rounded transition-all"
            title="Add new clip to timeline at current playhead position"
          >
            <Plus className="w-3 h-3" />
            Add to Timeline
          </button>
        </div>
      </div>
    </div>
  );
};

const AudioMediaTab: React.FC = () => {
  const { audioState, importAudio, addClipFromAsset, removeAsset } = useAudio();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const assets = Object.values(audioState.assets);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) continue;
      await importAudio(file);
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    for (const file of files) {
      await importAudio(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-green-900/30 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Music className="w-3.5 h-3.5 text-green-400" />
            <h3 className="text-xs font-semibold text-green-400">Audio Pool</h3>
          </div>
          <span className="text-xs text-gray-500">{assets.length} file{assets.length !== 1 ? 's' : ''}</span>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-1.5 px-2 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 hover:border-green-500/50 text-green-400 rounded text-xs font-medium transition-all flex items-center justify-center gap-1.5"
        >
          <Upload className="w-3 h-3" />
          Import Audio
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div
        className="flex-1 overflow-y-auto p-2 space-y-2"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-green-900/40 rounded-lg">
            <Music className="w-8 h-8 text-green-900/60 mb-2" />
            <p className="text-xs text-gray-500 text-center px-4">
              Drop audio files here or click Import Audio
            </p>
            <p className="text-xs text-gray-600 text-center px-4 mt-1">
              Supports MP3, WAV, OGG, M4A
            </p>
          </div>
        ) : (
          assets.map(asset => (
            <AudioAssetCard
              key={asset.id}
              asset={asset}
              onAddToTimeline={() => addClipFromAsset(asset.id)}
              onDelete={() => removeAsset(asset.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default AudioMediaTab;
