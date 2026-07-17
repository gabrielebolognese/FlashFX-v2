import { useState, useRef, useMemo } from 'react';
import { X, Download, Film, Zap, Crown, Check, Volume2, VolumeX } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { exportToMp4, downloadBlob, formatFileSize, estimateDuration, type ExportProgress, type ExportSettings } from '../../codec/exporter';
import { compositionHasAudio } from '../../codec/audioMixer';

interface ExportModalProps {
  onClose: () => void;
}

type QualityPreset = 'draft' | 'standard' | 'high' | 'ultra';

const QUALITY_PRESETS: Record<QualityPreset, { label: string; bitrate: number; codec: string; description: string }> = {
  draft: { label: 'Draft', bitrate: 2_000_000, codec: 'avc1.42001f', description: 'Fast export, smaller file' },
  standard: { label: 'Standard', bitrate: 5_000_000, codec: 'avc1.42001f', description: 'Good quality, balanced size' },
  high: { label: 'High', bitrate: 10_000_000, codec: 'avc1.4d0028', description: 'Great quality for sharing' },
  ultra: { label: 'Ultra', bitrate: 20_000_000, codec: 'avc1.640032', description: 'Maximum quality, large file' },
};

const RESOLUTION_PRESETS = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '4K', width: 3840, height: 2160 },
  { label: 'Custom', width: 0, height: 0 },
];

