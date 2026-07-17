interface TextureRecord {
  texture: GPUTexture;
  width: number;
  height: number;
  frameIndex: number;
}

class VideoTextureCache {
  private device: GPUDevice | null = null;
  private textures = new Map<string, TextureRecord>();
  private usedDirectUpload: boolean | null = null;

  /** Store the GPU device reference. Call once after device creation. */
  init(device: GPUDevice): void {
    this.device = device;
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
      this.textures.set(layerId, record);
    }

    this.copyToTexture(record.texture, source, width, height);
    record.frameIndex = frameIndex;
  }

  private copyToTexture(texture: GPUTexture, source: VideoFrame | ImageBitmap, width: number, height: number): void {
    if (!this.device) return;

    try {
      this.device.queue.copyExternalImageToTexture(
        { source: source as any },
        { texture },
        { width, height }
      );
      if (this.usedDirectUpload === null) {
        this.usedDirectUpload = true;
      }
    } catch {
      if (this.usedDirectUpload === null) {
        this.usedDirectUpload = false;
      }
      this.fallbackUpload(texture, source, width, height);
    }
  }

  private fallbackUpload(texture: GPUTexture, source: VideoFrame | ImageBitmap, width: number, height: number): void {
    if (!this.device) return;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(source as any, 0, 0, width, height);
    const bitmap = canvas.transferToImageBitmap();

    this.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      { width: bitmap.width, height: bitmap.height }
    );

    bitmap.close();
  }

  /** Get the current GPU texture for a layer, or null if none uploaded. */
  getTexture(layerId: string): GPUTexture | null {
    return this.textures.get(layerId)?.texture ?? null;
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
