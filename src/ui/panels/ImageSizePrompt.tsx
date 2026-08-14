import { Maximize2, X, ImageOff } from 'lucide-react';
import { useImageSizePromptStore } from '../../store/imageSizePrompt';
import { useEditorStore } from '../../store/editor';

// Non-modal banner shown after importing an image that's larger than the canvas. It doesn't block the
// editor — the user can ignore it — and offers to resize the image to fit or keep it at its size.
export function ImageSizePrompt() {
  const prompt = useImageSizePromptStore((s) => s.prompt);
  const dismiss = useImageSizePromptStore((s) => s.dismiss);
  const fitLayerToCanvas = useEditorStore((s) => s.fitLayerToCanvas);

  if (!prompt) return null;

  const { layerId, imageWidth, imageHeight, canvasWidth, canvasHeight } = prompt;

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-canvas-banner pointer-events-auto max-w-[92%]">
      <div className="flex items-center gap-3 rounded-lg border border-accent-dim bg-surface-2 px-3 py-2 shadow-overlay">
        <ImageOff size={16} className="text-accent flex-shrink-0" />
        <div className="text-[11px] leading-tight text-slate-300 min-w-0">
          <div className="font-semibold text-slate-100">This image is larger than the canvas</div>
          <div className="text-slate-400">
            {imageWidth}×{imageHeight}px vs {canvasWidth}×{canvasHeight}px canvas
          </div>
        </div>
        <button
          onClick={() => { fitLayerToCanvas(layerId); dismiss(); }}
          className="flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-accent hover:bg-accent-hover text-on-accent text-[11px] font-semibold transition-colors"
        >
          <Maximize2 size={12} /> Resize to fit
        </button>
        <button
          onClick={dismiss}
          className="flex-shrink-0 h-7 px-2.5 rounded-md bg-surface-4 hover:bg-surface-5 text-slate-200 text-[11px] font-medium transition-colors"
        >
          Keep original
        </button>
        <button onClick={dismiss} title="Dismiss" className="flex-shrink-0 p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
