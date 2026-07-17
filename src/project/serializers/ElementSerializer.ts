import { DesignElement } from '../../types/design';
import { AssetEntry } from '../types';

export interface ExtractedAssets {
  blobs: Map<string, { blob: Blob; entry: AssetEntry }>;
  elementAssetMap: Map<string, string>;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

function guessMime(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  return m ? m[1] : 'application/octet-stream';
}

function guessExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'model/gltf-binary': 'glb',
  };
  return map[mimeType] ?? 'bin';
}

async function extractElementAssets(
  element: DesignElement,
  assets: ExtractedAssets,
  depth = 0
): Promise<void> {
  if (depth > 50) return;

  if (element.type === 'image' && element.imageData) {
    const raw = element.imageData;
    if (raw.startsWith('data:') || raw.startsWith('blob:')) {
      const assetId = element.id;
      if (!assets.elementAssetMap.has(assetId)) {
        const mime = raw.startsWith('data:') ? guessMime(raw) : 'image/png';
        const blob = await dataUrlToBlob(raw);
        if (blob) {
          const ext = guessExtension(mime);
          const entry: AssetEntry = {
            id: assetId,
            type: 'image',
            fileName: `${assetId}.${ext}`,
            mimeType: mime,
            fileSizeBytes: blob.size,
            subfolder: 'assets/images',
            originalName: element.name || 'image',
            width: element.originalWidth,
            height: element.originalHeight,
          };
          assets.blobs.set(assetId, { blob, entry });
          assets.elementAssetMap.set(assetId, assetId);
        }
      }
    }
  }

  if (element.children?.length) {
    for (const child of element.children) {
      await extractElementAssets(child, assets, depth + 1);
    }
  }
}

export async function serializeElements(elements: DesignElement[]): Promise<{
  serialized: DesignElement[];
  assets: ExtractedAssets;
}> {
  const assets: ExtractedAssets = {
    blobs: new Map(),
    elementAssetMap: new Map(),
  };

  for (const el of elements) {
    await extractElementAssets(el, assets);
  }

  const serialized = elements.map(el => replaceImageDataWithAssetRef(el, assets));
  return { serialized, assets };
}

function replaceImageDataWithAssetRef(
  element: DesignElement,
  assets: ExtractedAssets
): DesignElement {
  const updated = { ...element };

  if (element.type === 'image' && element.imageData) {
    const assetId = assets.elementAssetMap.get(element.id);
    if (assetId) {
      updated.imageData = `@ffxasset:images/${assetId}`;
    }
  }

  if (updated.children?.length) {
    updated.children = updated.children.map(child =>
      replaceImageDataWithAssetRef(child, assets)
    );
  }

  return updated;
}

export async function deserializeElements(
  elements: DesignElement[],
  assetBlobMap: Map<string, string>
): Promise<{ elements: DesignElement[]; warnings: string[] }> {
  const warnings: string[] = [];
  const result: DesignElement[] = [];

  for (const el of elements) {
    try {
      result.push(restoreElementAssetRef(el, assetBlobMap, warnings));
    } catch (err) {
      warnings.push(`Failed to restore element ${el.id}: ${err}`);
    }
  }

  return { elements: result, warnings };
}

function restoreElementAssetRef(
  element: DesignElement,
  assetBlobMap: Map<string, string>,
  warnings: string[]
): DesignElement {
  const updated = { ...element };

  if (element.type === 'image' && typeof element.imageData === 'string') {
    const ref = element.imageData;
    if (ref.startsWith('@ffxasset:images/')) {
      const assetId = ref.replace('@ffxasset:images/', '');
      const objectUrl = assetBlobMap.get(assetId);
      if (objectUrl) {
        updated.imageData = objectUrl;
      } else {
        warnings.push(`Asset not found for element ${element.id} (assetId: ${assetId})`);
        updated.imageData = '';
      }
    } else if (ref.startsWith('@asset:images/')) {
      const filename = ref.replace('@asset:images/', '');
      const basename = filename.split('.')[0];
      const objectUrl = assetBlobMap.get(basename) ?? assetBlobMap.get(element.id);
      if (objectUrl) {
        updated.imageData = objectUrl;
      } else {
        warnings.push(`Legacy asset not found for element ${element.id}`);
        updated.imageData = '';
      }
    }
  }

  if (updated.children?.length) {
    updated.children = updated.children.map(child =>
      restoreElementAssetRef(child, assetBlobMap, warnings)
    );
  }

  return migrateElement(updated);
}

function migrateElement(element: DesignElement): DesignElement {
  if (element.type !== 'text') return element;
  return {
    ...element,
    animationTargetLevel: element.animationTargetLevel ?? 'object',
    stagger: element.stagger ?? 0,
    order: element.order ?? 'forward',
    masking: element.masking ?? false,
  };
}
