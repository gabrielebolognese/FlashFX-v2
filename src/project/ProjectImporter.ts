import JSZip from 'jszip';
import type { DesignElement } from '../types/design';
import type {
  ImportResult,
  ImportedProject,
  FfxprojManifest,
  ElementsFile,
  KeyframesFile,
  SerializedTimeline,
  AssetEntry,
} from './types';
import { FORMAT_VERSION, FILE_EXTENSION } from './types';
import { deserializeElements } from './serializers/ElementSerializer';
import { deserializeKeyframes } from './serializers/KeyframeSerializer';
import { deserializeTimeline } from './serializers/TimelineSerializer';
import type { ProjectCanvas } from '../types/projectFile';
import type { AnimationState } from '../animation-engine/types';
import { DEFAULT_TIMELINE_STATE } from '../animation-engine/types';
import type { BackgroundConfig } from '../types/background';
import { createDefaultBackground } from '../types/background';

export type ImportProgressCallback = (pct: number, label: string) => void;

function isNewerVersion(fileVer: string, appVer: string): boolean {
  const parse = (v: string) =>
    v
      .split('.')
      .map(Number)
      .map((n) => (isNaN(n) ? 0 : n));
  const [fMaj, fMin, fPat] = parse(fileVer);
  const [aMaj, aMin, aPat] = parse(appVer);
  if (fMaj !== aMaj) return fMaj > aMaj;
  if (fMin !== aMin) return fMin > aMin;
  return fPat > aPat;
}

function buildDefaultAnimationState(): AnimationState {
  return {
    animations: {},
    timeline: { ...DEFAULT_TIMELINE_STATE },
    sequences: {},
    activeSequenceId: null,
  };
}

async function extractAssetBlobs(
  zip: JSZip,
  assetManifest: AssetEntry[],
  onProgress?: (done: number, total: number) => void
): Promise<{ blobMap: Map<string, string>; warnings: string[] }> {
  const blobMap = new Map<string, string>();
  const warnings: string[] = [];
  const total = assetManifest.length;

  for (let i = 0; i < assetManifest.length; i++) {
    const entry = assetManifest[i];
    const path = `${entry.subfolder}/${entry.fileName}`;
    const zipFile = zip.file(path);

    if (!zipFile) {
      warnings.push(`Asset missing: ${entry.fileName} (id: ${entry.id})`);
      onProgress?.(i + 1, total);
      continue;
    }

    try {
      const arrayBuffer = await zipFile.async('arraybuffer');
      const typedBlob = new Blob([arrayBuffer], {
        type: entry.mimeType || 'application/octet-stream',
      });
      const objectUrl = URL.createObjectURL(typedBlob);
      blobMap.set(entry.id, objectUrl);
    } catch (err) {
      warnings.push(
        `Failed to extract asset "${entry.fileName}" (id: ${entry.id}): ${err}`
      );
    }

    onProgress?.(i + 1, total);
  }

  return { blobMap, warnings };
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  if (!f) return null;
  try {
    return await f.async('string');
  } catch {
    return null;
  }
}

