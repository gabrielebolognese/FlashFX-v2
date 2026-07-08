import { useState } from 'react';
import { X, Monitor, Film, Smartphone } from 'lucide-react';
import { useProjectStore } from '../hooks/useProjectStore';
import type { CreateProjectOptions, VideoFormat } from '../types';
import { deriveOrientation } from '../types';

const LONG_PRESETS = [
  { label: 'Full HD', width: 1920, height: 1080 },
  { label: '4K', width: 3840, height: 2160 },
  { label: 'QHD', width: 2560, height: 1440 },
  { label: 'Square HD', width: 1080, height: 1080 },
  { label: 'YT Thumb', width: 1280, height: 720 },
];

const SHORT_PRESETS = [
  { label: 'Vertical HD', width: 1080, height: 1920 },
  { label: 'IG Story', width: 1080, height: 1920 },
  { label: 'TikTok', width: 1080, height: 1920 },
  { label: '4K Vertical', width: 2160, height: 3840 },
  { label: 'Square', width: 1080, height: 1080 },
];

interface Props {
  onClose: () => void;
}

export function CreateProjectModal({ onClose }: Props) {
  const createAndOpenProject = useProjectStore((s) => s.createAndOpenProject);

  const savedFormat = localStorage.getItem('ffx-default-video-format') as VideoFormat | null;
  const [name, setName] = useState('Untitled Project');
  const [videoFormat, setVideoFormat] = useState<VideoFormat>(savedFormat || 'long');
  const [width, setWidth] = useState(savedFormat === 'short' ? 1080 : 1920);
  const [height, setHeight] = useState(savedFormat === 'short' ? 1920 : 1080);
  const [frameRate, setFrameRate] = useState(30);
  const [durationFrames, setDurationFrames] = useState(150);
  const [creating, setCreating] = useState(false);

  const orientation = deriveOrientation(width, height);
  const presets = videoFormat === 'long' ? LONG_PRESETS : SHORT_PRESETS;

  const handleFormatChange = (f: VideoFormat) => {
    setVideoFormat(f);
    if (f === 'short') {
      setWidth(1080);
      setHeight(1920);
    } else {
      setWidth(1920);
      setHeight(1080);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const options: CreateProjectOptions = {
      name: name.trim(),
      width,
      height,
      frameRate,
      durationFrames,
      videoFormat,
    };
    await createAndOpenProject(options);
    onClose();
  };

  const applyPreset = (preset: { width: number; height: number }) => {
    setWidth(preset.width);
    setHeight(preset.height);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
      <div className="w-full max-w-md bg-[#111821] border border-[#1c2433] rounded-lg shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1c2433]">
          <h2 className="text-[13px] font-semibold text-slate-200">New Project</h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1a2233] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Project name */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full px-2.5 py-[6px] bg-[#0d1219] border border-[#1c2433] rounded-md text-[12px] text-slate-200 focus:border-[#f7b500]/40 focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* Video format selector */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleFormatChange('long')}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all ${
                  videoFormat === 'long'
                    ? 'bg-[#f7b500]/8 border-[#f7b500]/40 shadow-[0_0_12px_rgba(247,181,0,0.08)]'
                    : 'bg-[#0d1219] border-[#1c2433] hover:border-[#2a3a50]'
                }`}
              >
                <div className={`w-8 h-5 rounded-[3px] border-2 flex items-center justify-center ${
                  videoFormat === 'long' ? 'border-[#f7b500]/60' : 'border-slate-600'
                }`}>
                  <Film size={10} className={videoFormat === 'long' ? 'text-[#f7b500]' : 'text-slate-500'} />
                </div>
                <div className="text-left">
                  <div className={`text-[11px] font-medium ${videoFormat === 'long' ? 'text-[#ffc83d]' : 'text-slate-300'}`}>
                    Long Form
                  </div>
                  <div className="text-[9px] text-slate-500">Landscape 16:9</div>
                </div>
              </button>
              <button
                onClick={() => handleFormatChange('short')}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all ${
                  videoFormat === 'short'
                    ? 'bg-[#f7b500]/8 border-[#f7b500]/40 shadow-[0_0_12px_rgba(247,181,0,0.08)]'
                    : 'bg-[#0d1219] border-[#1c2433] hover:border-[#2a3a50]'
                }`}
              >
                <div className={`w-5 h-8 rounded-[3px] border-2 flex items-center justify-center ${
                  videoFormat === 'short' ? 'border-[#f7b500]/60' : 'border-slate-600'
                }`}>
                  <Smartphone size={10} className={videoFormat === 'short' ? 'text-[#f7b500]' : 'text-slate-500'} />
                </div>
                <div className="text-left">
                  <div className={`text-[11px] font-medium ${videoFormat === 'short' ? 'text-[#ffc83d]' : 'text-slate-300'}`}>
                    Short Form
                  </div>
                  <div className="text-[9px] text-slate-500">Vertical 9:16</div>
                </div>
              </button>
            </div>
          </div>

          {/* Resolution presets */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">Resolution</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset)}
                  className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                    width === preset.width && height === preset.height
                      ? 'bg-[#f7b500]/10 border-[#f7b500]/30 text-[#ffc83d]'
                      : 'bg-[#0d1219] border-[#1c2433] text-slate-400 hover:border-[#2a3a50] hover:text-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom resolution */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-[9px] text-slate-500 mb-0.5">Width</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2 py-[5px] bg-[#0d1219] border border-[#1c2433] rounded text-[11px] text-slate-300 focus:border-[#f7b500]/30 focus:outline-none"
                />
              </div>
              <span className="text-slate-600 text-[10px] mt-3">x</span>
              <div className="flex-1">
                <label className="block text-[9px] text-slate-500 mb-0.5">Height</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2 py-[5px] bg-[#0d1219] border border-[#1c2433] rounded text-[11px] text-slate-300 focus:border-[#f7b500]/30 focus:outline-none"
                />
              </div>
            </div>

            {/* Orientation badge */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <Monitor size={10} className="text-slate-500" />
              <span className="text-[10px] text-slate-500 capitalize">{orientation}</span>
              <span className="text-[10px] text-slate-600">|</span>
              <span className="text-[10px] text-slate-500">{width} x {height}</span>
            </div>
          </div>

          {/* Timeline settings */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wider">Frame Rate</label>
              <select
                value={frameRate}
                onChange={(e) => setFrameRate(Number(e.target.value))}
                className="w-full px-2 py-[5px] bg-[#0d1219] border border-[#1c2433] rounded text-[11px] text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value={24}>24 fps</option>
                <option value={25}>25 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wider">Duration</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={durationFrames}
                  onChange={(e) => setDurationFrames(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 px-2 py-[5px] bg-[#0d1219] border border-[#1c2433] rounded text-[11px] text-slate-300 focus:border-[#f7b500]/30 focus:outline-none"
                />
                <span className="text-[9px] text-slate-500">f</span>
              </div>
              <span className="text-[9px] text-slate-600 mt-0.5 block">
                {(durationFrames / frameRate).toFixed(1)}s
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#1c2433] bg-[#0d1219]">
          <button
            onClick={onClose}
            className="px-3 py-[5px] text-[11px] text-slate-400 hover:text-slate-200 transition-colors rounded-md hover:bg-[#1a2233]"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="px-4 py-[5px] bg-[#f7b500] hover:bg-[#ffc83d] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0f16] text-[11px] font-semibold rounded-md transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
