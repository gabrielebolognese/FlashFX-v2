import { Scissors, Loader2, Check, AlertTriangle, Eye } from 'lucide-react';
import { useState } from 'react';
import { useSilenceStore } from '../../store/silenceStripper';
import { THRESHOLD_MIN_DB, THRESHOLD_MAX_DB } from '../../core/silenceDetection';
import { Modal } from '../primitives/Modal';
import { Button } from '../primitives/Button';

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
        <label className="text-overline uppercase text-tertiary">{label}</label>
        <span className="text-caption font-mono text-accent">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full cursor-pointer [accent-color:var(--ffx-accent)]"
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
    <Modal
      onClose={close}
      dismissable={!busy}
      icon={<Scissors size={16} />}
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">Silence Stripper</span>
          {targetName && <span className="truncate text-caption text-tertiary">{targetName}</span>}
        </span>
      }
    >
      {(stage === 'config' || stage === 'preview') && (
        <div className="space-y-5">
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
            <p className="text-caption leading-relaxed text-tertiary">
              Audio is analyzed locally in your browser, nothing is uploaded. Generate a preview to
              see which sections will be removed before applying.
            </p>
          )}

          {stage === 'preview' && plan && (
            <div className="space-y-2 rounded-lg border border-hairline bg-surface-sunken p-3">
              {noSilence ? (
                <div className="flex items-center gap-2 text-body text-secondary">
                  <Check size={14} className="text-success" />
                  No silence detected at this threshold.
                </div>
              ) : allSilence ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-body text-amber-300">
                    <AlertTriangle size={14} className="text-amber-400" />
                    The entire clip is below the threshold.
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-caption text-secondary">
                    <input
                      type="checkbox"
                      checked={confirmAllSilence}
                      onChange={(e) => setConfirmAllSilence(e.target.checked)}
                      className="[accent-color:var(--ffx-accent)]"
                    />
                    I understand this will remove the whole clip
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-overline uppercase text-tertiary">Cuts</div>
                    <div className="text-stat text-primary">{plan.cuts}</div>
                  </div>
                  <div>
                    <div className="text-overline uppercase text-tertiary">Time removed</div>
                    <div className="text-stat text-accent">{removedSec.toFixed(2)}s</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 pt-1 text-caption text-tertiary">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/60" /> Silence
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/60" /> Kept
                </span>
              </div>
            </div>
          )}

          {stage === 'config' ? (
            <Button variant="primary" size="comfortable" block icon={<Eye size={14} />} onClick={() => void runAnalysis()}>
              Generate Preview
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="comfortable"
                className="flex-[2]"
                icon={<Scissors size={14} />}
                disabled={!canApply && !(allSilence && confirmAllSilence)}
                onClick={handleApply}
              >
                Apply
              </Button>
            </div>
          )}
        </div>
      )}

      {busy && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent-dim bg-accent-wash">
              <Loader2 size={22} className="animate-spin text-accent" />
            </div>
            <p className="text-title text-primary">
              {stage === 'analyzing' && 'Analyzing audio'}
              {stage === 'detecting' && 'Detecting silence'}
              {stage === 'applying' && 'Applying edits'}
            </p>
          </div>
          {stage === 'analyzing' && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
          {stage !== 'applying' && (
            <Button variant="secondary" block onClick={cancel}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {stage === 'done' && stats && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
              <Check size={22} className="text-success" />
            </div>
            <p className="text-title text-primary">Silence stripped</p>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-hairline bg-surface-sunken p-3">
            <div>
              <div className="text-overline uppercase text-tertiary">Cuts</div>
              <div className="text-stat text-primary">{stats.cuts}</div>
            </div>
            <div>
              <div className="text-overline uppercase text-tertiary">Time saved</div>
              <div className="text-stat text-accent">{stats.removedSec.toFixed(2)}s</div>
            </div>
          </div>
          <Button variant="primary" size="comfortable" block onClick={close}>
            Done
          </Button>
        </div>
      )}

      {stage === 'error' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
              <AlertTriangle size={22} className="text-danger" />
            </div>
            <p className="max-w-sm text-body text-danger">{error}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={close}>
              Close
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => useSilenceStore.setState({ stage: 'config', error: null })}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
