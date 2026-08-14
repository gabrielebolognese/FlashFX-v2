// Local, account-free persistence for the media-pool library (Brands + Saved
// assets). Stored in its OWN IndexedDB (`flashfx-library`, separate from the
// projects DB) so it persists across reloads without touching the projects
// schema. Image/audio bytes are kept as real Blobs — object URLs are derived at
// runtime — so nothing depends on ephemeral blob: URLs surviving a refresh.

const DB_NAME = 'flashfx-library';
const DB_VERSION = 1;

const STORES = {
  brandColors: 'brandColors',
  brandAssets: 'brandAssets',
  savedAssets: 'savedAssets',
} as const;

export interface BrandColorRecord {
  id: string;
  hex: string;
  sortOrder: number;
}

export interface BrandAssetRecord {
  id: string;
  name: string;
  blob: Blob;
  isLogo: boolean;
  sortOrder: number;
  width: number;
  height: number;
}

export interface SavedAssetRecord {
  id: string;
  name: string;
  blob: Blob;
  assetType: 'image' | 'audio';
  width: number;
  height: number;
  duration: number | null;
  mimeType: string;
  createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.brandColors)) db.createObjectStore(STORES.brandColors, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.brandAssets)) db.createObjectStore(STORES.brandAssets, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.savedAssets)) db.createObjectStore(STORES.savedAssets, { keyPath: 'id' });
    };
    request.onsuccess = (event) => { dbInstance = (event.target as IDBOpenDBRequest).result; resolve(dbInstance); };
    request.onerror = () => reject(request.error);
  });
}

function getAll<T>(storeName: string): Promise<T[]> {
  return openDB().then((db) => new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(req.error);
  }));
}

function put<T>(storeName: string, value: T): Promise<void> {
  return openDB().then((db) => new Promise<void>((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

function remove(storeName: string, id: string): Promise<void> {
  return openDB().then((db) => new Promise<void>((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

export const brandColorsDb = {
  all: () => getAll<BrandColorRecord>(STORES.brandColors),
  put: (r: BrandColorRecord) => put(STORES.brandColors, r),
  delete: (id: string) => remove(STORES.brandColors, id),
};

export const brandAssetsDb = {
  all: () => getAll<BrandAssetRecord>(STORES.brandAssets),
  put: (r: BrandAssetRecord) => put(STORES.brandAssets, r),
  delete: (id: string) => remove(STORES.brandAssets, id),
};

export const savedAssetsDb = {
  all: () => getAll<SavedAssetRecord>(STORES.savedAssets),
  put: (r: SavedAssetRecord) => put(STORES.savedAssets, r),
  delete: (id: string) => remove(STORES.savedAssets, id),
};

/** UUID for library records (UI-side; crypto is available in the browser). */
export function libraryId(): string {
  return crypto.randomUUID();
}
