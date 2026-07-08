import type { FontWeight } from './types';

type FontKey = string;

function fontKey(family: string, weight: FontWeight, style: 'normal' | 'italic'): FontKey {
  return `${family}-${weight}-${style}`;
}

const loaded = new Map<FontKey, FontFace>();
const loading = new Map<FontKey, Promise<FontFace>>();
const listeners = new Set<() => void>();

const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2?family=';

export function isFontReady(family: string, weight: FontWeight = 400, style: 'normal' | 'italic' = 'normal'): boolean {
  return loaded.has(fontKey(family, weight, style));
}

export function isFontLoading(family: string, weight: FontWeight = 400, style: 'normal' | 'italic' = 'normal'): boolean {
  return loading.has(fontKey(family, weight, style));
}

export async function loadFont(family: string, weight: FontWeight = 400, style: 'normal' | 'italic' = 'normal'): Promise<void> {
  const key = fontKey(family, weight, style);
  if (loaded.has(key)) return;
  if (loading.has(key)) {
    await loading.get(key);
    return;
  }

  const url = resolveFontUrl(family, weight, style);
  const face = new FontFace(family, `url(${url})`, {
    weight: String(weight),
    style,
  });

  const promise = face.load().then((loadedFace) => {
    document.fonts.add(loadedFace);
    loaded.set(key, loadedFace);
    loading.delete(key);
    notifyListeners();
    return loadedFace;
  }).catch(() => {
    loading.delete(key);
    return face;
  });

  loading.set(key, promise);
  await promise;
}

export function onFontLoaded(callback: () => void): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function notifyListeners(): void {
  for (const cb of listeners) cb();
}

function resolveFontUrl(family: string, weight: FontWeight, style: 'normal' | 'italic'): string {
  const italicSuffix = style === 'italic' ? ',ital' : '';
  const encodedFamily = encodeURIComponent(family).replace(/%20/g, '+');
  return `${GOOGLE_FONTS_BASE}${encodedFamily}:wght@${weight}${italicSuffix}&display=swap`;
}

export const SYSTEM_FONTS = [
  'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Courier New', 'Verdana', 'system-ui', 'sans-serif', 'serif', 'monospace',
];

export const GOOGLE_FONTS = [
  'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'Lato',
  'Oswald', 'Raleway', 'Playfair Display', 'Merriweather', 'Bebas Neue',
  'Nunito', 'Source Sans Pro', 'Ubuntu', 'Rubik', 'Work Sans',
  'DM Sans', 'Outfit', 'Space Grotesk', 'Manrope', 'Plus Jakarta Sans',
];

export const ALL_FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS].sort();
