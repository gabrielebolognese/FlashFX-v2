import { useCallback } from 'react';
import { useProjectStore } from './useProjectStore';

const PREVIEW_WIDTH = 512;

export function usePreviewCapture() {
  const savePreview = useProjectStore((s) => s.savePreview);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const capturePreview = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!activeProjectId) return;

    const ratio = canvas.height / canvas.width;
    const previewHeight = Math.round(PREVIEW_WIDTH * ratio);

    const offscreen = document.createElement('canvas');
    offscreen.width = PREVIEW_WIDTH;
    offscreen.height = previewHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(canvas, 0, 0, PREVIEW_WIDTH, previewHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      offscreen.toBlob(resolve, 'image/webp', 0.7)
    );
    if (blob) {
      await savePreview(blob);
    }
  }, [activeProjectId, savePreview]);

  return { capturePreview };
}
