import { X, Scissors, Loader2, Check, AlertTriangle, Eye } from 'lucide-react';
import { useState } from 'react';
import { useSilenceStore } from '../../store/silenceStripper';
import { THRESHOLD_MIN_DB, THRESHOLD_MAX_DB } from '../../core/silenceDetection';

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{label}</label>
        <span className="text-[12px] font-mono text-cyan-400">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-cyan-400 cursor-pointer"
      />
    </div>
  );
}

export function SilenceStripperModal() {
  const isOpen = useSilenceStore((s) => s.isOpen);
  const stage = useSilenceStore((s) => s.stage);
  const settings = useSilenceStore((s) => s.settings);
  const progress = useSilenceStore((s) => s.progress);
  const error = useSilenceStore((s) => s.error);
  const plan = useSilenceStore((s) => s.plan);
  const stats = useSilenceStore((s) => s.stats);
  const targetName = useSilenceStore((s) => s.targetName);
  const mapping = useSilenceStore((s) => s.mapping);

  const setSetting = useSilenceStore((s) => s.setSetting);
  const runAnalysis = useSilenceStore((s) => s.runAnalysis);
  const apply = useSilenceStore((s) => s.apply);
  const close = useSilenceStore((s) => s.close);
  const cancel = useSilenceStore((s) => s.cancel);

  const [confirmAllSilence, setConfirmAllSilence] = useState(false);

  if (!isOpen) return null;

  const busy = stage === 'analyzing' || stage === 'detecting' || stage === 'applying';
  const fr = mapping?.frameRate ?? 30;
  const removedSec = plan ? plan.removedFrames / fr : 0;
  const noSilence = stage === 'preview' && plan !== null && (plan.cuts === 0 || plan.removedFrames <= 0);
  const allSilence = stage === 'preview' && plan !== null && plan.isAllSilence;
  const canApply = stage === 'preview' && plan !== null && !noSilence && !allSilence;

  const handleApply = () => { void apply(); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!busy ? close : undefined} />

      <div className="relative bg-[#0e1c32] border border-[#1a2a42] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a2a42]">
          <div className="flex items-center gap-2 min-w-0">
            <Scissors size={16} className="text-cyan-400 shrink-0" />
            <h2 className="text-sm font-medium text-slate-200 truncate">Silence Stripper</h2>
            {targetName && <span className="text-[11px] text-slate-600 truncate">— {targetName}</span>}
          </div>
          {!busy && (
            <button onClick={close} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {(stage === 'config' || stage === 'preview') && (
          <div className="p-5 space-y-5">
            <div className="space-y-4">
              <Slider
                label="Volume Threshold"
                value={settings.thresholdDb}
                min={THRESHOLD_MIN_DB}
                max={THRESHOLD_MAX_DB}
                step={1}
                format={(v) => `${v} dB`}
                onChange={(v) => setSetting({ thresholdDb: v })}
              />
              <Slider
                label="Minimum Silence Duration"
                value={settings.minSilenceSec}
                min={0.1}
                max={2}
                step={0.05}
                format={(v) => `${v.toFixed(2)} s`}
                onChange={(v) => setSetting({ minSilenceSec: v })}
              />
              <Slider
                label="Padding"
                value={settings.paddingSec}
                min={0}
                max={0.5}
                step={0.01}
                format={(v) => `${v.toFixed(2)} s`}
                onChange={(v) => setSetting({ paddingSec: v })}
              />
            </div>

            {stage === 'config' && (
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Audio is analyzed locally in your browser — nothing is uploaded. Generate a preview to
                see which sections will be removed before applying.
              </p>
            )}

            {stage === 'preview' && plan && (
              <div className="rounded-lg border border-[#1a2a42] bg-[#0b0e14] p-3 space-y-2">
                {noSilence ? (
                  <div className="flex items-center gap-2 text-[12px] text-slate-300">
                    <Check size={14} className="text-emerald-400" />
                    No silence detected at this threshold.
                  </div>
                ) : allSilence ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[12px] text-amber-300">
                      <AlertTriangle size={14} className="text-amber-400" />
                      The entire clip is below the threshold.
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmAllSilence}
                        onChange={(e) => setConfirmAllSilence(e.target.checked)}
                        className="accent-cyan-400"
                      />
                      I understand this will remove the whole clip
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-600">Cuts</div>
                      <div className="text-[15px] font-semibold text-slate-200">{plan.cuts}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-600">Time removed</div>
                      <div className="text-[15px] font-semibold text-cyan-400">{removedSec.toFixed(2)}s</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/60" /> Silence
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Kept
                  </span>
                </div>
              </div>
            )}

            {stage === 'config' ? (
              <button
                onClick={() => void runAnalysis()}
                className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-[#0e1c32] rounded-lg text-[12px] font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Eye size={14} />
                Generate Preview
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={close}
                  className="flex-1 py-2 bg-[#122240] hover:bg-[#1a2a42] text-slate-400 hover:text-slate-300 rounded-lg text-[11px] font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={!canApply && !(allSilence && confirmAllSilence)}
                  className="flex-[2] py-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed text-[#0e1c32] rounded-lg text-[12px] font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Scissors size={14} />
                  Apply
                </button>
              </div>
            )}
          </div>
        )}

        {busy && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
                <Loader2 size={22} className="text-cyan-400 animate-spin" />
              </div>
              <p className="text-[13px] text-slate-200 font-medium">
                {stage === 'analyzing' && 'Analyzing audio'}
                {stage === 'detecting' && 'Detecting silence'}
                {stage === 'applying' && 'Applying edits'}
              </p>
            </div>
            {stage === 'analyzing' && (
              <div className="w-full h-1.5 bg-[#1a2a42] rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
            {stage !== 'applying' && (
              <button
                onClick={cancel}
                className="w-full py-2 bg-[#122240] hover:bg-[#1a2a42] text-slate-400 hover:text-slate-300 rounded-lg text-[11px] font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {stage === 'done' && stats && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Check size={22} className="text-emerald-400" />
              </div>
              <p className="text-[13px] text-slate-200 font-medium">Silence stripped</p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#1a2a42] bg-[#0b0e14] p-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-600">Cuts</div>
                <div className="text-[15px] font-semibold text-slate-200">{stats.cuts}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-600">Time saved</div>
                <div className="text-[15px] font-semibold text-cyan-400">{stats.removedSec.toFixed(2)}s</div>
              </div>
            </div>
            <button
              onClick={close}
              className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-[#0e1c32] rounded-lg text-[12px] font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        )}

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
                onClick={() => useSilenceStore.setState({ stage: 'config', error: null })}
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
