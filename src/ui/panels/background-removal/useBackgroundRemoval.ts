import { useState, useCallback, useRef, useEffect } from 'react';
import type { Config } from '@imgly/background-removal';

export type ProcessingStatus =
  | 'idle'
  | 'downloading-model'
  | 'processing'
  | 'complete'
  | 'error';

interface BackgroundRemovalState {
  imageSrc: string | null;
  processedImage: string | null;
  isProcessing: boolean;
  downloadProgress: number;
  processingStatus: ProcessingStatus;
  error: string | null;
  fileName: string | null;
}

export function useBackgroundRemoval() {
  const [state, setState] = useState<BackgroundRemovalState>({
    imageSrc: null,
    processedImage: null,
    isProcessing: false,
    downloadProgress: 0,
    processingStatus: 'idle',
    error: null,
    fileName: null,
  });

  const imageSrcRef = useRef<string | null>(null);
  const processedImageRef = useRef<string | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    return () => {
      if (imageSrcRef.current) URL.revokeObjectURL(imageSrcRef.current);
      if (processedImageRef.current) URL.revokeObjectURL(processedImageRef.current);
    };
  }, []);

  const revokeOld = useCallback(() => {
    if (imageSrcRef.current) {
      URL.revokeObjectURL(imageSrcRef.current);
      imageSrcRef.current = null;
    }
    if (processedImageRef.current) {
      URL.revokeObjectURL(processedImageRef.current);
      processedImageRef.current = null;
    }
  }, []);

  const loadImage = useCallback((file: File) => {
    revokeOld();
    abortRef.current = false;

    const url = URL.createObjectURL(file);
    imageSrcRef.current = url;

    setState({
      imageSrc: url,
      processedImage: null,
      isProcessing: false,
      downloadProgress: 0,
      processingStatus: 'idle',
      error: null,
      fileName: file.name.replace(/\.[^.]+$/, ''),
    });
  }, [revokeOld]);

  const processImage = useCallback(async () => {
    if (!state.imageSrc) return;

    abortRef.current = false;
    setState((s) => ({
      ...s,
      isProcessing: true,
      processingStatus: 'downloading-model',
      downloadProgress: 0,
      error: null,
      processedImage: null,
    }));

    if (processedImageRef.current) {
      URL.revokeObjectURL(processedImageRef.current);
      processedImageRef.current = null;
    }

    try {
      const { removeBackground } = await import('@imgly/background-removal');

      const config: Config = {
        progress: (key: string, current: number, total: number) => {
          if (abortRef.current) return;
          if (key.includes('fetch') || key.includes('download')) {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0;
            setState((s) => ({
              ...s,
              processingStatus: 'downloading-model',
              downloadProgress: pct,
            }));
          } else if (key.includes('compute') || key.includes('inference')) {
            setState((s) => ({
              ...s,
              processingStatus: 'processing',
              downloadProgress: 100,
            }));
          }
        },
      };

      const blob = await removeBackground(state.imageSrc, config);

      if (abortRef.current) return;

      const resultUrl = URL.createObjectURL(blob);
      processedImageRef.current = resultUrl;

      setState((s) => ({
        ...s,
        processedImage: resultUrl,
        isProcessing: false,
        processingStatus: 'complete',
        downloadProgress: 100,
      }));
    } catch (err) {
      if (abortRef.current) return;
      setState((s) => ({
        ...s,
        isProcessing: false,
        processingStatus: 'error',
        error: err instanceof Error ? err.message : 'Background removal failed',
      }));
    }
  }, [state.imageSrc]);

  const reset = useCallback(() => {
    abortRef.current = true;
    revokeOld();
    setState({
      imageSrc: null,
      processedImage: null,
      isProcessing: false,
      downloadProgress: 0,
      processingStatus: 'idle',
      error: null,
      fileName: null,
    });
  }, [revokeOld]);

  const downloadResult = useCallback(() => {
    if (!state.processedImage) return;
    const a = document.createElement('a');
    a.href = state.processedImage;
    a.download = `${state.fileName || 'image'}-no-bg.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [state.processedImage, state.fileName]);

  return {
    ...state,
    loadImage,
    processImage,
    reset,
    downloadResult,
  };
}
