interface TextureRecord {
  texture: GPUTexture;
  width: number;
  height: number;
  frameIndex: number;
}

// Hard cap on live video textures. Previously this Map was UNBOUNDED and only pruned when a layer was
// explicitly deleted — so undo-of-add, project load, precompose, split etc. orphaned a full-res
// texture (~8MB@1080p, ~33MB@4K) per layerId forever, growing VRAM until WebGPU lost the device and
// took the whole canvas down. Insertion order is the LRU (touch = re-insert at the end); the oldest
// (least-recently drawn) texture is evicted past the cap, so memory is bounded regardless of edits.
const MAX_TEXTURES = 24;

class VideoTextureCache {
  private device: GPUDevice | null = null;
  private textures = new Map<string, TextureRecord>();
  private usedDirectUpload: boolean | null = null;

  /** Store the GPU device reference. Call once after device creation. */
  init(device: GPUDevice): void {
    this.device = device;
  }

  /** Move a layer to the most-recently-used end of the LRU. */
  private touch(layerId: string): void {
    const record = this.textures.get(layerId);
    if (record) { this.textures.delete(layerId); this.textures.set(layerId, record); }
  }

  /** Evict least-recently-used textures until at or under the cap (a bounded-VRAM backstop). */
  private enforceCap(): void {
    while (this.textures.size > MAX_TEXTURES) {
      const oldest = this.textures.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.textures.get(oldest)?.texture.destroy();
      this.textures.delete(oldest);
    }
  }

  /**
   * Free textures for layers that are no longer present in the current resolved frame — the real fix
   * for the orphan-on-undo/load/precompose leak. The renderer passes the set of video layer ids it
   * actually drew this frame; everything else is destroyed immediately (not just eventually via LRU).
   */
  retainOnly(liveLayerIds: Set<string>): void {
    for (const [id, record] of this.textures) {
      if (!liveLayerIds.has(id)) { record.texture.destroy(); this.textures.delete(id); }
    }
  }

  /**
   * Upload a VideoFrame or ImageBitmap to the GPU texture for a layer.
   *
   * Does NOT close the source: the frameScheduler owns every buffered frame and
   * closes it on eviction/unregister. Closing here would detach a frame the
   * scheduler still holds, so the next re-render of the same frame (e.g. paused
   * on a frame) would call copyExternalImageToTexture on a detached frame and
   * throw. The copy reads the source synchronously, so it stays valid.
   */
  uploadFrame(layerId: string, frameIndex: number, source: VideoFrame | ImageBitmap): void {
    if (!this.device) {
      return;
    }

    const width = source instanceof VideoFrame ? source.displayWidth : source.width;
    const height = source instanceof VideoFrame ? source.displayHeight : source.height;

    let record = this.textures.get(layerId);
    if (record) this.textures.delete(layerId); // re-inserted below → moves to MRU end (LRU touch)
    if (!record || record.width !== width || record.height !== height) {
      if (record) {
        record.texture.destroy();
      }
      const texture = this.device.createTexture({
        size: { width, height },
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      record = { texture, width, height, frameIndex };
    }
    this.textures.set(layerId, record);

    this.copyToTexture(record.texture, source, width, height);
    record.frameIndex = frameIndex;
    this.enforceCap();
  }

  // Cached fallback surface (see fallbackUpload) — reused across frames instead of allocating a fresh
  // OffscreenCanvas + ImageBitmap every upload once the direct path is known to be unavailable.
  private fbCanvas: OffscreenCanvas | null = null;
  private fbCtx: OffscreenCanvasRenderingContext2D | null = null;

  private copyToTexture(texture: GPUTexture, source: VideoFrame | ImageBitmap, width: number, height: number): void {
    if (!this.device) return;

    // Sticky: once the direct path has failed on this device, don't keep re-throwing every frame —
    // go straight to the fallback.
    if (this.usedDirectUpload === false) {
      this.fallbackUpload(texture, source, width, height);
      return;
    }

    try {
      this.device.queue.copyExternalImageToTexture(
        { source: source as any },
        { texture },
        { width, height }
      );
      this.usedDirectUpload = true;
    } catch {
      this.usedDirectUpload = false;
      this.fallbackUpload(texture, source, width, height);
    }
  }

  private fallbackUpload(texture: GPUTexture, source: VideoFrame | ImageBitmap, width: number, height: number): void {
    if (!this.device) return;

    if (!this.fbCanvas || this.fbCanvas.width !== width || this.fbCanvas.height !== height) {
      this.fbCanvas = new OffscreenCanvas(width, height);
      this.fbCtx = this.fbCanvas.getContext('2d');
    }
    const ctx = this.fbCtx;
    if (!ctx) return;

    ctx.drawImage(source as any, 0, 0, width, height);
    // Copy straight from the canvas — no per-frame transferToImageBitmap allocation.
    this.device.queue.copyExternalImageToTexture(
      { source: this.fbCanvas },
      { texture },
      { width, height }
    );
  }

  /** Get the current GPU texture for a layer, or null if none uploaded. */
  getTexture(layerId: string): GPUTexture | null {
    const record = this.textures.get(layerId);
    if (!record) return null;
    this.touch(layerId); // drawn this frame → keep it MRU so the cap never evicts a visible clip
    return record.texture;
  }

  /** Get the frame index currently uploaded to a layer's texture. */
  getCurrentFrameIndex(layerId: string): number {
    return this.textures.get(layerId)?.frameIndex ?? -1;
  }

  /** Destroy the texture for a layer. */
  destroyLayer(layerId: string): void {
    const record = this.textures.get(layerId);
    if (record) {
      record.texture.destroy();
      this.textures.delete(layerId);
    }
  }

  /** Flush all textures but keep the device reference for re-upload. */
  flush(): void {
    for (const record of this.textures.values()) {
      record.texture.destroy();
    }
    this.textures.clear();
  }

  /** Destroy all textures and release device. Call on context loss or teardown. */
  destroyAll(): void {
    for (const record of this.textures.values()) {
      record.texture.destroy();
    }
    this.textures.clear();
    this.device = null;
  }
}

export const videoTextureCache = new VideoTextureCache();
