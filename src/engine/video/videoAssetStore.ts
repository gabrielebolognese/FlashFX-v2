const DB_NAME = 'flashfx-video-assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const CHUNK_THRESHOLD = 512 * 1024 * 1024; // 512 MB
const CHUNK_SIZE = 256 * 1024 * 1024; // 256 MB

export interface VideoAssetRecord {
  assetId: string;
  projectId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  blob: Blob | null;
  chunkCount: number;
  importedAt: number;
  lastAccessedAt: number;
  rotation: number;
  sampleTimestamps: Float64Array | null;
}

export type VideoAssetMetaOnly = Omit<VideoAssetRecord, 'blob' | 'sampleTimestamps'>;

export interface StorageStats {
  usedBytes: number;
  estimatedQuota: number;
  estimatedUsage: number;
}

let dbInstance: IDBDatabase | null = null;
let degradedMode = false;

function openDB(): Promise<IDBDatabase> {
  if (degradedMode) return Promise.reject(new Error('Video storage unavailable'));
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      degradedMode = true;
      console.error('[VideoAssetStore] IndexedDB unavailable:', err);
      reject(new Error('Video storage unavailable'));
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'assetId' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    request.onerror = () => {
      degradedMode = true;
      console.error('[VideoAssetStore] Failed to open database:', request.error);
      reject(request.error);
    };
  });
}

async function testAvailability(): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const testKey = '__test__';
    store.put({ assetId: testKey, projectId: '', fileName: '', fileSize: 0, mimeType: '', blob: null, chunkCount: 0, importedAt: 0, lastAccessedAt: 0, rotation: 0, sampleTimestamps: null });
    store.delete(testKey);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    degradedMode = true;
    return false;
  }
}

class VideoAssetStore {
  private _persistenceGranted: boolean | null = null;

  isDegraded(): boolean {
    return degradedMode;
  }

  async init(): Promise<void> {
    await testAvailability();
  }

  async requestPersistence(): Promise<boolean> {
    if (this._persistenceGranted !== null) return this._persistenceGranted;
    try {
      if (navigator.storage && navigator.storage.persist) {
        this._persistenceGranted = await navigator.storage.persist();
        if (this._persistenceGranted) {
          localStorage.setItem('flashfx-storage-persistent', '1');
        }
      } else {
        this._persistenceGranted = false;
      }
    } catch {
      this._persistenceGranted = false;
    }
    return this._persistenceGranted;
  }

  wasPersistenceGranted(): boolean {
    if (this._persistenceGranted !== null) return this._persistenceGranted;
    return localStorage.getItem('flashfx-storage-persistent') === '1';
  }

