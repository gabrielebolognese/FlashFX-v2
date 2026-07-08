import type { ProjectMetadata, ProjectScene, ProjectPreview, ProjectAsset } from '../types';

const DB_NAME = 'flashfx-projects';
const DB_VERSION = 1;

const STORES = {
  metadata: 'metadata',
  scenes: 'scenes',
  previews: 'previews',
  assets: 'assets',
} as const;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.metadata)) {
        const metaStore = db.createObjectStore(STORES.metadata, { keyPath: 'id' });
        metaStore.createIndex('modifiedAt', 'modifiedAt', { unique: false });
        metaStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.scenes)) {
        db.createObjectStore(STORES.scenes, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.previews)) {
        db.createObjectStore(STORES.previews, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.assets)) {
        const assetStore = db.createObjectStore(STORES.assets, { keyPath: 'id' });
        assetStore.createIndex('projectId', 'projectId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then((db) => {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = fn(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function transactionAll<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T[]>
): Promise<T[]> {
  return openDB().then((db) => {
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = fn(store);
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  });
}

// Metadata operations
export function getAllMetadata(): Promise<ProjectMetadata[]> {
  return transactionAll<ProjectMetadata>(STORES.metadata, 'readonly', (store) =>
    store.getAll()
  );
}

export function getMetadata(id: string): Promise<ProjectMetadata | undefined> {
  return transaction<ProjectMetadata | undefined>(STORES.metadata, 'readonly', (store) =>
    store.get(id)
  );
}

export function putMetadata(metadata: ProjectMetadata): Promise<IDBValidKey> {
  return transaction(STORES.metadata, 'readwrite', (store) =>
    store.put(metadata)
  );
}

export function deleteMetadata(id: string): Promise<undefined> {
  return transaction(STORES.metadata, 'readwrite', (store) =>
    store.delete(id)
  );
}

// Scene operations
export function getScene(id: string): Promise<ProjectScene | undefined> {
  return transaction<ProjectScene | undefined>(STORES.scenes, 'readonly', (store) =>
    store.get(id)
  );
}

export function putScene(scene: ProjectScene): Promise<IDBValidKey> {
  return transaction(STORES.scenes, 'readwrite', (store) =>
    store.put(scene)
  );
}

export function deleteScene(id: string): Promise<undefined> {
  return transaction(STORES.scenes, 'readwrite', (store) =>
    store.delete(id)
  );
}

// Preview operations
export function getPreview(id: string): Promise<ProjectPreview | undefined> {
  return transaction<ProjectPreview | undefined>(STORES.previews, 'readonly', (store) =>
    store.get(id)
  );
}

export function putPreview(preview: ProjectPreview): Promise<IDBValidKey> {
  return transaction(STORES.previews, 'readwrite', (store) =>
    store.put(preview)
  );
}

export function deletePreview(id: string): Promise<undefined> {
  return transaction(STORES.previews, 'readwrite', (store) =>
    store.delete(id)
  );
}

// Asset operations
export function getAssetsByProject(projectId: string): Promise<ProjectAsset[]> {
  return openDB().then((db) => {
    return new Promise<ProjectAsset[]>((resolve, reject) => {
      const tx = db.transaction(STORES.assets, 'readonly');
      const store = tx.objectStore(STORES.assets);
      const index = store.index('projectId');
      const request = index.getAll(projectId);
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  });
}

export function putAsset(asset: ProjectAsset): Promise<IDBValidKey> {
  return transaction(STORES.assets, 'readwrite', (store) =>
    store.put(asset)
  );
}

export function deleteAsset(id: string): Promise<undefined> {
  return transaction(STORES.assets, 'readwrite', (store) =>
    store.delete(id)
  );
}

export function deleteAssetsByProject(projectId: string): Promise<void> {
  return openDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.assets, 'readwrite');
      const store = tx.objectStore(STORES.assets);
      const index = store.index('projectId');
      const request = index.openCursor(projectId);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}
