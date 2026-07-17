import { toPng, toJpeg } from 'html-to-image';
import { DesignElement } from '../types/design';

export class CanvasExporter {
  async exportFullCanvas(
    elements: DesignElement[],
    width: number,
    height: number,
    format: 'png' | 'jpeg',
    projectName: string,
    quality: number = 0.95
  ): Promise<void> {
    const canvasElement = document.getElementById('canvas-artboard');

    if (!canvasElement) {
      throw new Error('Canvas element not found');
    }

    const pixelRatio = 2;

    try {
      const exportFunction = format === 'jpeg' ? toJpeg : toPng;

      const computedStyle = window.getComputedStyle(canvasElement);
      const hasBackground = computedStyle.backgroundImage !== 'none' ||
                            (computedStyle.backgroundColor &&
                             computedStyle.backgroundColor !== 'transparent' &&
                             computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)');

      const backgroundColor = hasBackground ? undefined : (format === 'jpeg' ? '#1F2937' : 'transparent');

      const dataUrl = await exportFunction(canvasElement, {
        cacheBust: true,
        backgroundColor,
        pixelRatio,
        width,
        height,
        quality,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      const link = document.createElement('a');
      link.download = `${projectName}_canvas.${format}`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Canvas export failed:', error);
      throw new Error('Failed to export canvas. Try reducing resolution or element count.');
    }
  }

  async exportCanvasRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    format: 'png' | 'jpeg'
  ): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    const canvasElement = document.getElementById('canvas-artboard');

    if (!canvasElement) {
      throw new Error('Canvas element not found');
    }

    const pixelRatio = 2;
    const exportFunction = format === 'jpeg' ? toJpeg : toPng;

    const dataUrl = await exportFunction(canvasElement, {
      cacheBust: true,
      backgroundColor: format === 'jpeg' ? '#1F2937' : 'transparent',
      pixelRatio,
      width,
      height
    });

    const response = await fetch(dataUrl);
    return response.blob();
  }

  async captureCanvasAsBlob(
    width: number,
    height: number
  ): Promise<Blob> {
    const canvasElement = document.getElementById('canvas-artboard');

    if (!canvasElement) {
      throw new Error('Canvas element not found');
    }

    const pixelRatio = 2;

    const dataUrl = await toPng(canvasElement, {
      cacheBust: true,
      backgroundColor: 'transparent',
      pixelRatio,
      width,
      height,
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left'
      }
    });

    const response = await fetch(dataUrl);
    return response.blob();
  }
}
