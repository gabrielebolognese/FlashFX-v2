import { useCallback, useRef, useState } from 'react';
import { Upload, Download, X, RotateCcw, Scissors, AlertCircle, Loader2 } from 'lucide-react';
import { useBackgroundRemoval } from './useBackgroundRemoval';
import type { ProcessingStatus } from './useBackgroundRemoval';

function statusLabel(status: ProcessingStatus, progress: number): string {
  switch (status) {
    case 'downloading-model':
      return `Downloading AI model... ${progress}%`;
    case 'processing':
      return 'Removing background...';
    case 'complete':
      return 'Complete';
    case 'error':
      return 'Failed';
    default:
      return '';
  }
}

export function BackgroundRemovalPanel({ onClose }: { onClose: () => void }) {
  const {
    imageSrc,
    processedImage,
    isProcessing,
    downloadProgress,
    processingStatus,
    error,
    loadImage,
    processImage,
    reset,
    downloadResult,
  } = useBackgroundRemoval();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file.type.startsWith('image/')) return;
      loadImage(file);
    },
    [loadImage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const progressWidth = processingStatus === 'processing' ? 100 : downloadProgress;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 rounded-xl overflow-hidden bg-[#0a1628] border border-[#1a2a42] shadow-2xl animate-[fadeIn_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2a42]">
          <div className="flex items-center gap-2.5">
            <Scissors size={18} className="text-[#f7b500]" />
            <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
              Background Removal
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {!imageSrc ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`
                flex flex-col items-center justify-center gap-3 p-10 rounded-lg border-2 border-dashed cursor-pointer
                transition-all duration-200
                ${isDragOver
                  ? 'border-[#f7b500] bg-[#f7b500]/5'
                  : 'border-[#243a5c] hover:border-[#f7b500]/50 hover:bg-white/[0.02]'
                }
              `}
            >
              <div className={`p-3 rounded-full transition-colors ${isDragOver ? 'bg-[#f7b500]/10' : 'bg-white/5'}`}>
                <Upload size={24} className={isDragOver ? 'text-[#f7b500]' : 'text-slate-400'} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-200">
                  Drop an image here or click to browse
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  PNG, JPG, or WebP supported
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="relative rounded-lg overflow-hidden bg-[#06101a] border border-[#1a2a42]">
                {/* Checkerboard pattern for transparency */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: processedImage && !showOriginal
                      ? 'repeating-conic-gradient(#1a1a2e 0% 25%, #0f0f1e 0% 50%)'
                      : 'none',
                    backgroundSize: '16px 16px',
                  }}
                />
                <img
                  src={showOriginal || !processedImage ? imageSrc : processedImage}
                  alt="Preview"
                  className="relative w-full max-h-[320px] object-contain"
                />
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 size={28} className="text-[#f7b500] animate-spin" />
                      <span className="text-xs font-medium text-slate-200">
                        {statusLabel(processingStatus, downloadProgress)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {isProcessing && (
                <div className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-[#1a2a42] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#f7b500] to-[#ffc83d] transition-all duration-300 ease-out"
                      style={{ width: `${progressWidth}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 text-center">
                    {processingStatus === 'downloading-model' && downloadProgress < 100
                      ? 'First run downloads the AI model (~40MB). It will be cached for future use.'
                      : 'Analyzing image and removing background...'}
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              {/* Toggle original/result */}
              {processedImage && (
                <div className="flex items-center justify-center">
                  <button
                    onMouseDown={() => setShowOriginal(true)}
                    onMouseUp={() => setShowOriginal(false)}
                    onMouseLeave={() => setShowOriginal(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors px-3 py-1 rounded border border-[#1a2a42] hover:border-[#243a5c]"
                  >
                    Hold to see original
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {!processedImage && !isProcessing && (
                  <button
                    onClick={processImage}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#f7b500] hover:bg-[#ffc83d] text-[#06101a] text-sm font-semibold transition-colors"
                  >
                    <Scissors size={15} />
                    Remove Background
                  </button>
                )}
                {processedImage && (
                  <button
                    onClick={downloadResult}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#f7b500] hover:bg-[#ffc83d] text-[#06101a] text-sm font-semibold transition-colors"
                  >
                    <Download size={15} />
                    Download PNG
                  </button>
                )}
                <button
                  onClick={reset}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#1a2a42] hover:border-[#243a5c] text-slate-300 hover:text-slate-100 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
