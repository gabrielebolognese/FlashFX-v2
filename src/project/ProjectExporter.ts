import JSZip from 'jszip';
import type { ExportOptions, FfxprojManifest, ElementsFile, KeyframesFile, TimelineKeyframesFile } from './types';
import { FORMAT_VERSION, FILE_EXTENSION } from './types';
import { serializeElements } from './serializers/ElementSerializer';
import { serializeKeyframes } from './serializers/KeyframeSerializer';
import { serializeTimeline } from './serializers/TimelineSerializer';

const APP_VERSION = '1.0.0';

export class ProjectExporter {
  async exportProject(options: ExportOptions): Promise<Blob> {
    const { projectName, elements, canvas, animationState, onProgress } = options;

    onProgress?.(0, 'Preparing project…');

    const zip = new JSZip();
    const now = new Date().toISOString();

    onProgress?.(5, 'Extracting assets…');
    const { serialized: serializedElements, assets } = await serializeElements(elements);
    onProgress?.(20, 'Building element data…');

    const bg = canvas.background;
    const legacyBgColor = (bg as unknown as { color?: string })?.color ?? '#1F2937';

    const manifest: FfxprojManifest = {
      formatVersion: FORMAT_VERSION,
      appVersion: APP_VERSION,
      createdAt: now,
      lastModifiedAt: now,
      projectName,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      frameRate: canvas.fps ?? animationState.timeline.fps,
      totalDuration: animationState.timeline.duration,
      backgroundColor: legacyBgColor,
      backgroundConfig: bg ?? undefined,
      zoom: canvas.zoom,
      pan: canvas.pan,
      gridEnabled: canvas.grid?.enabled,
      gridSnap: canvas.grid?.snap,
      gridSize: canvas.grid?.size,
      assetManifest: Array.from(assets.blobs.values()).map(({ entry }) => entry),
    };
    zip.file('project.json', JSON.stringify(manifest, null, 2));

    const elementsFile: ElementsFile = {
      formatVersion: FORMAT_VERSION,
      elementCount: serializedElements.length,
      elements: serializedElements,
    };
    zip.file('elements/elements.json', JSON.stringify(elementsFile, null, 2));

    onProgress?.(30, 'Serializing keyframes…');
    const keyframesFile: KeyframesFile = serializeKeyframes(animationState);
    zip.file('elements/keyframes.json', JSON.stringify(keyframesFile, null, 2));

    onProgress?.(40, 'Serializing timeline…');
    const timelineFile = serializeTimeline(animationState);
    zip.file('timeline/timeline.json', JSON.stringify(timelineFile, null, 2));

    const tlKeyframesFile: TimelineKeyframesFile = {
      formatVersion: FORMAT_VERSION,
      globalKeyframes: {},
    };
    zip.file('timeline/keyframes.json', JSON.stringify(tlKeyframesFile, null, 2));

    onProgress?.(50, 'Packing assets…');
    const totalAssets = assets.blobs.size;
    let assetIdx = 0;
    for (const [assetId, { blob, entry }] of assets.blobs) {
      const path = `${entry.subfolder}/${entry.fileName}`;
      zip.file(path, blob);
      assetIdx++;
      const pct = 50 + Math.round((assetIdx / Math.max(1, totalAssets)) * 30);
      onProgress?.(pct, `Packing asset ${assetIdx}/${totalAssets}…`);
    }

    onProgress?.(85, 'Compressing…');
    const result = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (meta) => {
        const pct = 85 + Math.round(meta.percent * 0.15);
        onProgress?.(pct, `Compressing… ${Math.round(meta.percent)}%`);
      }
    );

    onProgress?.(100, 'Done');
    return result;
  }

  async saveToFile(blob: Blob, projectName: string): Promise<void> {
    const safeName = projectName.trim() || 'untitled';
    const filename = safeName.endsWith(FILE_EXTENSION)
      ? safeName
      : `${safeName}${FILE_EXTENSION}`;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as typeof window & {
          showSaveFilePicker(opts: unknown): Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'FlashFX Project',
              accept: { 'application/octet-stream': [FILE_EXTENSION] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export const projectExporter = new ProjectExporter();
