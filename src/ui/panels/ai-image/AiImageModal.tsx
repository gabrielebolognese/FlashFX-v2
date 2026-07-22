import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Wand2, ZoomIn, Download, Plus, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { useAiImageStore, type AiImageOp } from '../../../store/aiImage';
import { useEditorStore } from '../../../store/editor';
import { useProjectStore } from '../../../project-system/hooks/useProjectStore';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { mediaAssetManager } from '../../../engine/media/assetManager';

type Status = 'idle' | 'downloading' | 'processing' | 'done' | 'error';

function opTitle(op: AiImageOp): string {
  return op === 'remove-bg' ? 'Remove Background' : 'Upscale (2×)';
}

/**
 * Shared modal for the two in-browser AI image ops (background removal via
 * @imgly, super-resolution via transformers.js). Auto-runs the chosen op on the
 * selected asset, previews before/after, then lets the user add the result to
 * the project (as a new asset placed on the canvas) or download it. Both models
 * run fully client-side; the first run downloads model weights (cached after).
 */
export function AiImageModal() {
  const assetId = useAiImageStore((s) => s.assetId);
  const operation = useAiImageStore((s) => s.operation);
  const close = useAiImageStore((s) => s.close);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const onRefresh = useMediaPoolStore((s) => s.onRefresh);

  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [backend, setBackend] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);

  const resultBlobRef = useRef<Blob | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const sourceUrl = assetId ? mediaAssetManager.getObjectUrl(assetId) : null;
  const assetName = (assetId && mediaAssetManager.getAsset(assetId)?.name?.replace(/\.[^.]+$/, '')) || 'image';

  const revokeResult = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    resultBlobRef.current = null;
  }, []);

  // Auto-run the operation whenever the modal opens (or a retry is requested).
  useEffect(() => {
    if (!assetId || !sourceUrl) return;
    let cancelled = false;
    revokeResult();
    setResultUrl(null);
    setError(null);
    setBackend(null);
    setProgress(0);
    setStatus('downloading');

    (async () => {
      try {
        let blob: Blob;
        if (operation === 'remove-bg') {
          const { removeBackground } = await import('@imgly/background-removal');
          blob = await removeBackground(sourceUrl, {
            progress: (key: string, current: number, total: number) => {
              if (cancelled) return;
              if (key.includes('fetch') || key.includes('download')) {
                setStatus('downloading');
                setProgress(total > 0 ? Math.round((current / total) * 100) : 0);
              } else {
                setStatus('processing');
              }
            },
          });
        } else {
          const resp = await fetch(sourceUrl);
          const srcBlob = await resp.blob();
          const { upscaleImage } = await import('../../../engine/upscale/upscaleClient');
          const res = await upscaleImage(srcBlob, {
            onBackend: (b) => { if (!cancelled) setBackend(b); },
            onDownload: (p) => { if (!cancelled) { setStatus('downloading'); setProgress(p); } },
            onProcessing: () => { if (!cancelled) setStatus('processing'); },
          });
          blob = res.blob;
        }

        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        resultBlobRef.current = blob;
        resultUrlRef.current = url;
        setResultUrl(url);
        setStatus('done');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Processing failed');
      }
    })();

    return () => { cancelled = true; };
  }, [assetId, operation, sourceUrl, runId, revokeResult]);

  // Revoke the result URL when the modal fully closes.
  useEffect(() => {
    if (!assetId) revokeResult();
  }, [assetId, revokeResult]);

  const handleAddToProject = useCallback(async () => {
    const blob = resultBlobRef.current;
    if (!blob || !activeProjectId) return;
    const suffix = operation === 'remove-bg' ? 'no-bg' : 'upscaled';
    const file = new File([blob], `${assetName}-${suffix}.png`, { type: 'image/png' });
    const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
    const cx = Math.round(useEditorStore.getState().composition.settings.width / 2);
    const cy = Math.round(useEditorStore.getState().composition.settings.height / 2);
    addImageFromAsset(newId, cx, cy);
    onRefresh?.();
    close();
  }, [activeProjectId, operation, assetName, addImageFromAsset, onRefresh, close]);

  const handleDownload = useCallback(() => {
    const url = resultUrlRef.current;
    if (!url) return;
    const suffix = operation === 'remove-bg' ? 'no-bg' : 'upscaled';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${assetName}-${suffix}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [operation, assetName]);

  if (!assetId) return null;

  const Icon = operation === 'remove-bg' ? Wand2 : ZoomIn;
  const isBusy = status === 'downloading' || status === 'processing';
  const checker =
    'conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%, #2a2a2a 0% 75%, #1e1e1e 0% 100%)';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !isBusy && close()}>
      <div
        className="w-[min(92vw,760px)] max-h-[88vh] overflow-auto bg-[#0d1526] border border-[#1c3155] rounded-xl shadow-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[#ffc83d]">
            <Icon size={16} />
            <span className="text-sm font-semibold">{opTitle(operation)}</span>
            {backend && <span className="text-[9px] text-slate-500 uppercase">· {backend}</span>}
          </div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={isBusy} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Before / after */}
        <div className="grid grid-cols-2 gap-2">
          <figure className="flex flex-col gap-1">
            <div className="aspect-video rounded-lg overflow-hidden flex items-center justify-center" style={{ background: checker }}>
              {sourceUrl && <img src={sourceUrl} alt="original" className="max-w-full max-h-full object-contain" />}
            </div>
            <figcaption className="text-[9px] text-slate-500 text-center">Original</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            <div className="aspect-video rounded-lg overflow-hidden flex items-center justify-center relative" style={{ background: checker }}>
              {resultUrl ? (
                <img src={resultUrl} alt="result" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  {status === 'error' ? <AlertCircle size={20} className="text-red-400" /> : <Loader2 size={20} className="animate-spin" />}
                  <span className="text-[10px]">
                    {status === 'downloading' ? `Downloading model… ${progress}%` : status === 'processing' ? 'Processing…' : status === 'error' ? 'Failed' : ''}
                  </span>
                </div>
              )}
            </div>
            <figcaption className="text-[9px] text-slate-500 text-center">Result</figcaption>
          </figure>
        </div>

        {isBusy && (
          <div className="mt-3 h-1.5 rounded-full bg-[#12203a] overflow-hidden">
            <div className="h-full bg-[#f7b500] transition-all duration-300" style={{ width: `${status === 'processing' ? 100 : progress}%` }} />
          </div>
        )}

        {status === 'error' && (
          <div className="mt-3 text-[11px] text-red-400 flex items-center gap-2">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center justify-end gap-2">
          {status === 'error' && (
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] bg-[#16294a] hover:bg-[#1c3155] text-slate-200" onClick={() => setRunId((n) => n + 1)}>
              <RotateCcw size={13} /> Retry
            </button>
          )}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] bg-[#16294a] hover:bg-[#1c3155] text-slate-200 disabled:opacity-40"
            onClick={handleDownload}
            disabled={status !== 'done'}
          >
            <Download size={13} /> Download
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] bg-[#f7b500]/15 hover:bg-[#f7b500]/25 border border-[#f7b500]/30 text-[#ffc83d] disabled:opacity-40"
            onClick={handleAddToProject}
            disabled={status !== 'done' || !activeProjectId}
          >
            <Plus size={13} /> Add to Project
          </button>
        </div>
      </div>
    </div>
  );
}
