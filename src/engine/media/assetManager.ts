import type { VideoAssetMetadata, AudioAssetMetadata, WaveformData } from '../../project-system/types';
import { putAsset, getAssetsByProject, deleteAsset } from '../../project-system/storage/db';
import type { ProjectAsset } from '../../project-system/types';
import { computeWaveformPeaks } from '../../core/waveform';
import { videoDecoderPool } from '../video/videoDecoderPool';
import { frameScheduler } from '../video/frameScheduler';
import { videoAudioPlayer } from '../video/videoAudioPlayer';
import { videoTextureCache } from '../video/videoTextureCache';
import { videoAssetStore } from '../video/videoAssetStore';

export interface ImageAssetMetadata {
  assetId: string;
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

export type AssetStatus = 'ready' | 'loading' | 'missing' | 'error' | 'storage-error';

interface RegisteredAsset {
  id: string;
  name: string;
  mimeType: string;
  objectUrl: string;
  createdAt: number;
  metadata: VideoAssetMetadata | null;
  imageMetadata: ImageAssetMetadata | null;
  audioMetadata: AudioAssetMetadata | null;
  imageBitmap: ImageBitmap | null;
  waveform: WaveformData | null;
  audioBuffer: AudioBuffer | null;
  status: AssetStatus;
}

const SUPPORTED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]);

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi',
]);

function isVideoFormatSupported(file: File): boolean {
  if (file.type && SUPPORTED_VIDEO_MIMES.has(file.type)) return true;
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.has(ext);
}

