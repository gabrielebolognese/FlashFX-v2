/**
 * VideoAssetManager — singleton file registry.
 * File objects cannot be stored in React state (not JSON-serializable).
 * This class holds the actual File references keyed by assetId.
 */
class VideoAssetManager {
  private files = new Map<string, File>();
  private filmstrips = new Map<string, string[]>();

  registerFile(assetId: string, file: File): void {
    this.files.set(assetId, file);
  }

  getFile(assetId: string): File | undefined {
    return this.files.get(assetId);
  }

  removeFile(assetId: string): void {
    this.files.delete(assetId);
    this.filmstrips.delete(assetId);
  }

  hasFile(assetId: string): boolean {
    return this.files.has(assetId);
  }

  setFilmstrip(assetId: string, frames: string[]): void {
    this.filmstrips.set(assetId, frames);
  }

  getFilmstrip(assetId: string): string[] | undefined {
    return this.filmstrips.get(assetId);
  }
}

export const videoAssetManager = new VideoAssetManager();
