import type { IconData } from './types';
import { iconToSvgString } from './iconToSvgString';

interface RasterizeOptions {
  size?: number;
  color?: string;
  strokeWidth?: number;
  padding?: number;
}

export async function rasterizeIconToFile(
  icon: IconData,
  options: RasterizeOptions = {}
): Promise<File> {
  const { size = 256, color = '#FFFFFF', strokeWidth = 2, padding = 24 } = options;

  const inner = size - padding * 2;
  const svg = iconToSvgString(icon, {
    strokeColor: color,
    strokeWidth,
    size: inner,
  });

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');

    ctx.drawImage(img, padding, padding, inner, inner);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!pngBlob) throw new Error('Failed to encode PNG');

    return new File([pngBlob], `${icon.id}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load SVG image'));
    img.src = src;
  });
}
