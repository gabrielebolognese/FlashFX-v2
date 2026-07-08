import type { Composition } from '../../core/types';
import type { ProjectMetadata } from '../types';
import { deriveOrientation } from '../types';
import {
  getMetadata,
  putMetadata,
  getScene,
  putScene,
  getPreview,
  putPreview,
  getAssetsByProject,
  putAsset,
} from '../storage/db';
import { serializeComposition, deserializeComposition } from './serialization';

export const FFX_EXTENSION = 'ffx';
const FFX_FORMAT = 'flashfx-project';
const FFX_VERSION = 1;

interface FfxAsset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  createdAt: number;
  data: string; // base64-encoded binary
}

interface FfxBundle {
  format: typeof FFX_FORMAT;
  ffxVersion: number;
  exportedAt: number;
  metadata: ProjectMetadata;
  scene: string; // serialized composition JSON
  assets: FfxAsset[];
  preview: string | null; // base64-encoded image
}

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateAssetId(): string {
  return `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return arrayBufferToBase64(await blob.arrayBuffer());
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '_');
  return cleaned || 'project';
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Bundle the complete project (composition + every media binary + preview) into
// a single .ffx file and trigger a browser download. When the editor's live
// composition is supplied it is used verbatim so unsaved edits are captured.
export async function exportProjectToFile(
  projectId: string,
  liveComposition?: Composition,
): Promise<void> {
  const metadata = await getMetadata(projectId);
  if (!metadata) throw new Error('Project not found');

  let sceneData: string | undefined;
  if (liveComposition) {
    sceneData = serializeComposition(liveComposition);
  } else {
    const scene = await getScene(projectId);
    sceneData = scene?.data;
  }
  if (!sceneData) throw new Error('Project scene data is missing');

  const assets = await getAssetsByProject(projectId);
  const ffxAssets: FfxAsset[] = await Promise.all(
    assets.map(async (a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      mimeType: a.mimeType,
      createdAt: a.createdAt,
      data: await blobToBase64(a.blob),
    })),
  );

  const preview = await getPreview(projectId);
  const previewData = preview?.blob ? await blobToBase64(preview.blob) : null;

  const bundle: FfxBundle = {
    format: FFX_FORMAT,
    ffxVersion: FFX_VERSION,
    exportedAt: Date.now(),
    metadata,
    scene: sceneData,
    assets: ffxAssets,
    preview: previewData,
  };

  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  triggerDownload(blob, `${sanitizeFileName(metadata.name)}.${FFX_EXTENSION}`);
}

// Restore a .ffx bundle into a brand-new project: media binaries are written
// back to storage under fresh asset ids, the composition's asset references are
// remapped to match, and metadata/scene/preview are persisted.
export async function importProjectFromFile(file: File): Promise<ProjectMetadata> {
  let bundle: FfxBundle;
  try {
    bundle = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not a valid .ffx project');
  }

  if (!bundle || bundle.format !== FFX_FORMAT || typeof bundle.scene !== 'string') {
    throw new Error('Unrecognized .ffx project format');
  }

  const newProjectId = generateId();
  const now = Date.now();

  const assets = Array.isArray(bundle.assets) ? bundle.assets : [];
  const assetIdMap = new Map<string, string>();
  for (const a of assets) {
    assetIdMap.set(a.id, generateAssetId());
  }

  const composition = deserializeComposition(bundle.scene);
  for (const layer of composition.layers) {
    if (layer.type === 'video') {
      const mapped = assetIdMap.get(layer.video.assetId);
      if (mapped) layer.video.assetId = mapped;
    } else if (layer.type === 'image') {
      const mapped = assetIdMap.get(layer.image.assetId);
      if (mapped) layer.image.assetId = mapped;
    } else if (layer.type === 'audio') {
      const mapped = assetIdMap.get(layer.audio.assetId);
      if (mapped) layer.audio.assetId = mapped;
    }
  }

  for (const a of assets) {
    await putAsset({
      id: assetIdMap.get(a.id)!,
      projectId: newProjectId,
      name: a.name,
      type: a.type,
      blob: base64ToBlob(a.data, a.mimeType),
      mimeType: a.mimeType,
      createdAt: a.createdAt ?? now,
    });
  }

  const meta = bundle.metadata ?? ({} as Partial<ProjectMetadata>);
  const width = typeof meta.width === 'number' ? meta.width : composition.settings.width;
  const height = typeof meta.height === 'number' ? meta.height : composition.settings.height;
  const baseName = meta.name || composition.name || 'Imported Project';

  const metadata: ProjectMetadata = {
    id: newProjectId,
    name: baseName,
    width,
    height,
    orientation: deriveOrientation(width, height),
    frameRate: typeof meta.frameRate === 'number' ? meta.frameRate : composition.settings.frameRate,
    durationFrames:
      typeof meta.durationFrames === 'number' ? meta.durationFrames : composition.settings.durationFrames,
    createdAt: now,
    modifiedAt: now,
    version: 1,
  };

  await putMetadata(metadata);
  await putScene({ id: newProjectId, data: serializeComposition(composition) });
  await putPreview({
    id: newProjectId,
    blob: bundle.preview ? base64ToBlob(bundle.preview, 'image/webp') : null,
  });

  return metadata;
}
