import { Captions, Cpu, Zap, Download, Check, Loader2, AlertTriangle } from 'lucide-react';
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
import { Modal } from '../primitives/Modal';
import { Button } from '../primitives/Button';
import { cx } from '../primitives/cx';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/** Neutral value-step selection (gold stays reserved for the primary action). */
function optionCls(active: boolean): string {
  return cx(
    'rounded-md border transition-colors duration-micro',
    active
      ? 'bg-surface-4 border-hairline text-primary shadow-top-highlight'
      : 'bg-surface-2 border-transparent text-secondary hover:text-primary',
  );
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
    <Modal
      onClose={close}
      dismissable={!busy}
      size="lg"
      icon={<Captions size={16} />}
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">Generate Captions</span>
          {targetName && <span className="truncate text-caption text-tertiary">{targetName}</span>}
        </span>
      }
    >
      {stage === 'options' && (
        <div className="max-h-[65vh] space-y-4 overflow-y-auto">
          {/* Language */}
          <div>
            <label className="mb-2 block text-overline uppercase text-tertiary">Language</label>
            <select
              value={options.language ?? ''}
              onChange={(e) => setOption({ language: e.target.value === '' ? null : e.target.value })}
              className="w-full rounded-sm border border-hairline bg-surface-2 px-3 py-2 text-body text-secondary outline-none focus:border-accent"
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.label} value={l.code ?? ''}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Timestamp Mode */}
          <div>
            <label className="mb-2 block text-overline uppercase text-tertiary">Caption Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { id: 'phrase', label: 'Phrase Captions', desc: 'Natural sentence chunks' },
                { id: 'word', label: 'Word Captions', desc: 'Word-by-word timing' },
              ] as { id: TimestampMode; label: string; desc: string }[]).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOption({ timestampMode: m.id })}
                  className={cx('px-3 py-2 text-left', optionCls(options.timestampMode === m.id))}
                >
                  <div className="text-body-strong">{m.label}</div>
                  <div className="text-caption text-tertiary">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="mb-2 block text-overline uppercase text-tertiary">Caption Style</label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOption({ style: t.id })}
                  className={cx('px-3 py-1.5 text-caption', optionCls(options.style === t.id))}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Position */}
          <div>
            <label className="mb-2 block text-overline uppercase text-tertiary">Position</label>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOption({ position: p.id })}
                  className={cx('px-3 py-1.5 text-caption', optionCls(options.position === p.id))}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="mb-2 block text-overline uppercase text-tertiary">Model</label>
            <div className="grid grid-cols-2 gap-1.5">
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOption({ model: m.id })}
                  className={cx('px-3 py-2 text-left', optionCls(options.model === m.id))}
                >
                  <div className="text-body-strong">{m.label}</div>
                  <div className="text-caption text-tertiary">{m.description}</div>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-caption text-tertiary">
              First run downloads the model; later runs load instantly from cache. Runs offline on your device.
            </p>
          </div>

          <Button variant="primary" size="comfortable" block icon={<Captions size={14} />} onClick={() => void startGeneration()}>
            Generate Captions
          </Button>
        </div>
      )}

      {busy && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent-dim bg-accent-wash">
              {stage === 'downloading' ? (
                <Download size={22} className="text-accent" />
              ) : (
                <Loader2 size={22} className="animate-spin text-accent" />
              )}
            </div>
            <div>
              <p className="text-title text-primary">{statusMessage || 'Working'}</p>
              {backend && (
                <p className="mt-0.5 flex items-center justify-center gap-1 text-caption text-tertiary">
                  {backend === 'webgpu' ? <Zap size={10} /> : <Cpu size={10} />}
                  {backend === 'webgpu' ? 'GPU accelerated' : 'CPU (WebAssembly)'}
                </p>
              )}
            </div>
          </div>

          {stage === 'downloading' && download && (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent transition duration-150"
                  style={{ width: `${Math.round(download.progress)}%` }}
                />
              </div>
              <div className="flex justify-between text-caption text-tertiary">
                <span className="max-w-[60%] truncate">{download.file}</span>
                <span>{Math.round(download.progress)}%</span>
              </div>
            </div>
          )}

          {(stage === 'transcribing' || stage === 'loading-model' || stage === 'extracting') && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent-dim" />
            </div>
          )}

          <Button variant="secondary" block onClick={cancel}>
            Cancel
          </Button>
        </div>
      )}

      {stage === 'preview' && previewSegments && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-accent" />
              <span className="text-body-strong text-primary">
                {previewSegments.length} captions ready
              </span>
            </div>
            <span className="text-caption text-tertiary">
              {(processingTimeMs / 1000).toFixed(1)}s
              {backend && ` · ${backend === 'webgpu' ? 'GPU' : 'CPU'}`}
            </span>
          </div>

          <div className="max-h-64 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">
            {previewSegments.map((seg, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2">
                <span className="w-24 shrink-0 pt-0.5 font-mono text-caption text-tertiary">
                  {formatTime(seg.start)} → {formatTime(seg.end)}
                </span>
                <span className="text-body leading-tight text-secondary">{seg.text}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => useCaptionStore.setState({ stage: 'options', previewSegments: null })}
            >
              Back
            </Button>
            <Button variant="primary" size="comfortable" className="flex-[2]" icon={<Check size={14} />} onClick={handleAccept}>
              Add to Timeline
            </Button>
          </div>
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
              onClick={() => useCaptionStore.setState({ stage: 'options', error: null })}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
