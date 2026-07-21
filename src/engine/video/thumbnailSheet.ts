import { videoDecoderPool } from './videoDecoderPool';
import { mediaAssetManager } from '../media/assetManager';

const COLS = 4;
const ROWS = 3;
const CELL_W = 320;
const GAP = 4;

/**
 * Decode a grid of evenly-spaced frames from a video asset and download the
 * result as a single "contact sheet" PNG. Best-effort: requires the asset to
 * have an active decoder in the pool (i.e. it has been loaded for playback);
 * rejects with a thrown Error otherwise. Each decoded VideoFrame is closed
 * after painting so no decoder resources leak.
 */
export async function generateThumbnailSheet(assetId: string): Promise<void> {
  const meta = mediaAssetManager.getMetadata(assetId);
  if (!meta) throw new Error('No metadata for asset');

  const totalFrames = Math.max(1, Math.floor(meta.duration * meta.frameRate));
  const count = COLS * ROWS;
  const aspect = meta.height > 0 ? meta.width / meta.height : 16 / 9;
  const cellH = Math.round(CELL_W / aspect);

  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL_W + (COLS + 1) * GAP;
  canvas.height = ROWS * cellH + (ROWS + 1) * GAP;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < count; i++) {
    const frameIndex = Math.min(totalFrames - 1, Math.floor((i + 0.5) * (totalFrames / count)));
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = GAP + col * (CELL_W + GAP);
    const y = GAP + row * (cellH + GAP);
    try {
      const frame = await videoDecoderPool.decodeFrame(assetId, frameIndex);
      try {
        const bmp = await createImageBitmap(frame);
        const scale = Math.max(CELL_W / bmp.width, cellH / bmp.height);
        const dw = bmp.width * scale;
        const dh = bmp.height * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, CELL_W, cellH);
        ctx.clip();
        ctx.drawImage(bmp, x + (CELL_W - dw) / 2, y + (cellH - dh) / 2, dw, dh);
        ctx.restore();
        bmp.close();
      } finally {
        frame.close();
      }
    } catch {
      // Leave this cell dark if the frame can't be decoded.
    }
  }

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to encode sheet');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thumbnail-sheet-${assetId.slice(0, 8)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
