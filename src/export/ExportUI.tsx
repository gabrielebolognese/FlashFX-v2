import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, X, AlertCircle, CheckCircle2, Loader2, Layers, Film } from 'lucide-react';
import { ExportManager, ExportConfig, ExportProgress, ExportMode } from './ExportManager';
import { MP4ExportPipeline, MP4ExportConfig, MP4ExportProgress } from './MP4ExportPipeline';
import { DesignElement } from '../types/design';
import { BackgroundConfig } from '../types/background';
import { ElementAnimation } from '../animation-engine/types';
import RenderProgressModal from '../components/modals/RenderProgressModal';

interface ExportUIProps {
  isOpen: boolean;
  onClose: () => void;
  elements: DesignElement[];
  selectedElements: string[];
  projectName: string;
  canvasWidth: number;
  canvasHeight: number;
  background?: BackgroundConfig;
  projectCanvasWidth: number;
  projectCanvasHeight: number;
  animationDuration?: number;
  animationFps?: number;
  animations?: Record<string, ElementAnimation>;
  sequenceName?: string;
  hasActiveSequence?: boolean;
  onSaveProject?: () => void;
}

const ExportUI: React.FC<ExportUIProps> = ({
  isOpen,
  onClose,
  elements,
  selectedElements,
  projectName,
  canvasWidth,
  canvasHeight,
  background,
  projectCanvasWidth,
  projectCanvasHeight,
  animationDuration = 5,
  animationFps = 30,
  animations = {},
  sequenceName = 'Animation',
  hasActiveSequence = false,
  onSaveProject,
}) => {
  const [exportManager] = useState(() => new ExportManager());
  const mp4PipelineRef = useRef<MP4ExportPipeline | null>(null);

  const [progress, setProgress] = useState<ExportProgress>({
    current: 0,
    total: 0,
    status: 'idle',
    message: ''
  });

  const [mp4Progress, setMp4Progress] = useState<MP4ExportProgress>({
    status: 'idle',
    currentFrame: 0,
    totalFrames: 0,
    percentage: 0,
    estimatedTimeRemaining: 0,
    message: '',
    startTime: null,
  });

  const [showRenderModal, setShowRenderModal] = useState(false);
  const [renderBlob, setRenderBlob] = useState<Blob | null>(null);

  const [exportMode, setExportMode] = useState<ExportMode | null>(null);
  const [customResolution, setCustomResolution] = useState({
    width: canvasWidth,
    height: canvasHeight
  });
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [canvasSizeWarning, setCanvasSizeWarning] = useState<boolean>(false);

  useEffect(() => {
    exportManager.setProgressCallback(setProgress);
  }, [exportManager]);

  useEffect(() => {
    const sizeChanged =
      customResolution.width !== projectCanvasWidth ||
      customResolution.height !== projectCanvasHeight;
    setCanvasSizeWarning(sizeChanged);
  }, [customResolution, projectCanvasWidth, projectCanvasHeight]);

  const visibleElements = elements.filter(el => el.visible);

  const handleExport = async (mode: ExportMode) => {
    setValidationError(null);

    if (format === 'jpeg') {
      const hasBackground = background &&
        background.type === 'solid' &&
        background.color &&
        background.color !== 'transparent';

      if (!hasBackground) {
        setValidationError("JPEG can't have transparent background");
        return;
      }
    }

    setExportMode(mode);

    const config: ExportConfig = {
      mode,
      projectName: projectName || 'FlashFX_Project',
      canvasWidth,
      canvasHeight,
      customWidth: customResolution.width,
      customHeight: customResolution.height,
      format,
      quality: 0.95
    };

    try {
      if (mode === 'canvas') {
        await exportManager.exportCanvas(config, elements);
      } else if (mode === 'stacked') {
        await exportManager.exportShapesStacked(config, elements);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleMP4Render = useCallback(async () => {
    if (!hasActiveSequence) {
      setValidationError('No active sequence. Create a sequence first.');
      return;
    }

    setRenderBlob(null);
    setShowRenderModal(true);
    setMp4Progress({
      status: 'loading',
      currentFrame: 0,
      totalFrames: Math.ceil(animationDuration * animationFps),
      percentage: 0,
      estimatedTimeRemaining: 0,
      message: 'Initializing...',
      startTime: null,
    });

    const pipeline = new MP4ExportPipeline();
    mp4PipelineRef.current = pipeline;

    const mp4Config: MP4ExportConfig = {
      fps: animationFps,
      duration: animationDuration,
      width: customResolution.width,
      height: customResolution.height,
      projectName: projectName || 'FlashFX_Project',
    };

    try {
      const blob = await pipeline.export(
        mp4Config,
        elements,
        animations,
        background,
        (p) => setMp4Progress(p)
      );

      setRenderBlob(blob);
      setMp4Progress(prev => ({
        ...prev,
        status: 'completed',
        percentage: 100,
        message: 'Export complete!',
      }));
    } catch (error) {
      if ((error as Error).message !== 'Export cancelled') {
        console.error('MP4 render failed:', error);
      }
      setMp4Progress(prev => ({
        ...prev,
        status: 'error',
        message: error instanceof Error ? error.message : 'Render failed',
      }));
    } finally {
      mp4PipelineRef.current = null;
    }
  }, [hasActiveSequence, animationFps, animationDuration, customResolution, projectName, elements, animations, background]);

  const handleCancelRender = useCallback(() => {
    mp4PipelineRef.current?.abort();
    setMp4Progress(prev => ({
      ...prev,
      status: 'error',
      message: 'Export cancelled by user',
    }));
  }, []);

  const handleDownloadRender = useCallback(() => {
    if (!renderBlob) return;
    MP4ExportPipeline.downloadBlob(
      renderBlob,
      `${sequenceName || projectName || 'animation'}.mp4`
    );
  }, [renderBlob, sequenceName, projectName]);

  const handleCloseRenderModal = useCallback(() => {
    setShowRenderModal(false);
    setMp4Progress({
      status: 'idle',
      currentFrame: 0,
      totalFrames: 0,
      percentage: 0,
      estimatedTimeRemaining: 0,
      message: '',
      startTime: null,
    });
    setRenderBlob(null);
  }, []);

  const handleClose = () => {
    if (progress.status !== 'exporting') {
      setProgress({
        current: 0,
        total: 0,
        status: 'idle',
        message: ''
      });
      setExportMode(null);
      onClose();
    }
  };

  const handleRetry = () => {
    if (exportMode) {
      handleExport(exportMode);
    }
  };

  const estimatedTime = exportManager.estimateTime(
    exportMode === 'zip' || exportMode === 'stacked' ? visibleElements.length :
    exportMode === 'selection' ? elements.filter(el => selectedElements.includes(el.id)).length : 1
  );

  if (!isOpen) return null;

  const renderProgress = {
    status: mp4Progress.status === 'loading' ? 'preloading' as const :
            mp4Progress.status === 'capturing' ? 'rendering' as const :
            mp4Progress.status as 'idle' | 'preloading' | 'rendering' | 'encoding' | 'completed' | 'error',
    currentFrame: mp4Progress.currentFrame,
    totalFrames: mp4Progress.totalFrames,
    percentage: mp4Progress.percentage,
    estimatedTimeRemaining: mp4Progress.estimatedTimeRemaining,
    message: mp4Progress.message,
    startTime: mp4Progress.startTime,
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-2xl mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500">
                <Download className="w-6 h-6 text-gray-900" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Export Design</h2>
                <p className="text-sm text-gray-400">Choose export format for your design</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={progress.status === 'exporting'}
              className={`p-2 rounded-lg transition-colors ${
                progress.status === 'exporting'
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'hover:bg-gray-700 text-gray-400'
              }`}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {progress.status === 'idle' && (
            <>
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">
                      Format
                    </label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                    >
                      <option value="png">PNG (Transparent)</option>
                      <option value="jpeg">JPEG</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">
                      Resolution
                    </label>
                    <select
                      onChange={(e) => {
                        const [w, h] = e.target.value.split('x').map(Number);
                        setCustomResolution({ width: w, height: h });
                      }}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                    >
                      <option value={`${canvasWidth}x${canvasHeight}`}>
                        Canvas ({canvasWidth}x{canvasHeight})
                      </option>
                      <option value="1920x1080">Full HD (1920x1080)</option>
                      <option value="3840x2160">4K (3840x2160)</option>
                      <option value="7680x4320">8K (7680x4320)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">
                      Custom Width
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="16000"
                      value={customResolution.width}
                      onChange={(e) => setCustomResolution(prev => ({ ...prev, width: Number(e.target.value) }))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">
                      Custom Height
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="16000"
                      value={customResolution.height}
                      onChange={(e) => setCustomResolution(prev => ({ ...prev, height: Number(e.target.value) }))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleExport('canvas')}
                    className="flex flex-col items-center justify-center px-4 py-5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold hover:from-blue-500 hover:to-blue-400 transition-all duration-200 transform hover:scale-[1.02]"
                  >
                    <Download className="w-8 h-8 mb-2" />
                    <div className="text-sm">Export Design</div>
                    <div className="text-xs opacity-80 mt-1 text-center">
                      Single image
                    </div>
                  </button>

                  <button
                    onClick={handleMP4Render}
                    disabled={!hasActiveSequence}
                    className={`flex flex-col items-center justify-center px-4 py-5 rounded-xl font-semibold transition-all duration-200 ${
                      hasActiveSequence
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-900 hover:from-amber-400 hover:to-yellow-400 transform hover:scale-[1.02]'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <Film className="w-8 h-8 mb-2" />
                    <div className="text-sm">Render MP4</div>
                    <div className="text-xs opacity-80 mt-1 text-center">
                      {hasActiveSequence ? `H.264 ${animationFps}FPS @ ${animationDuration}s` : 'No sequence'}
                    </div>
                  </button>
                </div>

                {onSaveProject && (
                  <button
                    onClick={onSaveProject}
                    data-tutorial-target="download-button"
                    className="w-full flex flex-col items-center justify-center px-4 py-4 rounded-xl font-semibold transition-all duration-200 bg-gradient-to-r from-teal-600 to-teal-500 text-white hover:from-teal-500 hover:to-teal-400 transform hover:scale-[1.02]"
                  >
                    <Download className="w-6 h-6 mb-2" />
                    <div className="text-sm">Download Project</div>
                    <div className="text-xs opacity-70">Save project file to computer</div>
                  </button>
                )}

                {hasActiveSequence && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-amber-400 font-medium">
                        Sequence: {sequenceName}
                      </span>
                      <span className="text-xs text-amber-400/70">
                        ({Math.ceil(animationDuration * animationFps)} frames)
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => handleExport('stacked')}
                  disabled={visibleElements.length === 0}
                  className={`w-full flex flex-col items-center justify-center px-4 py-4 rounded-xl font-semibold transition-all duration-200 ${
                    visibleElements.length > 0
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 transform hover:scale-[1.02]'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Layers className="w-6 h-6 mb-2" />
                  <div className="text-sm">Export Layers (Stacked)</div>
                  <div className="text-xs opacity-70">({visibleElements.length} layers)</div>
                </button>
              </div>

              <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-400 leading-relaxed">
                  <strong>Export Info:</strong> Export Design captures everything visible on the canvas.
                  Render MP4 produces an H.264 encoded video file compatible with all browsers and devices.
                  All exports use high quality settings.
                </p>
              </div>

              {validationError && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-400">Validation Error</p>
                      <p className="text-xs text-red-400/80 mt-1">{validationError}</p>
                    </div>
                  </div>
                </div>
              )}

              {canvasSizeWarning && !validationError && (
                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-400">Canvas Size Changed</p>
                      <p className="text-xs text-yellow-400/80 mt-1">
                        Canvas Size changed after project creation WILL modify how the design is viewed, please make sure that you know what you're doing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {progress.status === 'exporting' && (
            <div className="py-8">
              <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                  <Loader2 className="w-16 h-16 text-yellow-400 animate-spin" />
                </div>

                <div className="text-center space-y-2">
                  <h3 className="text-xl font-semibold text-white">
                    {progress.message}
                  </h3>
                  <p className="text-gray-400">
                    {progress.current}/{progress.total} shapes exported
                  </p>
                </div>

                <div className="w-full max-w-md">
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-300"
                      style={{
                        width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Estimated time: ~{estimatedTime}s
                  </p>
                </div>

                <p className="text-sm text-gray-500">
                  Please wait while your export is being prepared...
                </p>
              </div>
            </div>
          )}

          {progress.status === 'completed' && (
            <div className="py-8">
              <div className="flex flex-col items-center space-y-6">
                <div className="p-4 rounded-full bg-green-500/20">
                  <CheckCircle2 className="w-16 h-16 text-green-400" />
                </div>

                <div className="text-center space-y-2">
                  <h3 className="text-xl font-semibold text-white">
                    Export Successful!
                  </h3>
                  <p className="text-gray-400">
                    {progress.message}
                  </p>
                </div>

                <button
                  onClick={handleClose}
                  className="px-6 py-3 rounded-lg bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-semibold hover:from-yellow-300 hover:to-orange-400 transition-all duration-200"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {progress.status === 'error' && (
            <div className="py-8">
              <div className="flex flex-col items-center space-y-6">
                <div className="p-4 rounded-full bg-red-500/20">
                  <AlertCircle className="w-16 h-16 text-red-400" />
                </div>

                <div className="text-center space-y-2">
                  <h3 className="text-xl font-semibold text-white">
                    Export Failed
                  </h3>
                  <p className="text-gray-400">
                    {progress.message}
                  </p>
                  {progress.error && (
                    <p className="text-sm text-red-400 font-mono bg-red-500/10 px-4 py-2 rounded-lg">
                      {progress.error}
                    </p>
                  )}
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={handleRetry}
                    className="px-6 py-3 rounded-lg bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-semibold hover:from-yellow-300 hover:to-orange-400 transition-all duration-200"
                  >
                    Retry
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-6 py-3 rounded-lg bg-gray-700 text-white font-semibold hover:bg-gray-600 transition-all duration-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <RenderProgressModal
        isOpen={showRenderModal}
        progress={renderProgress}
        onCancel={handleCancelRender}
        onClose={handleCloseRenderModal}
        onDownload={handleDownloadRender}
        renderBlob={renderBlob}
        sequenceName={sequenceName}
        sequenceDuration={animationDuration}
      />
    </div>
  );
};

export default ExportUI;