class MediaAssetManager {
  private assets = new Map<string, RegisteredAsset>();
  private objectUrls = new Map<string, string>();
  private audioContext: AudioContext | null = null;
  private listeners = new Set<() => void>();
  private currentProjectId: string | null = null;
  private _persistenceAvailable = true;
  private _storageWarnings: string[] = [];

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('mediaAssetManager listener error', err);
      }
    }
  }

  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  getStorageWarnings(): string[] {
    return this._storageWarnings;
  }

  clearStorageWarning(index: number): void {
    this._storageWarnings.splice(index, 1);
    this.notify();
  }

  getAssetStatus(assetId: string): AssetStatus {
    return this.assets.get(assetId)?.status ?? 'loading';
  }

  isPersistenceAvailable(): boolean {
    return this._persistenceAvailable && !videoAssetStore.isDegraded();
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) this.audioContext = new AudioContext();
    return this.audioContext;
  }

  async importVideo(
    file: File,
    projectId: string,
    existingAssetId?: string
  ): Promise<{ assetId: string; metadata: VideoAssetMetadata }> {
    if (!isVideoFormatSupported(file)) {
      throw new Error(
        `Unsupported video format: ${file.type || file.name}. Supported formats: MP4, WebM, MOV, MKV, AVI.`
      );
    }

    if (file.size === 0) {
      throw new Error('Cannot import a zero-byte file.');
    }

    const assetId = existingAssetId ?? `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const projectAsset: ProjectAsset = {
      id: assetId,
      projectId,
      name: file.name,
      type: 'video',
      blob: file,
      mimeType: file.type,
      createdAt: Date.now(),
    };

    await putAsset(projectAsset);

    const objectUrl = URL.createObjectURL(file);

    this.assets.set(assetId, {
      id: assetId,
      name: file.name,
      mimeType: file.type,
      objectUrl,
      createdAt: projectAsset.createdAt,
      metadata: null,
      imageMetadata: null,
      audioMetadata: null,
      imageBitmap: null,
      waveform: null,
      audioBuffer: null,
      status: 'loading',
    });
    this.objectUrls.set(assetId, objectUrl);

    // Start persisting to dedicated video store (non-blocking)
    const savePromise = this.persistToVideoStore(projectId, assetId, file);

    // Request persistent storage on first video import
    videoAssetStore.requestPersistence().then((granted) => {
      if (!granted && !videoAssetStore.isDegraded()) {
        const warned = localStorage.getItem('flashfx-persist-warned');
        if (!warned) {
          this._storageWarnings.push(
            'Your browser may clear stored videos when storage is low. For reliable project recovery, enable persistent storage in your browser settings.'
          );
          localStorage.setItem('flashfx-persist-warned', '1');
          this.notify();
        }
      }
    });

    try {
      const workerMeta = await videoDecoderPool.initAsset(assetId, file);

      const metadata: VideoAssetMetadata = {
        assetId,
        width: workerMeta.width,
        height: workerMeta.height,
        duration: workerMeta.duration,
        frameRate: workerMeta.frameRate,
        hasAudio: false,
        codec: workerMeta.codec,
        fileSize: file.size,
      };

      const asset = this.assets.get(assetId);
      if (asset) {
        asset.metadata = metadata;
        asset.status = 'ready';
      }

      frameScheduler.registerAsset(assetId, assetId, workerMeta.frameRate, workerMeta.frameCount);
      videoAudioPlayer.initAudio(assetId, file);
      this.extractVideoAudio(file, assetId);

      // Await persistence if still in progress
      try {
        await savePromise;
      } catch (storeErr: any) {
        if (asset) asset.status = 'storage-error';
        this._storageWarnings.push(
          'This video could not be saved to local storage. It will need to be re-imported if you close and reopen this project.'
        );
      }

      this.notify();
      return { assetId, metadata };
    } catch (err: any) {
      const asset = this.assets.get(assetId);
      if (asset) asset.status = 'error';

      // Check for audio-only file
      if (err?.message?.includes('No video track')) {
        throw new Error('This file contains no video track. To import audio, use the audio import option.');
      }

      throw err;
    }
  }

  private async persistToVideoStore(projectId: string, assetId: string, file: File): Promise<void> {
    if (videoAssetStore.isDegraded()) {
      this._persistenceAvailable = false;
      return;
    }

    // Check quota before large files
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const remaining = (est.quota ?? 0) - (est.usage ?? 0);
        if (file.size > remaining * 0.8 && file.size > 50 * 1024 * 1024) {
          this._storageWarnings.push(
            `This video file is large (${formatBytes(file.size)}) and may use most of your available storage for this site.`
          );
          this.notify();
        }
      }
    } catch {
      // Non-critical
    }

    await videoAssetStore.saveAsset(projectId, assetId, file);
  }

  async importImage(
    file: File,
    projectId: string
  ): Promise<{ assetId: string; metadata: ImageAssetMetadata }> {
    const assetId = `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const projectAsset: ProjectAsset = {
      id: assetId,
      projectId,
      name: file.name,
      type: 'image',
      blob: file,
      mimeType: file.type,
      createdAt: Date.now(),
    };

    await putAsset(projectAsset);

    const bitmap = await createImageBitmap(file);
    const metadata: ImageAssetMetadata = {
      assetId,
      width: bitmap.width,
      height: bitmap.height,
      format: file.type || 'image/png',
      fileSize: file.size,
    };

    const objectUrl = URL.createObjectURL(file);

    this.assets.set(assetId, {
      id: assetId,
      name: file.name,
      mimeType: file.type,
      objectUrl,
      createdAt: projectAsset.createdAt,
      metadata: null,
      imageMetadata: metadata,
      audioMetadata: null,
      imageBitmap: bitmap,
      waveform: null,
      audioBuffer: null,
      status: 'ready',
    });
    this.objectUrls.set(assetId, objectUrl);

    this.notify();
    return { assetId, metadata };
  }

  async importAudio(
    file: File,
    projectId: string
  ): Promise<{ assetId: string; metadata: AudioAssetMetadata }> {
    const assetId = `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const projectAsset: ProjectAsset = {
      id: assetId,
      projectId,
      name: file.name,
      type: 'audio',
      blob: file,
      mimeType: file.type,
      createdAt: Date.now(),
    };

    await putAsset(projectAsset);

    const arrayBuffer = await file.arrayBuffer();
    const ctx = this.getAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const metadata: AudioAssetMetadata = {
      assetId,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      fileSize: file.size,
    };

    const waveform = this.generateWaveform(audioBuffer);
    const objectUrl = URL.createObjectURL(file);

    this.assets.set(assetId, {
      id: assetId,
      name: file.name,
      mimeType: file.type,
      objectUrl,
      createdAt: projectAsset.createdAt,
      metadata: null,
      imageMetadata: null,
      audioMetadata: metadata,
      imageBitmap: null,
      waveform,
      audioBuffer,
      status: 'ready',
    });
    this.objectUrls.set(assetId, objectUrl);

    this.notify();
    return { assetId, metadata };
  }

  private generateWaveform(buffer: AudioBuffer): WaveformData {
    // Strided peak reduction (see core/waveform) — keeps a long-clip import from
    // freezing the main thread while producing a visually identical envelope.
    const { peaks, samplesPerPeak } = computeWaveformPeaks(buffer.getChannelData(0), 2048);
    return { peaks, samplesPerPeak, channels: buffer.numberOfChannels, duration: buffer.duration };
  }

  private async extractVideoAudio(source: Blob, assetId: string): Promise<void> {
    try {
      const arrayBuffer = await source.arrayBuffer();
      const ctx = this.getAudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const asset = this.assets.get(assetId);
      if (!asset) return;

      const waveform = this.generateWaveform(audioBuffer);
      // Keep the small waveform + metadata, but do NOT retain the full decoded PCM
      // for VIDEO assets — playback uses the hidden <video>, so this multi-GB buffer
      // was pure retention. Consumers that need the full buffer (export mix, silence,
      // captions, audio processing) re-decode on demand via ensureAudioBuffer().
      asset.waveform = waveform;
      asset.audioMetadata = {
        assetId,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        fileSize: source.size,
      };

      if (asset.metadata) {
        asset.metadata.hasAudio = true;
      }

      this.notify();
    } catch {
      // No audio track in file - expected for many video files
    }
  }

  private async initVideoAssetFromBlob(assetId: string, blob: Blob, fileName: string): Promise<void> {
    try {
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });
      const workerMeta = await videoDecoderPool.initAsset(assetId, file);

      const asset = this.assets.get(assetId);
      if (asset) {
        asset.metadata = {
          assetId,
          width: workerMeta.width,
          height: workerMeta.height,
          duration: workerMeta.duration,
          frameRate: workerMeta.frameRate,
          hasAudio: false,
          codec: workerMeta.codec,
          fileSize: blob.size,
        };
        asset.status = 'ready';
      }

      frameScheduler.registerAsset(assetId, assetId, workerMeta.frameRate, workerMeta.frameCount);
      videoAudioPlayer.initAudio(assetId, file);
      // Await the audio extraction (restore path only) so the caller can bound how
      // many full-PCM decodes run at once — parallel restore otherwise spikes memory
      // to N× a full decode. extractVideoAudio swallows its own errors (audio-less
      // files are expected), so this never fails the video init.
      await this.extractVideoAudio(blob, assetId);
      this.notify();
    } catch (err) {
      const asset = this.assets.get(assetId);
      if (asset) {
        // Worker init failed - treat as corrupted/missing
        asset.status = 'missing';
        console.warn(`[MediaAssetManager] Failed to init video worker for ${assetId}:`, err);
        // Delete corrupted record from video store
        if (this.currentProjectId) {
          videoAssetStore.deleteAsset(this.currentProjectId, assetId).catch(() => {});
        }
      }
      this.notify();
    }
  }

  /**
   * Restore all video assets for a project from IndexedDB.
   * Called during project load after layer data is deserialized.
   */
  async restoreProjectVideoAssets(projectId: string, videoAssetIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(videoAssetIds)];
    if (uniqueIds.length === 0) return;

    const restoreOne = async (assetId: string) => {
      // Try the dedicated video store first
      const blob = await videoAssetStore.getAsset(projectId, assetId);
      const meta = await videoAssetStore.getAssetMeta(projectId, assetId);

      if (blob && blob.size > 0) {
        const fileName = meta?.fileName ?? assetId;
        const objectUrl = URL.createObjectURL(blob);
        this.assets.set(assetId, {
          id: assetId,
          name: fileName,
          mimeType: meta?.mimeType ?? 'video/mp4',
          objectUrl,
          createdAt: meta?.importedAt ?? Date.now(),
          metadata: null,
          imageMetadata: null,
          audioMetadata: null,
          imageBitmap: null,
          waveform: null,
          audioBuffer: null,
          status: 'loading',
        });
        this.objectUrls.set(assetId, objectUrl);
        await this.initVideoAssetFromBlob(assetId, blob, fileName);
      } else {
        // Asset missing from video store - mark as missing
        this.assets.set(assetId, {
          id: assetId,
          name: meta?.fileName ?? assetId,
          mimeType: meta?.mimeType ?? 'video/mp4',
          objectUrl: '',
          createdAt: meta?.importedAt ?? 0,
          metadata: null,
          imageMetadata: null,
          audioMetadata: null,
          imageBitmap: null,
          waveform: null,
          audioBuffer: null,
          status: 'missing',
        });

        const persistWasGranted = videoAssetStore.wasPersistenceGranted();
        if (persistWasGranted) {
          console.warn(`[MediaAssetManager] Asset ${assetId} missing despite persistent storage. User may have cleared site data.`);
        } else {
          console.warn(`[MediaAssetManager] Asset ${assetId} missing. Browser may have evicted storage.`);
        }
      }
    };

    // Sequential (not Promise.all): each restore decodes the video's audio to build
    // its waveform — running them in parallel spikes memory by N× the transient
    // decode. One at a time keeps the peak bounded when opening a video-heavy project.
    for (const assetId of uniqueIds) {
      await restoreOne(assetId);
    }
    this.notify();
  }

  /**
   * Re-import a missing video asset using the same assetId.
   * All existing layers referencing this assetId are automatically repaired.
   */
  async reimportMissingAsset(assetId: string, file: File, projectId: string): Promise<VideoAssetMetadata> {
    // Clean up old registration if any
    const existing = this.assets.get(assetId);
    if (existing && existing.objectUrl) {
      URL.revokeObjectURL(existing.objectUrl);
    }

    const result = await this.importVideo(file, projectId, assetId);
    return result.metadata;
  }

  /**
   * Tear down all video runtime state for the current project.
   * Must be called before loading a new project.
   */
  async teardownCurrentProject(): Promise<void> {
    // 1. Stop audio playback
    videoAudioPlayer.pauseAll();

    // 2. Destroy all audio elements and revoke object URLs
    videoAudioPlayer.destroyAll();

    // 3. Unregister all assets from frame scheduler (closes VideoFrames, cancels in-flight)
    const videoAssetIds: string[] = [];
    for (const asset of this.assets.values()) {
      if (asset.metadata) {
        videoAssetIds.push(asset.id);
      }
    }
    for (const id of videoAssetIds) {
      frameScheduler.unregisterAsset(id);
    }

    // 4. Destroy all decoder pool workers
    for (const id of videoAssetIds) {
      await videoDecoderPool.destroyAsset(id);
    }

    // 5. Destroy all GPU textures
    videoTextureCache.destroyAll();

    // 6. Clear in-memory asset records
    for (const asset of this.assets.values()) {
      if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
      if (asset.imageBitmap) asset.imageBitmap.close();
    }
    this.assets.clear();
    this.objectUrls.clear();
    this.currentProjectId = null;

    this.notify();
  }

  async loadProjectAssets(projectId: string): Promise<void> {
    if (this.currentProjectId && this.currentProjectId !== projectId) {
      await this.teardownCurrentProject();
    }
    this.currentProjectId = projectId;

    const assets = await getAssetsByProject(projectId);
    let added = false;

    // Collect video assets to restore in parallel
    const videoAssetsToRestore: { id: string; blob: Blob; name: string; mimeType: string; createdAt: number }[] = [];

    for (const asset of assets) {
      if (this.assets.has(asset.id)) continue;

      if (asset.type === 'video') {
        // Check if blob is valid before attempting restoration
        if (asset.blob && asset.blob.size > 0) {
          videoAssetsToRestore.push({
            id: asset.id,
            blob: asset.blob,
            name: asset.name,
            mimeType: asset.mimeType,
            createdAt: asset.createdAt,
          });
        } else {
          // Blob is missing/corrupt in main store, try video store
          this.assets.set(asset.id, {
            id: asset.id,
            name: asset.name,
            mimeType: asset.mimeType,
            objectUrl: '',
            createdAt: asset.createdAt,
            metadata: null,
            imageMetadata: null,
            audioMetadata: null,
            imageBitmap: null,
            waveform: null,
            audioBuffer: null,
            status: 'loading',
          });
          added = true;
        }
      } else if (asset.type === 'image') {
        try {
          const bitmap = await createImageBitmap(asset.blob);
          const imageMetadata: ImageAssetMetadata = {
            assetId: asset.id,
            width: bitmap.width,
            height: bitmap.height,
            format: asset.mimeType,
            fileSize: asset.blob.size,
          };
          const objectUrl = URL.createObjectURL(asset.blob);
          this.assets.set(asset.id, {
            id: asset.id,
            name: asset.name,
            mimeType: asset.mimeType,
            objectUrl,
            createdAt: asset.createdAt,
            metadata: null,
            imageMetadata,
            audioMetadata: null,
            imageBitmap: bitmap,
            waveform: null,
            audioBuffer: null,
            status: 'ready',
          });
          this.objectUrls.set(asset.id, objectUrl);
          added = true;
        } catch {
          // Corrupted image, skip
        }
      } else if (asset.type === 'audio') {
        try {
          const arrayBuffer = await asset.blob.arrayBuffer();
          const ctx = this.getAudioContext();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          const audioMetadata: AudioAssetMetadata = {
            assetId: asset.id,
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            channels: audioBuffer.numberOfChannels,
            fileSize: asset.blob.size,
          };
          const waveform = this.generateWaveform(audioBuffer);
          const objectUrl = URL.createObjectURL(asset.blob);
          this.assets.set(asset.id, {
            id: asset.id,
            name: asset.name,
            mimeType: asset.mimeType,
            objectUrl,
            createdAt: asset.createdAt,
            metadata: null,
            imageMetadata: null,
            audioMetadata,
            imageBitmap: null,
            waveform,
            audioBuffer,
            status: 'ready',
          });
          this.objectUrls.set(asset.id, objectUrl);
          added = true;
        } catch {
          // Skip corrupted audio assets
        }
      }
    }

    // Restore video assets SEQUENTIALLY. Each one transiently decodes its whole
    // audio track to build the waveform (initVideoAssetFromBlob → the now-awaited
    // extractVideoAudio), so restoring in parallel would spike memory to N× a full
    // decode — an open-time OOM on video-heavy projects. One at a time bounds the peak.
    if (videoAssetsToRestore.length > 0) {
      added = true;
      // Which videos are already in the dedicated store (written at import) — so we
      // only backfill the legacy/failed-write case instead of re-writing every blob
      // (up to GBs) on every open. Cheap metadata-only query, no blob reads.
      const persisted = new Set(
        (await videoAssetStore.listProjectAssets(projectId)).map((m) => m.assetId),
      );
      for (const va of videoAssetsToRestore) {
        const objectUrl = URL.createObjectURL(va.blob);
        this.assets.set(va.id, {
          id: va.id,
          name: va.name,
          mimeType: va.mimeType,
          objectUrl,
          createdAt: va.createdAt,
          metadata: null,
          imageMetadata: null,
          audioMetadata: null,
          imageBitmap: null,
          waveform: null,
          audioBuffer: null,
          status: 'loading',
        });
        this.objectUrls.set(va.id, objectUrl);
        await this.initVideoAssetFromBlob(va.id, va.blob, va.name);

        // Backfill the dedicated store only when the blob isn't already there.
        if (!persisted.has(va.id)) {
          videoAssetStore.saveAsset(projectId, va.id, va.blob, va.name).catch(() => {});
        }
      }
    }

    if (added) this.notify();
  }

  getObjectUrl(assetId: string): string | null {
    return this.objectUrls.get(assetId) ?? null;
  }

  getMetadata(assetId: string): VideoAssetMetadata | null {
    return this.assets.get(assetId)?.metadata ?? null;
  }

  getImageMetadata(assetId: string): ImageAssetMetadata | null {
    return this.assets.get(assetId)?.imageMetadata ?? null;
  }

  getAudioMetadata(assetId: string): AudioAssetMetadata | null {
    return this.assets.get(assetId)?.audioMetadata ?? null;
  }

  getWaveform(assetId: string): WaveformData | null {
    return this.assets.get(assetId)?.waveform ?? null;
  }

  getAudioBuffer(assetId: string): AudioBuffer | null {
    return this.assets.get(assetId)?.audioBuffer ?? null;
  }

  /**
   * Return the full decoded AudioBuffer, decoding on demand from the source blob
   * if it isn't resident (video assets don't retain their PCM — see
   * extractVideoAudio). Caches the result on the asset. Async callers that need
   * the whole buffer (export mix, silence, captions, audio processing) use this;
   * `getAudioBuffer` stays a synchronous cache read.
   */
  private inflightAudioDecodes = new Map<string, Promise<AudioBuffer | null>>();
  async ensureAudioBuffer(assetId: string): Promise<AudioBuffer | null> {
    const asset = this.assets.get(assetId);
    if (!asset) return null;
    if (asset.audioBuffer) return asset.audioBuffer;
    const existing = this.inflightAudioDecodes.get(assetId);
    if (existing) return existing;
    const url = this.getObjectUrl(assetId);
    if (!url) return null;
    const decodePromise = (async () => {
      try {
        const resp = await fetch(url);
        const arr = await resp.arrayBuffer();
        const buffer = await this.getAudioContext().decodeAudioData(arr);
        const a = this.assets.get(assetId);
        if (a) a.audioBuffer = buffer;
        return buffer;
      } catch {
        return null;
      } finally {
        this.inflightAudioDecodes.delete(assetId);
      }
    })();
    this.inflightAudioDecodes.set(assetId, decodePromise);
    return decodePromise;
  }

  getImageBitmap(assetId: string): ImageBitmap | null {
    return this.assets.get(assetId)?.imageBitmap ?? null;
  }

  getAsset(assetId: string): RegisteredAsset | null {
    return this.assets.get(assetId) ?? null;
  }

  getAllAssets(): RegisteredAsset[] {
    return Array.from(this.assets.values());
  }

  getMissingAssets(): RegisteredAsset[] {
    return Array.from(this.assets.values()).filter((a) => a.status === 'missing');
  }

  /**
   * Rename an asset's display name (in-memory; affects the Media Pool label).
   * Notifies subscribers so the pool re-renders.
   */
  renameAsset(assetId: string, name: string): void {
    const asset = this.assets.get(assetId);
    if (!asset) return;
    const trimmed = name.trim();
    if (!trimmed || asset.name === trimmed) return;
    asset.name = trimmed;
    this.notify();
  }

  async removeAsset(assetId: string): Promise<void> {
    const asset = this.assets.get(assetId);
    if (asset) {
      if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
      if (asset.imageBitmap) asset.imageBitmap.close();
      if (asset.metadata) {
        frameScheduler.unregisterAsset(assetId);
        videoDecoderPool.destroyAsset(assetId);
        videoAudioPlayer.destroyAudio(assetId);
      }
      this.assets.delete(assetId);
      this.objectUrls.delete(assetId);
    }
    await deleteAsset(assetId);
    if (this.currentProjectId) {
      videoAssetStore.deleteAsset(this.currentProjectId, assetId).catch(() => {});
    }
    this.notify();
  }

  async duplicateProjectVideoAssets(sourceProjectId: string, targetProjectId: string, onProgress?: (done: number, total: number) => void): Promise<void> {
    await videoAssetStore.duplicateProjectAssets(sourceProjectId, targetProjectId, onProgress);
  }

  async deleteProjectVideoAssets(projectId: string): Promise<void> {
    await videoAssetStore.deleteProjectAssets(projectId);
  }

  async getVideoStorageStats() {
    return videoAssetStore.getStorageStats();
  }

  async findDuplicate(projectId: string, file: File): Promise<string | null> {
    return videoAssetStore.findDuplicateInProject(projectId, file);
  }

  destroy(): void {
    for (const asset of this.assets.values()) {
      if (asset.imageBitmap) asset.imageBitmap.close();
    }
    for (const url of this.objectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.assets.clear();
    this.objectUrls.clear();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const mediaAssetManager = new MediaAssetManager();
