// Bundled-font loading + the single font manifest.
//
// ~14 premium free-for-commercial (OFL) families ship as woff files under public/fonts,
// but nothing ever registered them with the browser, so every family except the UI default
// silently fell back to sans-serif in the Canvas-2D text rasterizer. This module loads them
// via the FontFace API at boot and busts the text caches once they resolve, making the font
// menu WYSIWYG. It is also the SINGLE source of truth for the font list (the Inspector
// dropdown and the text-outline op both read it, so the lists can't drift).

import { bumpFontEpoch } from './textAtlas';

export type FontCategory = 'Sans' | 'Serif' | 'Display' | 'Mono' | 'System';

export interface FontManifestEntry {
  /** Display name, exactly as used in `fontFamily` and the CSS font string. */
  family: string;
  /** fontsource slug for the bundled woff (`/fonts/<slug>-<weight>.woff`), or null for system fonts. */
  slug: string | null;
  /** Bundled weights available on disk. */
  weights: number[];
  category: FontCategory;
  /**
   * Default tracking as a fraction of the em, applied on family change (display faces read
   * better slightly tight; all-caps faces need air). Multiplied by fontSize to get px.
   */
  trackingEm: number;
}

/** The bundled OFL faces (files confirmed present in public/fonts) plus common system fonts. */
export const FONT_MANIFEST: FontManifestEntry[] = [
  // Sans — workhorses
  { family: 'Inter', slug: 'inter', weights: [400, 700], category: 'Sans', trackingEm: 0 },
  { family: 'Roboto', slug: 'roboto', weights: [400, 700], category: 'Sans', trackingEm: 0 },
  { family: 'Open Sans', slug: 'open-sans', weights: [400, 700], category: 'Sans', trackingEm: 0 },
  { family: 'Lato', slug: 'lato', weights: [400, 700], category: 'Sans', trackingEm: 0 },
  { family: 'DM Sans', slug: 'dm-sans', weights: [400, 700], category: 'Sans', trackingEm: -0.01 },
  { family: 'Manrope', slug: 'manrope', weights: [400, 700], category: 'Sans', trackingEm: -0.01 },
  { family: 'Plus Jakarta Sans', slug: 'plus-jakarta-sans', weights: [400, 700], category: 'Sans', trackingEm: -0.01 },
  // Geometric / display sans
  { family: 'Montserrat', slug: 'montserrat', weights: [400, 700], category: 'Display', trackingEm: -0.015 },
  { family: 'Poppins', slug: 'poppins', weights: [400, 700], category: 'Display', trackingEm: -0.015 },
  { family: 'Raleway', slug: 'raleway', weights: [400, 700], category: 'Display', trackingEm: -0.01 },
  { family: 'Space Grotesk', slug: 'space-grotesk', weights: [400, 700], category: 'Display', trackingEm: -0.01 },
  { family: 'Oswald', slug: 'oswald', weights: [400, 700], category: 'Display', trackingEm: 0.01 },
  { family: 'Bebas Neue', slug: 'bebas-neue', weights: [400], category: 'Display', trackingEm: 0.04 },
  // Serif
  { family: 'Playfair Display', slug: 'playfair-display', weights: [400, 700], category: 'Serif', trackingEm: 0 },
  // System fallbacks (no load needed; the browser has them)
  { family: 'Arial', slug: null, weights: [400, 700], category: 'System', trackingEm: 0 },
  { family: 'Helvetica', slug: null, weights: [400, 700], category: 'System', trackingEm: 0 },
  { family: 'Georgia', slug: null, weights: [400, 700], category: 'System', trackingEm: 0 },
  { family: 'Times New Roman', slug: null, weights: [400, 700], category: 'System', trackingEm: 0 },
  { family: 'Verdana', slug: null, weights: [400, 700], category: 'System', trackingEm: 0 },
  { family: 'Courier New', slug: null, weights: [400, 700], category: 'Mono', trackingEm: 0 },
];

const BY_FAMILY = new Map(FONT_MANIFEST.map((f) => [f.family, f]));

/** Ordered family names for the font menu. */
export const FONT_FAMILIES: string[] = FONT_MANIFEST.map((f) => f.family);

/** Manifest entry for a family, if known. */
export function fontEntry(family: string): FontManifestEntry | undefined {
  return BY_FAMILY.get(family);
}

/** Category label for a family (for grouping the dropdown). */
export function fontCategory(family: string): FontCategory {
  return BY_FAMILY.get(family)?.category ?? 'System';
}

/** Default letter-spacing (px) for a family at a given size — a small premium touch on family change. */
export function defaultTrackingPx(family: string, fontSize: number): number {
  const em = BY_FAMILY.get(family)?.trackingEm ?? 0;
  return Math.round(em * fontSize * 100) / 100;
}

/** URL of the bundled woff nearest the requested weight, or null for system/unknown families. */
export function bundledFontUrl(family: string, fontWeight: number): string | null {
  const entry = BY_FAMILY.get(family);
  if (!entry || !entry.slug) return null;
  const w = entry.weights.reduce(
    (best, x) => (Math.abs(x - fontWeight) < Math.abs(best - fontWeight) ? x : best),
    entry.weights[0],
  );
  return `/fonts/${entry.slug}-${w}.woff`;
}

// ---- Loading -------------------------------------------------------------------

let loadPromise: Promise<void> | null = null;
let loaded = false;
const listeners = new Set<() => void>();

/**
 * Register the bundled faces with the browser and bust the text caches once they resolve.
 * Idempotent — safe to call from multiple mount points; the work happens once.
 */
export function loadBundledFonts(): Promise<void> {
  if (loadPromise) return loadPromise;
  // Guard for non-browser/SSR-ish contexts and very old engines.
  if (typeof document === 'undefined' || !('fonts' in document) || typeof FontFace === 'undefined') {
    loaded = true;
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  const faces: Promise<unknown>[] = [];
  for (const entry of FONT_MANIFEST) {
    if (!entry.slug) continue;
    for (const weight of entry.weights) {
      const url = `/fonts/${entry.slug}-${weight}.woff`;
      try {
        const face = new FontFace(entry.family, `url(${url})`, { weight: String(weight), style: 'normal' });
        // Register immediately so measurement can find it once loaded.
        (document.fonts as FontFaceSet).add(face);
        faces.push(face.load().catch(() => { /* missing/broken face — skip, don't fail the batch */ }));
      } catch {
        /* invalid descriptor — skip this face */
      }
    }
  }

  loadPromise = Promise.allSettled(faces).then(() => {
    loaded = true;
    // Both the textAtlas bitmap cache and the renderer's GPU texture cache are keyed by
    // textCacheKey; bumping the epoch folds into that key so every text re-rasterizes with
    // the now-loaded face instead of the sans-serif fallback that got cached pre-load.
    bumpFontEpoch();
    for (const cb of [...listeners]) {
      try { cb(); } catch { /* listener errors must not break font loading */ }
    }
  });
  return loadPromise;
}

/**
 * Subscribe to "fonts finished loading" (fires once, then on nothing else). If fonts are
 * already loaded, the callback runs on the next microtask. Returns an unsubscribe fn.
 * Consumers use this to repaint so a static frame re-rasterizes with the real fonts.
 */
export function onFontsLoaded(cb: () => void): () => void {
  if (loaded) {
    Promise.resolve().then(cb);
    return () => {};
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}
