import { useRef, useEffect, useState, useCallback } from 'react';
import { WebGPURenderer } from '../../engine/renderer';
import { timelineEngine } from '../../engine/timeline';
import { playbackController } from '../../store/timeline';
import { useTimelineStore } from '../../store/timeline';
import { useEditorStore } from '../../store/editor';
import { useGridStore } from '../../store/grid';
import { usePreviewStore, getQualityScale, getMotionBlurSamples } from '../../store/preview';
import { useViewportNavStore } from '../../store/viewportNav';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import { TransformOverlay } from './TransformOverlay';
import { MotionPathOverlay } from './MotionPathOverlay';
import { MaskOverlay } from './MaskOverlay';
import { GridOverlay } from './GridOverlay';
import { ShapeCreationOverlay } from './ShapeCreationOverlay';
import { PenToolOverlay } from './PenToolOverlay';
import { MultiFieldWarning } from './MultiFieldWarning';
import { useShapeToolStore, isShapeTool } from '../../store/shapeTool';
import { useRecoveryStore } from '../../store/recovery';
import { editorRecovery } from '../../engine/recovery';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useContextMenu } from '../context-menu';
import { buildCanvasMenu } from '../context-menu/menuDefinitions';

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { show: showContextMenu } = useContextMenu();
  const rendererRef = useRef<WebGPURenderer | null>(null);

  const composition = useEditorStore((s) => s.composition);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const addVideoFromAsset = useEditorStore((s) => s.addVideoFromAsset);
  const addImage = useEditorStore((s) => s.addImage);
  const addVideo = useEditorStore((s) => s.addVideo);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const addGuideline = useGridStore((s) => s.addGuideline);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const zoom = useViewportNavStore((s) => s.zoom);
  const panX = useViewportNavStore((s) => s.panX);
  const panY = useViewportNavStore((s) => s.panY);
  const isPanning = useViewportNavStore((s) => s.isPanning);
  const zoomAtPoint = useViewportNavStore((s) => s.zoomAtPoint);
  const pan = useViewportNavStore((s) => s.pan);
  const setIsPanning = useViewportNavStore((s) => s.setIsPanning);
  const resetView = useViewportNavStore((s) => s.resetView);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [dragOver, setDragOver] = useState(false);

  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  const compW = composition.settings.width;
  const compH = composition.settings.height;

  const previewQuality = usePreviewStore((s) => s.quality);
  const transparencyGrid = usePreviewStore((s) => s.transparencyGrid);
  const pixelPreview = usePreviewStore((s) => s.pixelPreview);
  const globalMotionBlur = usePreviewStore((s) => s.globalMotionBlur);
  const qualityScale = getQualityScale(previewQuality);

  const rendererEpoch = useRecoveryStore((s) => s.rendererEpoch);

  useEffect(() => {
    editorRecovery.startMonitor();
    return () => editorRecovery.stopMonitor();
  }, []);

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const { width, height } = container.getBoundingClientRect();
      setContainerSize({ width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Compute canvas display geometry with viewport nav applied
  const getCanvasGeometry = useCallback(() => {
    const { width: cw, height: ch } = containerSize;
    if (cw <= 0 || ch <= 0) return { width: 0, height: 0, left: 0, top: 0 };

    const padding = 24;
    const availW = cw - padding * 2;
    const availH = ch - padding * 2;
    if (availW <= 0 || availH <= 0) return { width: 0, height: 0, left: 0, top: 0 };

    const baseScale = Math.min(availW / compW, availH / compH);
    const effectiveScale = baseScale * zoom;

    const w = compW * effectiveScale;
    const h = compH * effectiveScale;

    const left = (cw - w) / 2 + panX;
    const top = (ch - h) / 2 + panY;

    return { width: w, height: h, left, top };
  }, [containerSize, compW, compH, zoom, panX, panY]);

  const canvasStyle = getCanvasGeometry();

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
      if (!ok) {
        console.error('WebGPU init failed');
        editorRecovery.reportInitFailure('WebGPU failed to initialize (no adapter/device or unsupported browser)');
        return;
      }
      editorRecovery.reportInitSuccess();
      playbackController.attachRenderer(renderer);
      playbackController.renderCurrentFrame();
    }).catch((err) => {
      if (disposed) return;
      editorRecovery.reportInitFailure(
        err instanceof Error ? err.message : 'WebGPU initialization threw an error',
      );
    });

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
    playbackController.setFrameRate(composition.settings.frameRate);
    playbackController.setDuration(composition.settings.durationFrames);
    playbackController.renderCurrentFrame();
  }, [composition]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setMotionBlurSamples(globalMotionBlur ? getMotionBlurSamples(previewQuality) : 1);
    playbackController.renderCurrentFrame();
  }, [globalMotionBlur, previewQuality, rendererEpoch]);

  // Wheel zoom - cursor-centered (native listener for passive:false)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      useViewportNavStore.getState().zoomAtPoint(e.deltaY, cursorX, cursorY, rect.width, rect.height);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Middle mouse pan
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      panStartRef.current = { x: e.clientX, y: e.clientY };
      setIsPanning(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [setIsPanning]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    pan(dx, dy);
  }, [pan]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 && panStartRef.current) {
      panStartRef.current = null;
      setIsPanning(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, [setIsPanning]);

  // Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-mediapool-asset') || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // Handle media pool asset drag
    const raw = e.dataTransfer.getData('application/x-mediapool-asset');
    if (raw) {
      try {
        const data = JSON.parse(raw) as { id: string; type: string; name: string; width: number; height: number };

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dropScreenX = e.clientX - rect.left;
        const dropScreenY = e.clientY - rect.top;

        const { width: cw, height: ch, left, top } = canvasStyle;
        const relX = dropScreenX - left;
        const relY = dropScreenY - top;

        let compX: number;
        let compY: number;

        if (relX >= 0 && relX <= cw && relY >= 0 && relY <= ch) {
          compX = (relX / cw) * compW;
          compY = (relY / ch) * compH;
        } else {
          compX = compW / 2;
          compY = compH / 2;
        }

        if (data.type === 'image') {
          addImageFromAsset(data.id, compX, compY);
        } else if (data.type === 'video') {
          addVideoFromAsset(data.id, compX, compY);
        }
      } catch {}
      return;
    }

    // Handle native file drops from desktop
    const files = e.dataTransfer.files;
    if (!files.length || !activeProjectId) return;

    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        addImage(file, activeProjectId);
      } else if (file.type.startsWith('video/')) {
        addVideo(file, activeProjectId);
      }
    }
  }, [canvasStyle, compW, compH, addImageFromAsset, addVideoFromAsset, addImage, addVideo, activeProjectId]);

  const activeTool = useShapeToolStore((s) => s.activeTool);
  const shapeToolActive = isShapeTool(activeTool);

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    width: canvasStyle.width,
    height: canvasStyle.height,
    left: canvasStyle.left,
    top: canvasStyle.top,
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      ref={containerRef}
      className={`flex-1 bg-[#1a1a1a] overflow-hidden relative`}
      style={{ cursor: isPanning ? 'grabbing' : shapeToolActive ? 'crosshair' : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onAuxClick={(e) => e.preventDefault()}
      onContextMenu={(e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, buildCanvasMenu()); }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className="absolute"
        style={{
          width: canvasStyle.width,
          height: canvasStyle.height,
          left: canvasStyle.left,
          top: canvasStyle.top,
          imageRendering: pixelPreview || previewQuality !== 'full' ? 'pixelated' : 'auto',
          backgroundImage: transparencyGrid
            ? 'conic-gradient(#222 0% 25%, #1a1a1a 0% 50%, #222 0% 75%, #1a1a1a 0% 100%)'
            : undefined,
          backgroundColor: transparencyGrid ? undefined : '#000000',
          backgroundSize: transparencyGrid ? '16px 16px' : undefined,
        }}
      />
      <TransformOverlay style={overlayStyle} />
      <MotionPathOverlay style={overlayStyle} />
      <MaskOverlay style={overlayStyle} />
      <GridOverlay
        canvasWidth={compW}
        canvasHeight={compH}
        scaleX={canvasStyle.width / compW}
        scaleY={canvasStyle.height / compH}
        style={overlayStyle}
      />
      <ShapeCreationOverlay compW={compW} compH={compH} style={overlayStyle} />
      <PenToolOverlay compW={compW} compH={compH} style={overlayStyle} />

      {/* Field overlap warning */}
      <div className="absolute top-2 left-2 right-2 z-10 pointer-events-auto">
        <MultiFieldWarning />
      </div>
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-[#0a1628]/80 backdrop-blur-sm border-2 border-dashed border-[#f7b500] rounded-lg m-2">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-[#f7b500]/10 border border-[#f7b500]/30 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#f7b500]">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <span className="text-lg font-semibold text-[#f7b500]">Drop to Canvas</span>
            <span className="text-xs text-slate-400">Release to add media to the scene</span>
          </div>
        </div>
      )}

      {/* Top ruler */}
      <div
        className="absolute h-3 cursor-crosshair bg-[#0e1c32]/60 hover:bg-cyan-900/20 transition-colors"
        style={{
          left: canvasStyle.left,
          top: canvasStyle.top - 14,
          width: canvasStyle.width,
        }}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / (canvasStyle.width / compW);
          addGuideline('vertical', Math.round(relX));
        }}
        title="Double-click to add vertical guide"
      />

      {/* Left ruler */}
      <div
        className="absolute w-3 cursor-crosshair bg-[#0e1c32]/60 hover:bg-cyan-900/20 transition-colors"
        style={{
          left: canvasStyle.left - 14,
          top: canvasStyle.top,
          height: canvasStyle.height,
        }}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relY = (e.clientY - rect.top) / (canvasStyle.height / compH);
          addGuideline('horizontal', Math.round(relY));
        }}
        title="Double-click to add horizontal guide"
      />

      {/* Zoom controls */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 pointer-events-auto">
        <button
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) zoomAtPoint(100, rect.width / 2, rect.height / 2, rect.width, rect.height);
          }}
          className="p-1 rounded bg-[#0e1c32]/80 border border-[#1c3155]/50 text-slate-400 hover:text-slate-200 hover:bg-[#16294a] transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={12} />
        </button>
        <button
          onClick={resetView}
          className="px-1.5 py-0.5 rounded bg-[#0e1c32]/80 border border-[#1c3155]/50 text-[10px] font-mono text-slate-400 hover:text-slate-200 hover:bg-[#16294a] transition-colors min-w-[40px] text-center"
          title="Reset view (fit to screen)"
        >
          {zoomPercent}%
        </button>
        <button
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) zoomAtPoint(-100, rect.width / 2, rect.height / 2, rect.width, rect.height);
          }}
          className="p-1 rounded bg-[#0e1c32]/80 border border-[#1c3155]/50 text-slate-400 hover:text-slate-200 hover:bg-[#16294a] transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={12} />
        </button>
        <button
          onClick={resetView}
          className="p-1 rounded bg-[#0e1c32]/80 border border-[#1c3155]/50 text-slate-400 hover:text-slate-200 hover:bg-[#16294a] transition-colors"
          title="Fit to screen"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Status bar */}
      <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 font-mono pointer-events-none">
        {compW}x{compH} | {composition.settings.frameRate}fps | Frame {currentFrame}/{composition.settings.durationFrames}
        {previewQuality !== 'full' && (
          <span className="ml-2 text-amber-400">Preview: {Math.round(qualityScale * 100)}%</span>
        )}
      </div>

      {shapeToolActive && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-[10px] font-medium text-yellow-400 pointer-events-none flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          {activeTool === 'rectangle' && 'Rectangle Tool'}
          {activeTool === 'circle' && 'Ellipse Tool'}
          {activeTool === 'star' && 'Star Tool'}
          {activeTool === 'polygon' && 'Polygon Tool'}
          <span className="text-slate-500 ml-1">-- click & drag to create, Esc to cancel</span>
        </div>
      )}
    </div>
  );
}
