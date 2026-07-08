import type { ProjectMetadata, CreateProjectOptions } from '../types';
import { deriveOrientation } from '../types';
import {
  getAllMetadata,
  getMetadata,
  putMetadata,
  deleteMetadata,
  getScene,
  putScene,
  deleteScene,
  getPreview,
  putPreview,
  deletePreview,
  deleteAssetsByProject,
} from '../storage/db';
import type { ProjectScene, ProjectPreview } from '../types';
import { serializeComposition, deserializeComposition } from './serialization';
import { createComposition, createDefaultBackground } from '../../core/factory';
import type { Composition } from '../../core/types';
import { videoAssetStore } from '../../engine/video/videoAssetStore';

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createProject(options: CreateProjectOptions): Promise<ProjectMetadata> {
  const id = generateId();
  const now = Date.now();
  const { name, width, height, frameRate = 30, durationFrames = 150, videoFormat = 'long' } = options;

  const metadata: ProjectMetadata = {
    id,
    name,
    width,
    height,
    orientation: deriveOrientation(width, height),
    videoFormat,
    frameRate,
    durationFrames,
    createdAt: now,
    modifiedAt: now,
    version: 1,
  };

  const composition = createComposition(name, {
    width,
    height,
    frameRate,
    durationFrames,
    backgroundColor: [0.08, 0.09, 0.12, 1],
  });

  const scene: ProjectScene = {
    id,
    data: serializeComposition(composition),
  };

  const preview: ProjectPreview = {
    id,
    blob: null,
  };

  await putMetadata(metadata);
  await putScene(scene);
  await putPreview(preview);

  return metadata;
}

export async function listProjects(): Promise<ProjectMetadata[]> {
  return getAllMetadata();
}

export async function getProjectMetadata(id: string): Promise<ProjectMetadata | undefined> {
  return getMetadata(id);
}

export async function loadProjectScene(id: string): Promise<Composition | null> {
  const scene = await getScene(id);
  if (!scene) return null;
  return deserializeComposition(scene.data);
}

export async function saveProjectScene(id: string, composition: Composition): Promise<void> {
  const scene: ProjectScene = {
    id,
    data: serializeComposition(composition),
  };
  await putScene(scene);

  const metadata = await getMetadata(id);
  if (metadata) {
    metadata.modifiedAt = Date.now();
    metadata.version += 1;
    await putMetadata(metadata);
  }
}

export async function deleteProject(id: string): Promise<void> {
  await deleteMetadata(id);
  await deleteScene(id);
  await deletePreview(id);
  await deleteAssetsByProject(id);
  await videoAssetStore.deleteProjectAssets(id);
}

export async function renameProject(id: string, newName: string): Promise<void> {
  const metadata = await getMetadata(id);
  if (!metadata) return;
  metadata.name = newName;
  metadata.modifiedAt = Date.now();
  await putMetadata(metadata);
}

export async function duplicateProject(id: string): Promise<ProjectMetadata | null> {
  const metadata = await getMetadata(id);
  if (!metadata) return null;

  const scene = await getScene(id);
  if (!scene) return null;

  const newId = generateId();
  const now = Date.now();

  const newMetadata: ProjectMetadata = {
    ...metadata,
    id: newId,
    name: `${metadata.name} (Copy)`,
    createdAt: now,
    modifiedAt: now,
    version: 1,
  };

  const newScene: ProjectScene = {
    id: newId,
    data: scene.data,
  };

  const preview = await getPreview(id);
  const newPreview: ProjectPreview = {
    id: newId,
    blob: preview?.blob ?? null,
  };

  await putMetadata(newMetadata);
  await putScene(newScene);
  await putPreview(newPreview);

  // Copy video assets from source project to duplicated project
  videoAssetStore.duplicateProjectAssets(id, newId).catch((err) => {
    console.warn('[duplicateProject] Failed to copy video assets:', err);
  });

  return newMetadata;
}

export async function getProjectPreviewUrl(id: string): Promise<string | null> {
  const preview = await getPreview(id);
  if (!preview?.blob) return null;
  return URL.createObjectURL(preview.blob);
}

export async function saveProjectPreview(id: string, blob: Blob): Promise<void> {
  const preview: ProjectPreview = { id, blob };
  await putPreview(preview);
}
