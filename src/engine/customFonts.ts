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

/** Max accepted font file size - a guard against accidental huge uploads (fonts are ≪ this). */
export const MAX_FONT_BYTES = 20 * 1024 * 1024;

interface CustomFontRecord {
  id: string;
  family: string;
  fileName: string;
  data: ArrayBuffer;
  addedAt: number;
  /** Face descriptors (B52). Absent on fonts imported before them: registered as a plain face. */
  weight?: number;
  style?: FaceStyle;
}

type FaceStyle = 'normal' | 'italic';

export interface CustomFontMeta {
  id: string;
  family: string;
  fileName: string;
  weight?: number;
  style?: FaceStyle;
}

/** Overrides for an import (the agent path); anything omitted is read from the font itself. */
export interface ImportFontOptions {
  /** Family name to register the face under (default: the font's own name table, else the file name). */
  family?: string;
  /** Weight descriptor 1..1000 (default: the font's OS/2 weight class when readable). */
  weight?: number;
  /** Style descriptor (default: the font's italic flag when readable). */
  style?: FaceStyle;
}

export type FontFileFormat = 'woff2' | 'woff' | 'ttf' | 'otf';

/** What an import registered (B52: agent.importFont returns it). */
export interface ImportedFontFace {
  id: string;
  family: string;
  fileName: string;
  /** Weight descriptor the face was registered with (null = any weight resolves to it). */
  weight: number | null;
  style: FaceStyle | null;
  format: FontFileFormat;
  /** Stored in the browser's font library (IndexedDB), so it survives reloads and serves every project. */
  persisted: boolean;
}

/** Sniff the font container from its magic bytes (null = not a font file). */
export function sniffFontFormat(data: ArrayBuffer): FontFileFormat | null {
  if (data.byteLength < 4) return null;
  const b = new Uint8Array(data, 0, 4);
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'true' || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return 'ttf';
  return null;
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

/** Register a face with the browser under its family name (buffer source - the browser decodes
 *  ttf/otf/woff/woff2), with weight / style descriptors when known so several faces of one family
 *  (Regular + Bold + Italic) resolve like bundled ones. Failures are swallowed so one bad font
 *  can't break the rest; returns whether the browser accepted the face. */
async function registerFace(family: string, data: ArrayBuffer, weight?: number, style?: FaceStyle): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;
  try {
    const descriptors: FontFaceDescriptors = {};
    if (typeof weight === 'number') descriptors.weight = String(weight);
    if (style) descriptors.style = style;
    const face = new FontFace(family, data, descriptors);
    await face.load();
    (document.fonts as FontFaceSet).add(face);
    return true;
  } catch { /* unsupported/broken font - skip */ }
  return false;
}

/** Derive a display family name: prefer the font's own name table, fall back to the filename.
 *  opentype.js can't decode WOFF2, so that path always falls back to the filename (which still
 *  registers correctly via FontFace). Also reads the OS/2 weight class + italic flag when the font
 *  is parseable (B52), so a Bold / Italic file registers as that face of its family. */
function deriveFace(data: ArrayBuffer, fileName: string): { family: string; weight?: number; style?: FaceStyle } {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  try {
    const font = opentype.parse(data);
    const names = font.names as unknown as Record<string, Record<string, string> | undefined>;
    const pick = (n?: Record<string, string>) => (n ? (n.en ?? Object.values(n)[0]) : undefined);
    // Typographic family (name ID 16) first: ID 1 of a "SemiBold" file is often "Family SemiBold".
    const fam = pick(names.preferredFamily) ?? pick(names.fontFamily) ?? pick(names.fullName);
    const os2 = font.tables.os2 as unknown as { usWeightClass?: number; fsSelection?: number } | undefined;
    const w = os2?.usWeightClass;
    const weight = typeof w === 'number' && w >= 1 && w <= 1000 ? w : undefined;
    const style: FaceStyle | undefined = typeof os2?.fsSelection === 'number' ? ((os2.fsSelection & 1) ? 'italic' : 'normal') : undefined;
    return { family: fam && fam.trim() ? fam.trim() : stem || 'Custom Font', weight, style };
  } catch { /* not parseable (e.g. woff2) - use the filename */ }
  return { family: stem || 'Custom Font' };
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
  /** importFont with overrides (family / weight / style) and the full result (the agent path, B52). */
  importFontFace: (file: File, options?: ImportFontOptions) => Promise<ImportedFontFace>;
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
      try { recs = await idbGetAll(); } catch { /* storage unavailable - degrade to no custom fonts */ }
      await Promise.allSettled(recs.map((r) => registerFace(r.family, r.data, r.weight, r.style)));
      set({ fonts: recs.map((r) => ({ id: r.id, family: r.family, fileName: r.fileName, weight: r.weight, style: r.style })), hydrated: true });
      if (recs.length > 0) fireFontsChanged();
    })();
    return hydratePromise;
  },
  importFont: async (file) => (await get().importFontFace(file)).family,
  importFontFace: async (file, options) => {
    if (file.size > MAX_FONT_BYTES) {
      throw new Error(`Font is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max ${MAX_FONT_BYTES / 1024 / 1024} MB).`);
    }
    const data = await file.arrayBuffer();
    const format = sniffFontFormat(data);
    if (!format) throw new Error(`"${file.name}" is not a font file (expected TTF, OTF, WOFF or WOFF2).`);
    const derived = deriveFace(data, file.name);
    const family = options?.family?.trim() || derived.family;
    const weight = typeof options?.weight === 'number' && options.weight >= 1 && options.weight <= 1000 ? Math.round(options.weight) : derived.weight;
    const style = options?.style ?? derived.style;
    // Register first: a file the browser cannot decode is reported, not stored.
    if (!(await registerFace(family, data, weight, style))) {
      throw new Error(`The browser could not load "${file.name}" as a font.`);
    }
    const rec: CustomFontRecord = { id: newId(), family, fileName: file.name, data, addedAt: Date.now(), weight, style };
    // Re-importing the same face (family + weight + style) replaces it instead of piling up copies.
    const sameFace = (f: CustomFontMeta) => f.family === family && f.weight === weight && f.style === style;
    const replaced = get().fonts.filter(sameFace);
    let persisted = true;
    try { await idbPut(rec); } catch { persisted = false; /* storage unavailable: usable this session only */ }
    if (persisted) for (const old of replaced) { try { await idbDelete(old.id); } catch { /* ignore */ } }
    set({ fonts: [...get().fonts.filter((f) => !sameFace(f)), { id: rec.id, family, fileName: file.name, weight, style }] });
    fireFontsChanged();
    return { id: rec.id, family, fileName: file.name, weight: weight ?? null, style: style ?? null, format, persisted };
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
