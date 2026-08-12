import { create } from 'zustand';
import * as opentype from 'opentype.js';
import { fireFontsChanged } from './fonts';

// User-imported fonts. Stored in their OWN IndexedDB database (not per-project), so an imported
// font is available to EVERY project and survives reloads. The font file bytes live in IDB; the
// browser gets each face registered via the FontFace API at boot (and on import), keyed by the
// family name so `fontFamily: "<family>"` renders it through the normal Canvas-2D text path.

const DB_NAME = 'flashfx-fonts';
const DB_VERSION = 1;
const STORE = 'fonts';

/** Max accepted font file size — a guard against accidental huge uploads (fonts are ≪ this). */
export const MAX_FONT_BYTES = 20 * 1024 * 1024;

interface CustomFontRecord {
  id: string;
  family: string;
  fileName: string;
  data: ArrayBuffer;
  addedAt: number;
}

export interface CustomFontMeta {
  id: string;
  family: string;
  fileName: string;
}

let dbInstance: IDBDatabase | null = null;
let degraded = false;

function openDB(): Promise<IDBDatabase> {
  if (degraded) return Promise.reject(new Error('Font storage unavailable'));
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      degraded = true;
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };
    request.onerror = () => { degraded = true; reject(request.error); };
  });
}

async function idbGetAll(): Promise<CustomFontRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as CustomFontRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(rec: CustomFontRecord): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Register a face with the browser under its family name (buffer source — the browser decodes
 *  ttf/otf/woff/woff2). Failures are swallowed so one bad font can't break the rest. */
async function registerFace(family: string, data: ArrayBuffer): Promise<void> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  try {
    const face = new FontFace(family, data);
    (document.fonts as FontFaceSet).add(face);
    await face.load();
  } catch { /* unsupported/broken font — skip */ }
}

/** Derive a display family name: prefer the font's own name table, fall back to the filename.
 *  opentype.js can't decode WOFF2, so that path always falls back to the filename (which still
 *  registers correctly via FontFace). */
function deriveFamily(data: ArrayBuffer, fileName: string): string {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  try {
    const font = opentype.parse(data);
    const names = font.names as unknown as Record<string, Record<string, string> | undefined>;
    const pick = (n?: Record<string, string>) => (n ? (n.en ?? Object.values(n)[0]) : undefined);
    const fam = pick(names.fontFamily) ?? pick(names.preferredFamily) ?? pick(names.fullName);
    if (fam && fam.trim()) return fam.trim();
  } catch { /* not parseable (e.g. woff2) — use the filename */ }
  return stem || 'Custom Font';
}

let uid = 0;
function newId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `cf_${Date.now().toString(36)}_${++uid}_${rnd}`;
}

interface CustomFontState {
  fonts: CustomFontMeta[];
  hydrated: boolean;
  /** Load every stored font, register it with the browser, and populate the list. Idempotent. */
  hydrate: () => Promise<void>;
  /** Import a font file: parse its family, persist it, register it, add to the shared list. Returns the family. */
  importFont: (file: File) => Promise<string>;
  /** Remove a custom font everywhere (IDB + browser + list). */
  removeFont: (id: string) => Promise<void>;
}

let hydratePromise: Promise<void> | null = null;

export const useCustomFontStore = create<CustomFontState>((set, get) => ({
  fonts: [],
  hydrated: false,
  hydrate: () => {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      let recs: CustomFontRecord[] = [];
      try { recs = await idbGetAll(); } catch { /* storage unavailable — degrade to no custom fonts */ }
      await Promise.allSettled(recs.map((r) => registerFace(r.family, r.data)));
      set({ fonts: recs.map((r) => ({ id: r.id, family: r.family, fileName: r.fileName })), hydrated: true });
      if (recs.length > 0) fireFontsChanged();
    })();
    return hydratePromise;
  },
  importFont: async (file) => {
    if (file.size > MAX_FONT_BYTES) {
      throw new Error(`Font is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max ${MAX_FONT_BYTES / 1024 / 1024} MB).`);
    }
    const data = await file.arrayBuffer();
    const family = deriveFamily(data, file.name);
    const rec: CustomFontRecord = { id: newId(), family, fileName: file.name, data, addedAt: Date.now() };
    await idbPut(rec);
    await registerFace(family, data);
    // De-dupe the list by family (re-importing the same family just refreshes it).
    const existing = get().fonts.filter((f) => f.family !== family);
    set({ fonts: [...existing, { id: rec.id, family, fileName: file.name }] });
    fireFontsChanged();
    return family;
  },
  removeFont: async (id) => {
    try { await idbDelete(id); } catch { /* ignore */ }
    set({ fonts: get().fonts.filter((f) => f.id !== id) });
    fireFontsChanged();
  },
}));

/** Hydrate custom fonts at boot (call once from the app entry). */
export function hydrateCustomFonts(): Promise<void> {
  return useCustomFontStore.getState().hydrate();
}