  async saveAsset(projectId: string, assetId: string, file: File | Blob, fileName?: string, rotation?: number, sampleTimestamps?: Float64Array | null): Promise<void> {
    if (degradedMode) return;

    const record: VideoAssetRecord = {
      assetId,
      projectId,
      fileName: fileName ?? (file instanceof File ? file.name : assetId),
      fileSize: file.size,
      mimeType: file instanceof File ? file.type : (file.type || 'video/mp4'),
      blob: null,
      chunkCount: 0,
      importedAt: Date.now(),
      lastAccessedAt: Date.now(),
      rotation: rotation ?? 0,
      sampleTimestamps: sampleTimestamps ?? null,
    };

    try {
      if (file.size > CHUNK_THRESHOLD) {
        await this.saveChunked(record, file);
      } else {
        record.blob = file;
        record.chunkCount = 0;
        const db = await openDB();
        await this.putRecord(db, record);
      }
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError') {
        const freed = await this.evictOldAssets(file.size, projectId);
        if (freed > 0) {
          try {
            if (file.size > CHUNK_THRESHOLD) {
              await this.saveChunked(record, file);
            } else {
              record.blob = file;
              const db = await openDB();
              await this.putRecord(db, record);
            }
            return;
          } catch (retryErr: any) {
            if (retryErr?.name === 'QuotaExceededError') {
              throw new Error(
                `Storage full: could not save video (${formatBytes(file.size)}). Free space by removing videos from other projects.`
              );
            }
            throw retryErr;
          }
        }
        throw new Error(
          `Storage full: could not save video (${formatBytes(file.size)}). Free space by removing videos from other projects.`
        );
      }
      throw err;
    }
  }

  private async saveChunked(record: VideoAssetRecord, file: File | Blob): Promise<void> {
    const chunkCount = Math.ceil(file.size / CHUNK_SIZE);
    record.blob = null;
    record.chunkCount = chunkCount;

    const db = await openDB();
    await this.putRecord(db, record);

    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkRecord = {
        assetId: `${record.assetId}-chunk-${i}`,
        projectId: record.projectId,
        fileName: '',
        fileSize: chunk.size,
        mimeType: '',
        blob: chunk,
        chunkCount: -1,
        importedAt: record.importedAt,
        lastAccessedAt: record.lastAccessedAt,
        rotation: 0,
        sampleTimestamps: null,
      };
      await this.putRecord(db, chunkRecord);
    }
  }

  private putRecord(db: IDBDatabase, record: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  }

  async getAsset(projectId: string, assetId: string): Promise<Blob | null> {
    if (degradedMode) return null;

    try {
      const db = await openDB();
      const record = await this.getRecord(db, assetId);
      if (!record) return null;
      if (record.projectId !== projectId) return null;

      this.updateLastAccessed(db, assetId);

      if (record.chunkCount > 0) {
        return this.readChunked(db, assetId, record.chunkCount);
      }

      if (!record.blob || record.blob.size === 0) {
        await this.deleteRecord(db, assetId);
        return null;
      }

      return record.blob;
    } catch {
      return null;
    }
  }

  async getAssetMeta(projectId: string, assetId: string): Promise<VideoAssetRecord | null> {
    if (degradedMode) return null;
    try {
      const db = await openDB();
      const record = await this.getRecord(db, assetId);
      if (!record || record.projectId !== projectId) return null;
      return record;
    } catch {
      return null;
    }
  }

  private async readChunked(db: IDBDatabase, assetId: string, chunkCount: number): Promise<Blob | null> {
    const parts: Blob[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkRecord = await this.getRecord(db, `${assetId}-chunk-${i}`);
      if (!chunkRecord?.blob) return null;
      parts.push(chunkRecord.blob);
    }
    return new Blob(parts);
  }

  private getRecord(db: IDBDatabase, key: string): Promise<VideoAssetRecord | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private updateLastAccessed(db: IDBDatabase, assetId: string): void {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(assetId);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.lastAccessedAt = Date.now();
          store.put(record);
        }
      };
    } catch {
      // Non-critical, ignore
    }
  }

  private deleteRecord(db: IDBDatabase, assetId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(assetId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    if (degradedMode) return;
    try {
      const db = await openDB();
      const record = await this.getRecord(db, assetId);
      if (!record || record.projectId !== projectId) return;

      if (record.chunkCount > 0) {
        for (let i = 0; i < record.chunkCount; i++) {
          await this.deleteRecord(db, `${assetId}-chunk-${i}`);
        }
      }
      await this.deleteRecord(db, assetId);
    } catch {
      // Silently fail in degraded mode
    }
  }

  async deleteProjectAssets(projectId: string): Promise<void> {
    if (degradedMode) return;
    try {
      const db = await openDB();
      const records = await this.getByIndex(db, projectId);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const record of records) {
        store.delete(record.assetId);
        if (record.chunkCount > 0) {
          for (let i = 0; i < record.chunkCount; i++) {
            store.delete(`${record.assetId}-chunk-${i}`);
          }
        }
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore errors in cleanup
    }
  }

  async listProjectAssets(projectId: string): Promise<VideoAssetMetaOnly[]> {
    if (degradedMode) return [];
    try {
      const db = await openDB();
      const records = await this.getByIndex(db, projectId);
      return records
        .filter((r) => r.chunkCount >= 0)
        .map(({ blob: _b, sampleTimestamps: _s, ...rest }) => rest);
    } catch {
      return [];
    }
  }

  async getStorageStats(): Promise<StorageStats> {
    let usedBytes = 0;
    let estimatedQuota = 0;
    let estimatedUsage = 0;

    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        estimatedQuota = est.quota ?? 0;
        estimatedUsage = est.usage ?? 0;
      }
    } catch {
      // Ignore
    }

    if (!degradedMode) {
      try {
        const db = await openDB();
        const records = await this.getAllRecords(db);
        for (const r of records) {
          if (r.chunkCount >= 0) {
            usedBytes += r.fileSize;
          }
        }
      } catch {
        // Ignore
      }
    }

    return { usedBytes, estimatedQuota, estimatedUsage };
  }

  async evictOldAssets(targetBytesToFree: number, excludeProjectId?: string): Promise<number> {
    if (degradedMode) return 0;

    try {
      const db = await openDB();
      const records = await this.getAllRecords(db);
      const evictable = records
        .filter((r) => r.chunkCount >= 0 && r.projectId !== excludeProjectId)
        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

      let freed = 0;
      for (const record of evictable) {
        if (freed >= targetBytesToFree) break;
        if (record.chunkCount > 0) {
          for (let i = 0; i < record.chunkCount; i++) {
            await this.deleteRecord(db, `${record.assetId}-chunk-${i}`);
          }
        }
        await this.deleteRecord(db, record.assetId);
        freed += record.fileSize;
      }
      return freed;
    } catch {
      return 0;
    }
  }

  async duplicateProjectAssets(sourceProjectId: string, targetProjectId: string, onProgress?: (done: number, total: number) => void): Promise<void> {
    if (degradedMode) return;
    const assets = await this.listProjectAssets(sourceProjectId);
    for (let i = 0; i < assets.length; i++) {
      const blob = await this.getAsset(sourceProjectId, assets[i].assetId);
      if (blob) {
        await this.saveAsset(targetProjectId, assets[i].assetId, blob, assets[i].fileName, assets[i].rotation);
      }
      onProgress?.(i + 1, assets.length);
    }
  }

  async computeFileFingerprint(file: File | Blob): Promise<string> {
    const headSize = Math.min(65536, file.size);
    const tailSize = Math.min(65536, file.size);
    const headSlice = await file.slice(0, headSize).arrayBuffer();
    const tailSlice = await file.slice(Math.max(0, file.size - tailSize)).arrayBuffer();

    let hash = file.size;
    const headView = new Uint8Array(headSlice);
    const tailView = new Uint8Array(tailSlice);
    for (let i = 0; i < headView.length; i += 64) {
      hash = ((hash << 5) - hash + headView[i]) | 0;
    }
    for (let i = 0; i < tailView.length; i += 64) {
      hash = ((hash << 5) - hash + tailView[i]) | 0;
    }
    return `${file.size}-${(hash >>> 0).toString(36)}`;
  }

  async findDuplicateInProject(projectId: string, file: File | Blob): Promise<string | null> {
    if (degradedMode) return null;
    const fingerprint = await this.computeFileFingerprint(file);
    const assets = await this.listProjectAssets(projectId);
    for (const asset of assets) {
      if (asset.fileSize === file.size) {
        const existingBlob = await this.getAsset(projectId, asset.assetId);
        if (existingBlob) {
          const existingFp = await this.computeFileFingerprint(existingBlob);
          if (existingFp === fingerprint) {
            return asset.assetId;
          }
        }
      }
    }
    return null;
  }

  async resetStorage(): Promise<void> {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => {
        degradedMode = false;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private getByIndex(db: IDBDatabase, projectId: string): Promise<VideoAssetRecord[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('projectId');
      const request = index.getAll(projectId);
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  }

  private getAllRecords(db: IDBDatabase): Promise<VideoAssetRecord[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const videoAssetStore = new VideoAssetStore();
