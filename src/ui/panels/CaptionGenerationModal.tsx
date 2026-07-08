import { X, Captions, Cpu, Zap, Download, Check, Loader2, AlertTriangle } from 'lucide-react';
import { useCaptionStore } from '../../store/captions';
import { useEditorStore } from '../../store/editor';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import { persistTranscript } from '../../engine/captions/transcriptStore';
import {
  LANGUAGE_OPTIONS,
  MODEL_OPTIONS,
  POSITION_PRESETS,
  STYLE_TEMPLATES,
  type TimestampMode,
} from '../../core/captions';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

export function CaptionGenerationModal() {
  const isOpen = useCaptionStore((s) => s.isOpen);
  const stage = useCaptionStore((s) => s.stage);
  const options = useCaptionStore((s) => s.options);
  const backend = useCaptionStore((s) => s.backend);
  const download = useCaptionStore((s) => s.download);
  const statusMessage = useCaptionStore((s) => s.statusMessage);
  const error = useCaptionStore((s) => s.error);
  const previewSegments = useCaptionStore((s) => s.previewSegments);
  const processingTimeMs = useCaptionStore((s) => s.processingTimeMs);
  const targetName = useCaptionStore((s) => s.targetName);
  const targetLayerId = useCaptionStore((s) => s.targetLayerId);
  const targetClipStartFrame = useCaptionStore((s) => s.targetClipStartFrame);

  const setOption = useCaptionStore((s) => s.setOption);
  const startGeneration = useCaptionStore((s) => s.startGeneration);
  const close = useCaptionStore((s) => s.close);
  const cancel = useCaptionStore((s) => s.cancel);

  const addCaptionClips = useEditorStore((s) => s.addCaptionClips);

  if (!isOpen) return null;

  const busy = stage === 'extracting' || stage === 'downloading' || stage === 'loading-model' || stage === 'transcribing';

  const handleAccept = () => {
    if (!previewSegments || !targetLayerId) return;
    addCaptionClips(previewSegments, options, targetClipStartFrame);
    persistTranscript({
      projectId: useProjectStore.getState().activeProjectId,
      sourceLayerId: targetLayerId,
      options,
      segments: previewSegments,
      processingMs: processingTimeMs,
    });
    close();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!busy ? close : undefined} />

      <div className="relative bg-[#0e1c32] border border-[#1a2a42] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a2a42]">
          <div className="flex items-center gap-2 min-w-0">
            <Captions size={16} className="text-cyan-400 shrink-0" />
            <h2 className="text-sm font-medium text-slate-200 truncate">Generate Captions</h2>
            {targetName && <span className="text-[11px] text-slate-600 truncate">— {targetName}</span>}
          </div>
          {!busy && (
            <button onClick={close} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Options */}
        {stage === 'options' && (
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Language */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">Language</label>
              <select
                value={options.language ?? ''}
                onChange={(e) => setOption({ language: e.target.value === '' ? null : e.target.value })}
                className="w-full bg-[#122240] text-[12px] text-slate-300 px-3 py-2 rounded border border-[#1a2a42] focus:border-cyan-400/50 outline-none"
              >
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.label} value={l.code ?? ''}>{l.label}</option>
                ))}
              </select>
            </div>

            {/* Timestamp Mode */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">Caption Type</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { id: 'phrase', label: 'Phrase Captions', desc: 'Natural sentence chunks' },
                  { id: 'word', label: 'Word Captions', desc: 'Word-by-word timing' },
                ] as { id: TimestampMode; label: string; desc: string }[]).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setOption({ timestampMode: m.id })}
                    className={`text-left px-3 py-2 rounded border transition-colors ${
                      options.timestampMode === m.id
                        ? 'bg-[#1a2a42] border-cyan-400/40 text-slate-200'
                        : 'bg-[#122240] border-[#1a2a42] text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <div className="text-[12px] font-medium">{m.label}</div>
                    <div className="text-[10px] text-slate-600">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Style */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">Caption Style</label>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setOption({ style: t.id })}
                    className={`px-3 py-1.5 rounded text-[11px] transition-colors ${
                      options.style === t.id
                        ? 'bg-cyan-400 text-[#0e1c32] font-medium'
                        : 'bg-[#122240] text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Position */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">Position</label>
              <div className="flex flex-wrap gap-1.5">
                {POSITION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setOption({ position: p.id })}
                    className={`px-3 py-1.5 rounded text-[11px] transition-colors ${
                      options.position === p.id
                        ? 'bg-[#1a2a42] text-cyan-400 border border-cyan-400/30'
                        : 'bg-[#122240] text-slate-400 hover:text-slate-300 border border-transparent'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">Model</label>
              <div className="grid grid-cols-2 gap-1.5">
                {MODEL_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setOption({ model: m.id })}
                    className={`text-left px-3 py-2 rounded border transition-colors ${
                      options.model === m.id
                        ? 'bg-[#1a2a42] border-cyan-400/40 text-slate-200'
                        : 'bg-[#122240] border-[#1a2a42] text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <div className="text-[12px] font-medium">{m.label}</div>
                    <div className="text-[10px] text-slate-600">{m.description}</div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5">
                First run downloads the model; later runs load instantly from cache. Runs offline on your device.
              </p>
            </div>

            <button
              onClick={() => void startGeneration()}
              className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-[#0e1c32] rounded-lg text-[12px] font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Captions size={14} />
              Generate Captions
            </button>
          </div>
        )}

        {/* Busy / progress */}
        {busy && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
                {stage === 'downloading' ? (
                  <Download size={22} className="text-cyan-400" />
                ) : (
                  <Loader2 size={22} className="text-cyan-400 animate-spin" />
                )}
              </div>
              <div>
                <p className="text-[13px] text-slate-200 font-medium">{statusMessage || 'Working'}</p>
                {backend && (
                  <p className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-center gap-1">
                    {backend === 'webgpu' ? <Zap size={10} /> : <Cpu size={10} />}
                    {backend === 'webgpu' ? 'GPU accelerated' : 'CPU (WebAssembly)'}
                  </p>
                )}
              </div>
            </div>

            {stage === 'downloading' && download && (
              <div className="space-y-1.5">
                <div className="w-full h-1.5 bg-[#1a2a42] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 rounded-full transition-all duration-150"
                    style={{ width: `${Math.round(download.progress)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span className="truncate max-w-[60%]">{download.file}</span>
                  <span>{Math.round(download.progress)}%</span>
                </div>
              </div>
            )}

            {(stage === 'transcribing' || stage === 'loading-model' || stage === 'extracting') && (
              <div className="w-full h-1.5 bg-[#1a2a42] rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-cyan-400/70 rounded-full animate-pulse" />
              </div>
            )}

            <button
              onClick={cancel}
              className="w-full py-2 bg-[#122240] hover:bg-[#1a2a42] text-slate-400 hover:text-slate-300 rounded-lg text-[11px] font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Preview */}
        {stage === 'preview' && previewSegments && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check size={14} className="text-cyan-400" />
                <span className="text-[12px] text-slate-200 font-medium">
                  {previewSegments.length} captions ready
                </span>
              </div>
              <span className="text-[10px] text-slate-600">
                {(processingTimeMs / 1000).toFixed(1)}s
                {backend && ` · ${backend === 'webgpu' ? 'GPU' : 'CPU'}`}
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-[#1a2a42] divide-y divide-[#1a2a42]">
              {previewSegments.map((seg, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2">
                  <span className="text-[10px] font-mono text-slate-600 shrink-0 pt-0.5 w-24">
                    {formatTime(seg.start)} → {formatTime(seg.end)}
                  </span>
                  <span className="text-[12px] text-slate-300 leading-tight">{seg.text}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => useCaptionStore.setState({ stage: 'options', previewSegments: null })}
                className="flex-1 py-2 bg-[#122240] hover:bg-[#1a2a42] text-slate-400 hover:text-slate-300 rounded-lg text-[11px] font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleAccept}
                className="flex-[2] py-2 bg-cyan-400 hover:bg-cyan-300 text-[#0e1c32] rounded-lg text-[12px] font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Check size={14} />
                Add to Timeline
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {stage === 'error' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <p className="text-[12px] text-red-400 max-w-sm">{error}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={close}
                className="flex-1 py-2 bg-[#122240] hover:bg-[#1a2a42] text-slate-400 hover:text-slate-300 rounded-lg text-[11px] font-medium transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => useCaptionStore.setState({ stage: 'options', error: null })}
                className="flex-1 py-2 bg-cyan-400 hover:bg-cyan-300 text-[#0e1c32] rounded-lg text-[12px] font-semibold transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
