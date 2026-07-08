import { useRef, useEffect, useState, useCallback } from 'react';
import { WebGPURenderer } from '../../../engine/renderer';
import { timelineEngine } from '../../../engine/timeline';
import { playbackController } from '../../../store/timeline';
import { useTimelineStore } from '../../../store/timeline';
import { useEditorStore } from '../../../store/editor';
import { usePreviewStore, getQualityScale, getMotionBlurSamples } from '../../../store/preview';
import { useRecoveryStore } from '../../../store/recovery';
import { editorRecovery } from '../../../engine/recovery';
import { Play, Pause, SkipBack, SkipForward, Square } from 'lucide-react';

export function ReviewViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);

  const composition = useEditorStore((s) => s.composition);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const play = useTimelineStore((s) => s.play);
  const pause = useTimelineStore((s) => s.pause);
  const stop = useTimelineStore((s) => s.stop);
  const seekTo = useTimelineStore((s) => s.seekTo);
  const scrubTo = useTimelineStore((s) => s.scrubTo);

  const [canvasStyle, setCanvasStyle] = useState({ width: 0, height: 0, left: 0, top: 0 });

  const compW = composition.settings.width;
  const compH = composition.settings.height;
  const durationFrames = composition.settings.durationFrames;
  const frameRate = composition.settings.frameRate;

  const previewQuality = usePreviewStore((s) => s.quality);
  const globalMotionBlur = usePreviewStore((s) => s.globalMotionBlur);
  const qualityScale = getQualityScale(previewQuality);
  const rendererEpoch = useRecoveryStore((s) => s.rendererEpoch);

  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width: cw, height: ch } = container.getBoundingClientRect();
    const padding = 16;
    const availW = cw - padding * 2;
    const availH = ch - padding * 2;
    if (availW <= 0 || availH <= 0) return;
    const scale = Math.min(availW / compW, availH / compH);
    const w = compW * scale;
    const h = compH * scale;
    const left = (cw - w) / 2;
    const top = (ch - h) / 2;
    setCanvasStyle({ width: w, height: h, left, top });
  }, [compW, compH]);

  useEffect(() => {
    updateCanvasSize();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateCanvasSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = Math.max(1, Math.round(compW * qualityScale));
    canvas.height = Math.max(1, Math.round(compH * qualityScale));

    const renderer = new WebGPURenderer();
    rendererRef.current = renderer;

    let disposed = false;
    const unsubscribeDeviceLost = renderer.onDeviceLost((reason) => {
      editorRecovery.handleDeviceLost(reason);
    });

    renderer.initialize(canvas).then((ok) => {
      if (disposed) return;
      if (!ok) return;
      editorRecovery.reportInitSuccess();
      playbackController.attachRenderer(renderer);
      playbackController.renderCurrentFrame();
    }).catch(() => {});

    return () => {
      disposed = true;
      unsubscribeDeviceLost();
      playbackController.detachRenderer();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [compW, compH, qualityScale, rendererEpoch]);

  useEffect(() => {
    timelineEngine.setComposition(composition);
    playbackController.setFrameRate(frameRate);
    playbackController.setDuration(durationFrames);
    playbackController.renderCurrentFrame();
  }, [composition, frameRate, durationFrames]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setMotionBlurSamples(globalMotionBlur ? getMotionBlurSamples(previewQuality) : 1);
    playbackController.renderCurrentFrame();
  }, [globalMotionBlur, previewQuality, rendererEpoch]);

  const formatTimecode = (frame: number) => {
    const totalSec = frame / frameRate;
    const min = Math.floor(totalSec / 60);
    const sec = Math.floor(totalSec % 60);
    const fr = Math.floor(frame % frameRate);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${fr.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        className="flex-1 bg-[#050709] overflow-hidden relative"
      >
        <canvas
          ref={canvasRef}
          className="absolute"
          style={{
            width: canvasStyle.width,
            height: canvasStyle.height,
            left: canvasStyle.left,
            top: canvasStyle.top,
            imageRendering: previewQuality !== 'full' ? 'pixelated' : 'auto',
          }}
        />
      </div>

      {/* Transport bar */}
      <div className="h-9 min-h-[36px] bg-[#0e1c32] border-t border-[#1a2a42] flex items-center px-3 gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { pause(); seekTo(0); }}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <SkipBack size={13} />
          </button>
          <button
            onClick={() => { if (isPlaying) pause(); else play(); }}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-[#f7b500]/10 text-[#f7b500] hover:bg-[#f7b500]/15 hover:text-[#ffc83d] transition-colors"
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
          </button>
          <button
            onClick={stop}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Square size={11} />
          </button>
          <button
            onClick={() => { pause(); seekTo(durationFrames - 1); }}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <SkipForward size={13} />
          </button>
        </div>

        <div className="flex-1 mx-2">
          <input
            type="range"
            min={0}
            max={durationFrames - 1}
            value={currentFrame}
            onChange={(e) => scrubTo(Number(e.target.value))}
            className="w-full h-1 appearance-none bg-[#1a2a42] rounded cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-3.5
              [&::-webkit-slider-thumb]:bg-[#f7b500] [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-[0_0_4px_rgba(247,181,0,0.4)]"
          />
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-[#f7b500]">{formatTimecode(currentFrame)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-500">{formatTimecode(durationFrames)}</span>
        </div>
      </div>
    </div>
  );
}