export function ExportModal({ onClose }: ExportModalProps) {
  const composition = useEditorStore((s) => s.composition);
  const [quality, setQuality] = useState<QualityPreset>('high');
  const [resolution, setResolution] = useState({ width: composition.settings.width, height: composition.settings.height });
  const [frameRate, setFrameRate] = useState(composition.settings.frameRate);
  const hasAudio = useMemo(() => compositionHasAudio(composition), [composition]);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const preset = QUALITY_PRESETS[quality];
  const totalFrames = composition.settings.durationFrames;
  const duration = estimateDuration(frameRate, totalFrames);

  const handleExport = async () => {
    setExporting(true);
    setProgress(null);
    setError(null);
    setExportedBlob(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const settings: Partial<ExportSettings> = {
      width: resolution.width,
      height: resolution.height,
      frameRate,
      bitrate: preset.bitrate,
      codec: preset.codec,
      includeAudio: hasAudio && includeAudio,
    };

    try {
      const blob = await exportToMp4(composition, settings, setProgress, controller.signal);
      setExportedBlob(blob);
    } catch (e) {
      if ((e as Error).message !== 'Export cancelled') {
        setError((e as Error).message);
      }
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setExporting(false);
  };

  const handleDownload = () => {
    if (!exportedBlob) return;
    const filename = `${composition.name || 'FlashFX_Export'}_${resolution.width}x${resolution.height}.mp4`;
    downloadBlob(exportedBlob, filename);
  };

  const matchingRes = RESOLUTION_PRESETS.find((r) => r.width === resolution.width && r.height === resolution.height);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!exporting ? onClose : undefined} />

      <div className="relative bg-[#0e1c32] border border-[#1a2a42] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a2a42]">
          <div className="flex items-center gap-2">
            <Film size={16} className="text-yellow-400" />
            <h2 className="text-sm font-medium text-slate-200">Export Video</h2>
          </div>
          {!exporting && (
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        {!exporting && !exportedBlob && (
          <div className="p-5 space-y-5">
            {/* Quality Presets */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">Quality</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(QUALITY_PRESETS) as QualityPreset[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setQuality(key)}
                    className={`py-2 px-2 rounded text-[11px] font-medium transition-all ${
                      quality === key
                        ? 'bg-yellow-400 text-[#0e1c32]'
                        : 'bg-[#122240] text-slate-400 hover:bg-[#1a2a42] hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      {key === 'draft' && <Zap size={10} />}
                      {key === 'ultra' && <Crown size={10} />}
                      <span>{QUALITY_PRESETS[key].label}</span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5">{preset.description}</p>
            </div>

            {/* Resolution */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">Resolution</label>
              <div className="flex gap-1.5 mb-2">
                {RESOLUTION_PRESETS.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => {
                      if (r.width > 0) setResolution({ width: r.width, height: r.height });
                    }}
                    className={`py-1 px-2.5 rounded text-[11px] transition-colors ${
                      matchingRes?.label === r.label
                        ? 'bg-[#1a2a42] text-yellow-400 border border-yellow-400/30'
                        : 'bg-[#122240] text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={resolution.width}
                  onChange={(e) => setResolution({ ...resolution, width: Number(e.target.value) })}
                  className="flex-1 bg-[#122240] text-[11px] text-slate-300 px-2 py-1.5 rounded border border-[#1a2a42] focus:border-yellow-400/50 outline-none"
                />
                <span className="text-[10px] text-slate-600">x</span>
                <input
                  type="number"
                  value={resolution.height}
                  onChange={(e) => setResolution({ ...resolution, height: Number(e.target.value) })}
                  className="flex-1 bg-[#122240] text-[11px] text-slate-300 px-2 py-1.5 rounded border border-[#1a2a42] focus:border-yellow-400/50 outline-none"
                />
                <span className="text-[10px] text-slate-600">px</span>
              </div>
            </div>

            {/* Frame Rate */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">Frame Rate</label>
              <div className="flex gap-1.5">
                {[24, 30, 60].map((fps) => (
                  <button
                    key={fps}
                    onClick={() => setFrameRate(fps)}
                    className={`py-1 px-3 rounded text-[11px] transition-colors ${
                      frameRate === fps
                        ? 'bg-[#1a2a42] text-yellow-400 border border-yellow-400/30'
                        : 'bg-[#122240] text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {fps} fps
                  </button>
                ))}
              </div>
            </div>

            {/* Audio */}
            {hasAudio && (
              <button
                onClick={() => setIncludeAudio((v) => !v)}
                className="w-full flex items-center justify-between bg-[#122240] hover:bg-[#1a2a42] rounded-lg px-3 py-2.5 transition-colors"
              >
                <span className="flex items-center gap-2 text-[11px] text-slate-300">
                  {includeAudio ? <Volume2 size={13} className="text-yellow-400" /> : <VolumeX size={13} className="text-slate-500" />}
                  Include audio
                </span>
                <span className={`relative w-8 h-4 rounded-full transition-colors ${includeAudio ? 'bg-yellow-400' : 'bg-[#1a2a42]'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-[#0e1c32] transition-all ${includeAudio ? 'left-4' : 'left-0.5'}`} />
                </span>
              </button>
            )}

            {/* Summary */}
            <div className="bg-[#0a1628] rounded-lg p-3 border border-[#1a2a42]">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-slate-600 mb-0.5">Duration</div>
                  <div className="text-[12px] text-slate-300 font-medium">{duration}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-600 mb-0.5">Frames</div>
                  <div className="text-[12px] text-slate-300 font-medium">{totalFrames}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-600 mb-0.5">Est. Size</div>
                  <div className="text-[12px] text-slate-300 font-medium">
                    {formatFileSize(Math.round((preset.bitrate * totalFrames) / (frameRate * 8)))}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-[11px] text-red-400">{error}</p>
              </div>
            )}

            {/* Export Button */}
            <button
              onClick={handleExport}
              className="w-full py-2.5 bg-yellow-400 hover:bg-yellow-300 text-[#0e1c32] rounded-lg text-[12px] font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Download size={14} />
              Export MP4
            </button>
          </div>
        )}

        {/* Exporting Progress */}
        {exporting && progress && (
          <div className="p-5 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full border-2 border-[#1a2a42] flex items-center justify-center relative">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                  <circle
                    cx="32" cy="32" r="29"
                    fill="none"
                    stroke="#1a2a42"
                    strokeWidth="3"
                  />
                  <circle
                    cx="32" cy="32" r="29"
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 29}`}
                    strokeDashoffset={`${2 * Math.PI * 29 * (1 - progress.percent / 100)}`}
                    strokeLinecap="round"
                    className="transition-all duration-200"
                  />
                </svg>
                <span className="text-[13px] font-semibold text-yellow-400">{progress.percent}%</span>
              </div>
              <p className="text-[12px] text-slate-300 font-medium mb-1">{progress.message}</p>
              <p className="text-[10px] text-slate-600">
                {progress.currentFrame} / {progress.totalFrames} frames
              </p>
            </div>

            <div className="w-full h-1.5 bg-[#1a2a42] rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>

            <button
              onClick={handleCancel}
              className="w-full py-2 bg-[#122240] hover:bg-[#1a2a42] text-slate-400 hover:text-slate-300 rounded-lg text-[11px] font-medium transition-colors"
            >
              Cancel Export
            </button>
          </div>
        )}

        {/* Export Complete */}
        {exportedBlob && !exporting && (
          <div className="p-5 space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center">
                <Check size={24} className="text-yellow-400" />
              </div>
              <p className="text-[13px] text-slate-200 font-medium mb-1">Export Complete</p>
              <p className="text-[11px] text-slate-500">
                {resolution.width}x{resolution.height} at {frameRate}fps -- {formatFileSize(exportedBlob.size)}
              </p>
            </div>

            <button
              onClick={handleDownload}
              className="w-full py-2.5 bg-yellow-400 hover:bg-yellow-300 text-[#0e1c32] rounded-lg text-[12px] font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Download size={14} />
              Download MP4
            </button>

            <button
              onClick={() => { setExportedBlob(null); setProgress(null); }}
              className="w-full py-2 bg-[#122240] hover:bg-[#1a2a42] text-slate-400 hover:text-slate-300 rounded-lg text-[11px] font-medium transition-colors"
            >
              Export Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
