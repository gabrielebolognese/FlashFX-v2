import type { RenderElement } from '../core/types';

interface CachedTexture {
  image: HTMLImageElement;
  lastUsed: number;
  byteSize: number;
}

export class ImageRenderer {
  private textureCache: Map<string, CachedTexture> = new Map();
  private loadingPromises: Map<string, Promise<HTMLImageElement>> = new Map();
  private maxCacheSize = 50;
  private totalBytes = 0;
  private maxBytes = 256 * 1024 * 1024;

  async preloadImages(elements: RenderElement[]): Promise<void> {
    const imageElements = elements.filter(
      (el) => el.type === 'image' && el.imageData
    );
    const promises = imageElements.map((el) => this.loadTexture(el.id, el.imageData!));
    await Promise.allSettled(promises);
  }

  private async loadTexture(id: string, src: string): Promise<HTMLImageElement> {
    const cached = this.textureCache.get(id);
    if (cached) {
      cached.lastUsed = performance.now();
      return cached.image;
    }

    const existing = this.loadingPromises.get(id);
    if (existing) return existing;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const byteSize = img.naturalWidth * img.naturalHeight * 4;
        this.textureCache.set(id, {
          image: img,
          lastUsed: performance.now(),
          byteSize,
        });
        this.totalBytes += byteSize;
        this.loadingPromises.delete(id);
        this.evictIfNeeded();
        resolve(img);
      };
      img.onerror = () => {
        this.loadingPromises.delete(id);
        reject(new Error(`Failed to load image: ${id}`));
      };
      img.src = src;
    });

    this.loadingPromises.set(id, promise);
    return promise;
  }

  render(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    const cached = this.textureCache.get(el.id);
    if (!cached) {
      if (el.imageData) {
        this.loadTexture(el.id, el.imageData);
      }
      return;
    }

    cached.lastUsed = performance.now();
    const { x, y, width, height, borderRadius } = el;
    const radius = borderRadius || el.cornerRadius || 0;

    if (radius > 0) {
      ctx.save();
      ctx.beginPath();
      this.roundRect(ctx, x, y, width, height, radius);
      ctx.clip();
      ctx.drawImage(cached.image, x, y, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(cached.image, x, y, width, height);
    }
  }

  getTexture(id: string): HTMLImageElement | null {
    const cached = this.textureCache.get(id);
    if (cached) {
      cached.lastUsed = performance.now();
      return cached.image;
    }
    return null;
  }

  hasTexture(id: string): boolean {
    return this.textureCache.has(id);
  }

  private evictIfNeeded(): void {
    while (
      (this.textureCache.size > this.maxCacheSize || this.totalBytes > this.maxBytes) &&
      this.textureCache.size > 0
    ) {
      let oldestKey = '';
      let oldestTime = Infinity;

      for (const [key, entry] of this.textureCache) {
        if (entry.lastUsed < oldestTime) {
          oldestTime = entry.lastUsed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.textureCache.get(oldestKey);
        if (entry) this.totalBytes -= entry.byteSize;
        this.textureCache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  clearCache(): void {
    this.textureCache.clear();
    this.loadingPromises.clear();
    this.totalBytes = 0;
  }

  getCacheStats(): { entries: number; bytes: number } {
    return { entries: this.textureCache.size, bytes: this.totalBytes };
  }
}
