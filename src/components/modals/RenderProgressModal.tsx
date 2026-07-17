import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, Film, Check, Loader2, Download, XCircle } from 'lucide-react';
import { RenderProgress } from '../../export/DeterministicRenderer';

interface RenderProgressModalProps {
  isOpen: boolean;
  progress: RenderProgress;
  onCancel: () => void;
  onClose: () => void;
  onDownload?: () => void;
  renderBlob?: Blob | null;
  sequenceName?: string;
  sequenceDuration?: number;
}

const RenderProgressModal: React.FC<RenderProgressModalProps> = ({
  isOpen,
  progress,
  onCancel,
  onClose,
  onDownload,
  renderBlob,
  sequenceName = 'Animation',
  sequenceDuration = 0,
}) => {
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [videoMetadata, setVideoMetadata] = useState<{ duration: number; speedUpFactor: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (progress.status === 'rendering' || progress.status === 'encoding') {
        e.preventDefault();
        e.returnValue = 'Rendering in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, progress.status]);

  useEffect(() => {
    if (renderBlob && progress.status === 'completed' && sequenceDuration > 0) {
      const videoUrl = URL.createObjectURL(renderBlob);
      const videoElement = document.createElement('video');

      videoElement.onloadedmetadata = () => {
        const videoDuration = videoElement.duration;
        const speedUpFactor = videoDuration / sequenceDuration;
        setVideoMetadata({ duration: videoDuration, speedUpFactor });
        URL.revokeObjectURL(videoUrl);
      };

      videoElement.onerror = () => {
        URL.revokeObjectURL(videoUrl);
      };

      videoElement.src = videoUrl;
    }
  }, [renderBlob, progress.status, sequenceDuration]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'preloading':
      case 'rendering':
        return <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />;
      case 'encoding':
        return <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />;
      case 'completed':
        return <Check className="w-8 h-8 text-green-400" />;
      case 'error':
        return <XCircle className="w-8 h-8 text-red-400" />;
      default:
        return <Film className="w-8 h-8 text-slate-400" />;
    }
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case 'completed':
        return 'from-green-500 to-emerald-500';
      case 'error':
        return 'from-red-500 to-rose-500';
      case 'encoding':
        return 'from-blue-500 to-cyan-500';
      default:
        return 'from-amber-500 to-yellow-500';
    }
  };

  const canCancel = progress.status === 'rendering' || progress.status === 'preloading';
  const canClose = progress.status === 'completed' || progress.status === 'error' || progress.status === 'idle';
  const canDownload = progress.status === 'completed' && renderBlob;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-3 rounded-xl bg-gradient-to-r ${getStatusColor()}`}>
                {getStatusIcon()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {progress.status === 'completed' ? 'Render Complete' :
                   progress.status === 'error' ? 'Render Failed' :
                   'Rendering Video'}
                </h2>
                <p className="text-sm text-slate-400">{sequenceName}</p>
              </div>
            </div>
            {canClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {progress.status === 'encoding' && (
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-400 font-medium">Encoding H.264 MP4</p>
                <p className="text-xs text-blue-400/80 mt-1">
                  All captured frames are being encoded into an MP4 video with H.264 compression. This may take a few minutes depending on resolution and duration.
                </p>
              </div>
            </div>
          )}

          {(progress.status === 'rendering' || progress.status === 'preloading') && (
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-400 font-medium">Stay on this page</p>
                <p className="text-xs text-amber-400/80 mt-1">
                  Leaving or closing this page will cancel the render.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{progress.message}</span>
              <span className="text-white font-mono">{progress.percentage}%</span>
            </div>

            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${getStatusColor()} transition-all duration-300 ease-out`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="text-center">
                <div className="text-xs text-slate-500">Frames</div>
                <div className="text-sm text-white font-mono">
                  {progress.currentFrame} / {progress.totalFrames}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Progress</div>
                <div className="text-sm text-white font-mono">
                  {progress.percentage}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Remaining</div>
                <div className="text-sm text-white font-mono">
                  {progress.estimatedTimeRemaining > 0
                    ? formatTime(progress.estimatedTimeRemaining)
                    : '--'}
                </div>
              </div>
            </div>
          </div>

          {progress.status === 'completed' && (
            <div className="space-y-3">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-sm text-green-400 font-medium">Render successful!</p>
                    <p className="text-xs text-green-400/80 mt-0.5">
                      {renderBlob && `File size: ${(renderBlob.size / 1024 / 1024).toFixed(2)} MB`}
                    </p>
                  </div>
                </div>
              </div>

              {videoMetadata && videoMetadata.speedUpFactor > 1.1 && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Film className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-400 font-medium">Video Speed Adjustment Required</p>
                      <p className="text-xs text-blue-400/80 mt-1">
                        The exported video is {videoMetadata.duration.toFixed(2)}s long but your sequence is {sequenceDuration.toFixed(2)}s.
                        Speed up the video to <span className="font-bold">{(videoMetadata.speedUpFactor * 100).toFixed(0)}%</span> (or {videoMetadata.speedUpFactor.toFixed(2)}x)
                        in your video editor to match the original timing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {progress.status === 'error' && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-400" />
                <div>
                  <p className="text-sm text-red-400 font-medium">Render failed</p>
                  <p className="text-xs text-red-400/80 mt-0.5">
                    {progress.message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-700 flex items-center justify-end space-x-3">
          {canCancel && (
            <button
              onClick={onCancel}
              className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          {canDownload && onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all"
            >
              <Download className="w-4 h-4" />
              Download Video
            </button>
          )}
          {canClose && !canDownload && (
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RenderProgressModal;