async function loadNewFormat(
  zip: JSZip,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  const warnings: string[] = [];

  onProgress?.(5, 'Reading project metadata...');

  const manifestText = await readZipText(zip, 'project.json');
  if (!manifestText) {
    return {
      success: false,
      errors: ['The project file is corrupted — project.json could not be read.'],
    };
  }

  let manifest: FfxprojManifest;
  try {
    manifest = JSON.parse(manifestText) as FfxprojManifest;
  } catch (err) {
    return {
      success: false,
      errors: [
        `The project file is corrupted — project.json could not be parsed: ${err}`,
      ],
    };
  }

  if (!manifest.formatVersion) {
    warnings.push(
      'project.json is missing formatVersion — treating as legacy format with maximum tolerance.'
    );
  } else if (isNewerVersion(manifest.formatVersion, FORMAT_VERSION)) {
    return {
      success: false,
      errors: [
        `This project was created with a newer version of the app (format ${manifest.formatVersion}) and cannot be opened. ` +
          `The current app supports up to format ${FORMAT_VERSION}.`,
      ],
    };
  }

  const assetManifest: AssetEntry[] = manifest.assetManifest ?? [];

  const missingAssets: string[] = [];
  for (const entry of assetManifest) {
    const path = `${entry.subfolder}/${entry.fileName}`;
    if (!zip.file(path)) {
      missingAssets.push(entry.fileName);
    }
  }
  if (missingAssets.length > 0) {
    warnings.push(
      `Some assets could not be found: ${missingAssets.join(', ')}. The project will open with placeholders.`
    );
  }

  onProgress?.(10, `Extracting assets (0/${assetManifest.length})...`);

  const { blobMap, warnings: assetWarnings } = await extractAssetBlobs(
    zip,
    assetManifest,
    (done, total) => {
      const pct = 10 + Math.round((done / Math.max(1, total)) * 25);
      onProgress?.(pct, `Extracting assets (${done}/${total})...`);
    }
  );
  warnings.push(...assetWarnings);

  onProgress?.(35, 'Reading project data...');

  const [elemText, kfText, tlText] = await Promise.all([
    readZipText(zip, 'elements/elements.json'),
    readZipText(zip, 'elements/keyframes.json'),
    readZipText(zip, 'timeline/timeline.json'),
  ]);

  onProgress?.(40, 'Parsing elements...');

  let rawElements: DesignElement[] = [];
  if (!elemText) {
    warnings.push(
      'elements/elements.json is missing — no elements will be restored.'
    );
  } else {
    try {
      const ef: ElementsFile = JSON.parse(elemText);
      rawElements = Array.isArray(ef.elements) ? (ef.elements as DesignElement[]) : [];
    } catch (err) {
      return {
        success: false,
        errors: [
          `elements/elements.json is corrupted and cannot be parsed: ${err}`,
        ],
      };
    }
  }

  const totalElems = rawElements.length;
  onProgress?.(45, `Restoring elements (0/${totalElems})...`);

  const { elements, warnings: elemWarnings } = await deserializeElements(
    rawElements,
    blobMap
  );
  warnings.push(...elemWarnings);

  onProgress?.(60, `Restoring elements (${elements.length}/${totalElems})...`);

  onProgress?.(65, 'Restoring keyframes...');

  let animationState: AnimationState = buildDefaultAnimationState();

  if (!kfText) {
    warnings.push(
      'elements/keyframes.json is missing — keyframe data will not be restored.'
    );
  } else {
    try {
      const kf: KeyframesFile = JSON.parse(kfText);
      const animations = deserializeKeyframes(kf);
      animationState = { ...animationState, animations };
    } catch (err) {
      warnings.push(
        `elements/keyframes.json could not be parsed — keyframes will not be restored: ${err}`
      );
    }
  }

  onProgress?.(75, 'Restoring timeline...');

  if (!tlText) {
    warnings.push(
      'timeline/timeline.json is missing — timeline will use default settings.'
    );
  } else {
    try {
      const tl: SerializedTimeline = JSON.parse(tlText);
      const { timeline, sequences, activeSequenceId } = deserializeTimeline(tl);
      animationState = {
        ...animationState,
        timeline: { ...DEFAULT_TIMELINE_STATE, ...timeline },
        sequences,
        activeSequenceId,
      };
    } catch (err) {
      warnings.push(
        `timeline/timeline.json could not be parsed — timeline will use default settings: ${err}`
      );
    }
  }

  onProgress?.(88, 'Applying project settings...');

  const resolvedBackground: BackgroundConfig = (() => {
    if (manifest.backgroundConfig && typeof manifest.backgroundConfig === 'object' && Array.isArray((manifest.backgroundConfig as BackgroundConfig).layers)) {
      return manifest.backgroundConfig as BackgroundConfig;
    }
    return createDefaultBackground();
  })();

  const canvas: ProjectCanvas = {
    width: manifest.canvasWidth ?? 3840,
    height: manifest.canvasHeight ?? 2160,
    fps: manifest.frameRate ?? 30,
    zoom: manifest.zoom ?? 0.25,
    pan: manifest.pan ?? { x: 0, y: 0 },
    background: resolvedBackground,
    grid: {
      enabled: manifest.gridEnabled ?? true,
      snap: manifest.gridSnap ?? true,
      size: manifest.gridSize ?? 40,
    },
  };

  onProgress?.(95, 'Finalizing...');

  const data: ImportedProject = {
    projectName: manifest.projectName ?? 'Untitled Project',
    elements,
    canvas,
    animationState,
    warnings,
  };

  onProgress?.(100, `Project loaded — ${data.projectName}`);

  return {
    success: true,
    data,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

async function loadLegacyFormat(
  zip: JSZip,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  const warnings: string[] = [];
  warnings.push(
    'Loading legacy .ffxproj format. Consider re-saving to update the file format.'
  );

  onProgress?.(10, 'Reading legacy project structure...');

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    return {
      success: false,
      errors: ['Neither project.json nor manifest.json found in archive.'],
    };
  }

  let manifest: { name?: string; schemaVersion?: number } = {};
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
  } catch (err) {
    return {
      success: false,
      errors: [`Failed to parse manifest.json: ${err}`],
    };
  }

  onProgress?.(20, 'Reading legacy canvas...');

  let canvas: ProjectCanvas = {
    width: 3840,
    height: 2160,
    fps: 30,
    zoom: 0.25,
    pan: { x: 0, y: 0 },
    background: { color: '#1F2937' },
    grid: { enabled: true, snap: true, size: 40 },
  };

  const canvasFile = zip.file('canvas/canvas.json');
  if (canvasFile) {
    try {
      const raw: Record<string, unknown> = JSON.parse(
        await canvasFile.async('string')
      );
      canvas = {
        width: (raw.width as number) ?? canvas.width,
        height: (raw.height as number) ?? canvas.height,
        fps: (raw.fps as number) ?? canvas.fps,
        zoom: (raw.zoom as number) ?? canvas.zoom,
        pan: (raw.pan as { x: number; y: number }) ?? canvas.pan,
        background:
          raw.background && typeof raw.background === 'string'
            ? { color: raw.background }
            : canvas.background,
        grid: {
          enabled:
            (raw.grid as { enabled?: boolean } | undefined)?.enabled ?? true,
          snap: (raw.grid as { snap?: boolean } | undefined)?.snap ?? true,
          size: (raw.grid as { size?: number } | undefined)?.size ?? 40,
        },
      };
    } catch (err) {
      warnings.push(`Failed to parse canvas/canvas.json: ${err}`);
    }
  } else {
    warnings.push('canvas/canvas.json missing — using default canvas settings.');
  }

  onProgress?.(30, 'Extracting legacy assets...');

  const blobMap = new Map<string, string>();
  const assetManifestFile = zip.file('assets/manifest.json');

  if (assetManifestFile) {
    try {
      const assetManifestRaw: {
        images?: Record<string, { filename: string }>;
      } = JSON.parse(await assetManifestFile.async('string'));
      for (const [elementId, ref] of Object.entries(
        assetManifestRaw.images ?? {}
      )) {
        const imgFile = zip.file(`assets/images/${ref.filename}`);
        if (imgFile) {
          try {
            const ab = await imgFile.async('arraybuffer');
            const blob = new Blob([ab], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            blobMap.set(elementId, url);
            const hash = ref.filename.split('.')[0];
            if (hash) blobMap.set(hash, url);
          } catch (err) {
            warnings.push(
              `Failed to load legacy image for element ${elementId}: ${err}`
            );
          }
        }
      }
    } catch (err) {
      warnings.push(`Failed to parse legacy assets/manifest.json: ${err}`);
    }
  }

  onProgress?.(50, 'Restoring legacy elements...');

  const shapes: DesignElement[] = [];
  const shapesFolder = zip.folder('shapes');
  if (shapesFolder) {
    const shapeFiles: JSZip.JSZipObject[] = [];
    shapesFolder.forEach((_path, f) => {
      if (!f.dir && _path.endsWith('.json')) shapeFiles.push(f);
    });
    for (const f of shapeFiles) {
      try {
        const parsed = JSON.parse(await f.async('string')) as DesignElement;
        shapes.push(parsed);
      } catch (err) {
        warnings.push(
          `Failed to parse legacy shape file ${f.name}: ${err}`
        );
      }
    }
  }

  onProgress?.(70, 'Deserializing elements...');

  const { elements, warnings: elemWarnings } = await deserializeElements(
    shapes,
    blobMap
  );
  warnings.push(...elemWarnings);

  onProgress?.(90, 'Finalizing...');

  const animationState: AnimationState = buildDefaultAnimationState();

  onProgress?.(100, 'Project loaded');

  return {
    success: true,
    data: {
      projectName: manifest.name ?? 'Untitled Project',
      elements,
      canvas,
      animationState,
      warnings,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export class ProjectImporter {
  async importProject(
    file: File,
    onProgress?: ImportProgressCallback
  ): Promise<ImportResult> {
    if (file.size === 0) {
      return {
        success: false,
        errors: ['The selected file is empty.'],
      };
    }

    if (!file.name.endsWith(FILE_EXTENSION) && !file.name.endsWith('.ffxproj')) {
      return {
        success: false,
        errors: [
          `Invalid file type. Please select a ${FILE_EXTENSION} project file.`,
        ],
      };
    }

    onProgress?.(2, 'Validating file...');

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      return {
        success: false,
        errors: [
          'This file is not a valid .ffxproj project file. It may be corrupted or in an unrecognized format.',
        ],
      };
    }

    const hasNewFormat = zip.file('project.json') !== null;
    if (hasNewFormat) {
      return loadNewFormat(zip, onProgress);
    }
    return loadLegacyFormat(zip, onProgress);
  }
}

export const projectImporter = new ProjectImporter();
