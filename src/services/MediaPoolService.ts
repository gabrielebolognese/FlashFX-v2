export interface MediaAsset {
  id: string;
  name: string;
  type: 'image';
  data: string;
  thumbnail?: string;
  width: number;
  height: number;
  size: number;
  uploadedAt: number;
  mimeType: string;
}

const DB_NAME = 'flashfx-media-pool';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

class MediaPoolService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('uploadedAt', 'uploadedAt', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private async getDB(): Promise<IDBDatabase> {
    await this.init();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  async addAsset(asset: MediaAsset): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(asset);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAsset(id: string): Promise<MediaAsset | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllAssets(): Promise<MediaAsset[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('uploadedAt');
      const request = index.openCursor(null, 'prev');
      const assets: MediaAsset[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          assets.push(cursor.value);
          cursor.continue();
        } else {
          resolve(assets);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async deleteAsset(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateAsset(id: string, updates: Partial<MediaAsset>): Promise<void> {
    const db = await this.getDB();
    return new Promise(async (resolve, reject) => {
      const asset = await this.getAsset(id);
      if (!asset) {
        reject(new Error('Asset not found'));
        return;
      }

      const updatedAsset = { ...asset, ...updates };
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(updatedAsset);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async duplicateAsset(id: string): Promise<MediaAsset> {
    const original = await this.getAsset(id);
    if (!original) {
      throw new Error('Asset not found');
    }

    const duplicate: MediaAsset = {
      ...original,
      id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${original.name} Copy`,
      uploadedAt: Date.now()
    };

    await this.addAsset(duplicate);
    return duplicate;
  }

  async clearAll(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getStorageUsage(): Promise<{ count: number; totalSize: number }> {
    const assets = await this.getAllAssets();
    const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);
    return { count: assets.length, totalSize };
  }

  generateThumbnail(imageData: string, maxSize: number = 150): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(imageData);
      img.src = imageData;
    });
  }

  async createAssetFromFile(file: File): Promise<MediaAsset> {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = base64;
    });

    const thumbnail = await this.generateThumbnail(base64);

    const asset: MediaAsset = {
      id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      type: 'image',
      data: base64,
      thumbnail,
      width: img.width,
      height: img.height,
      size: file.size,
      uploadedAt: Date.now(),
      mimeType: file.type || 'image/png'
    };

    return asset;
  }

  async createAssetFromUrl(url: string, name: string = 'Imported Image'): Promise<MediaAsset> {
    const response = await fetch(url);
    const blob = await response.blob();

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = base64;
    });

    const thumbnail = await this.generateThumbnail(base64);

    const asset: MediaAsset = {
      id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      type: 'image',
      data: base64,
      thumbnail,
      width: img.width,
      height: img.height,
      size: blob.size,
      uploadedAt: Date.now(),
      mimeType: blob.type || 'image/png'
    };

    return asset;
  }
}

export const mediaPoolService = new MediaPoolService();
