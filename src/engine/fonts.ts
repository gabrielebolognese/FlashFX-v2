// Bundled-font loading + the single font manifest.
//
// Premium free-for-commercial (OFL) families ship as woff files under public/fonts,
// but nothing ever registered them with the browser, so every family except the UI default
// silently fell back to sans-serif in the Canvas-2D text rasterizer. This module loads them
// via the FontFace API at boot and busts the text caches once they resolve, making the font
// menu WYSIWYG. It is also the SINGLE source of truth for the font list (the Inspector
// dropdown and the text-outline op both read it, so the lists can't drift).

import { bumpFontEpoch, setFontFaceRequester } from './textAtlas';

export type FontCategory = 'Sans' | 'Serif' | 'Display' | 'Script' | 'Pixel' | 'Mono' | 'System';

/** Order of the font-menu groups (Inspector, Quick Text). */
export const FONT_CATEGORY_ORDER: readonly FontCategory[] = ['Sans', 'Display', 'Serif', 'Script', 'Pixel', 'Mono', 'System'];

export interface FontManifestEntry {
  /** Display name, exactly as used in `fontFamily` and the CSS font string. */
  family: string;
  /** fontsource slug for the bundled woff (`/fonts/<slug>-<weight>.woff`), or null for system fonts. */
  slug: string | null;
  /** Bundled upright weights available on disk. */
  weights: number[];
  /**
   * Bundled TRUE italic weights (`/fonts/<slug>-<weight>-italic.woff`). Italic text in a family
   * without one is a synthesized oblique (the browser shears the upright face).
   */
  italicWeights?: number[];
  /** The whole family loads on first use instead of at boot (keeps first paint unchanged). */
  lazy?: boolean;
  /** Upright weights of a boot family that still load on first use (e.g. Inter 500 / 600). */
  lazyWeights?: number[];
  category: FontCategory;
  /**
   * Default tracking as a fraction of the em, applied on family change (display faces read
   * better slightly tight; all-caps faces need air). Multiplied by fontSize to get px.
   */
  trackingEm: number;
}

/** The bundled OFL faces (files confirmed present in public/fonts) plus common system fonts. */
export const FONT_MANIFEST: FontManifestEntry[] = [
  // Sans - workhorses
  { family: 'Inter', slug: 'inter', weights: [400, 500, 600, 700], lazyWeights: [500, 600], category: 'Sans', trackingEm: 0 },
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
  { family: 'Playfair Display', slug: 'playfair-display', weights: [400, 700], italicWeights: [400, 700], category: 'Serif', trackingEm: 0 },
  // B52 font library: lazy-loaded on first use (all SIL OFL 1.1, see public/fonts/LICENSES.md)
  { family: 'Instrument Serif', slug: 'instrument-serif', weights: [400], italicWeights: [400], lazy: true, category: 'Serif', trackingEm: -0.01 },
  { family: 'Inter Tight', slug: 'inter-tight', weights: [400, 500, 600, 700], lazy: true, category: 'Sans', trackingEm: -0.01 },
  { family: 'Archivo Expanded', slug: 'archivo-expanded', weights: [400, 500, 600, 700, 800], lazy: true, category: 'Display', trackingEm: -0.01 },
  { family: 'Montserrat Alternates', slug: 'montserrat-alternates', weights: [400, 500, 600, 700, 800], lazy: true, category: 'Display', trackingEm: -0.015 },
  { family: 'Unbounded', slug: 'unbounded', weights: [400, 700, 900], lazy: true, category: 'Display', trackingEm: -0.02 },
  { family: 'Nunito', slug: 'nunito', weights: [400, 700, 900], lazy: true, category: 'Display', trackingEm: 0 },
  { family: 'Damion', slug: 'damion', weights: [400], lazy: true, category: 'Script', trackingEm: 0 },
  { family: 'VT323', slug: 'vt323', weights: [400], lazy: true, category: 'Pixel', trackingEm: 0 },
  { family: 'Silkscreen', slug: 'silkscreen', weights: [400, 700], lazy: true, category: 'Pixel', trackingEm: 0.02 },
  { family: 'Space Mono', slug: 'space-mono', weights: [400, 700], lazy: true, category: 'Mono', trackingEm: 0 },
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

/** Default letter-spacing (px) for a family at a given size - a small premium touch on family change. */
export function defaultTrackingPx(family: string, fontSize: number): number {
  const em = BY_FAMILY.get(family)?.trackingEm ?? 0;
  return Math.round(em * fontSize * 100) / 100;
}

/**
 * The weight the CSS font-matching algorithm (CSS Fonts 4, 5.2 step 4) picks from `available` for
 * `desired` - the same rule the browser applies to the registered faces, so the face we lazily load
 * is the face the canvas then draws with:
 *  - 400..500: heavier faces up to 500 ascending, then lighter descending, then heavier than 500;
 *  - below 400: lighter descending, then heavier ascending;
 *  - above 500: heavier ascending, then lighter descending.
 * Null when nothing is available.
 */
export function nearestWeight(available: readonly number[], desired: number): number | null {
  if (available.length === 0) return null;
  const want = Number.isFinite(desired) ? Math.max(1, Math.min(1000, desired)) : 400;
  if (available.includes(want)) return want;
  const asc = [...available].sort((a, b) => a - b);
  const lighter = asc.filter((w) => w < want).reverse();
  const heavier = asc.filter((w) => w > want);
  if (want >= 400 && want <= 500) {
    const upTo500 = heavier.filter((w) => w <= 500);
    return upTo500[0] ?? lighter[0] ?? heavier[0];
  }
  if (want < 400) return lighter[0] ?? heavier[0];
  return heavier[0] ?? lighter[0];
}

/** Which bundled file renders a (family, weight, style) request, and what the browser synthesizes. */
export interface BundledFaceMatch {
  family: string;
  url: string;
  /** Weight of the picked file. */
  weight: number;
  /** True when the picked file is a real italic face. */
  italic: boolean;
  /** Italic was asked for but the family has no italic face: the browser shears the upright one. */
  syntheticOblique: boolean;
  /** Bold (>= 600) was asked for but the nearest face is lighter: the browser emboldens it. */
  syntheticBold: boolean;
  /** Registered + loaded at boot (otherwise it loads on first use). */
  boot: boolean;
}

/**
 * Pick the bundled face for a request, like the browser does among registered faces: style first
 * (a true italic face wins over a synthesized oblique; an upright request falls back to italic
 * faces only when a family has no upright ones), then the nearest weight. Null for system /
 * unknown (e.g. custom) families.
 */
export function matchBundledFace(family: string, fontWeight: number, fontStyle: 'normal' | 'italic' = 'normal'): BundledFaceMatch | null {
  const entry = BY_FAMILY.get(family);
  if (!entry || !entry.slug) return null;
  const italics = entry.italicWeights ?? [];
  const useItalic = fontStyle === 'italic' ? italics.length > 0 : entry.weights.length === 0 && italics.length > 0;
  const pool = useItalic ? italics : entry.weights;
  const weight = nearestWeight(pool, fontWeight);
  if (weight === null) return null;
  const boot = !useItalic && !entry.lazy && !(entry.lazyWeights ?? []).includes(weight);
  return {
    family,
    url: `/fonts/${entry.slug}-${weight}${useItalic ? '-italic' : ''}.woff`,
    weight,
    italic: useItalic,
    syntheticOblique: fontStyle === 'italic' && !useItalic,
    syntheticBold: fontWeight >= 600 && weight < 600,
    boot,
  };
}

/** URL of the bundled woff the browser draws for this weight (+ style), or null for system/unknown families. */
export function bundledFontUrl(family: string, fontWeight: number, fontStyle: 'normal' | 'italic' = 'normal'): string | null {
  return matchBundledFace(family, fontWeight, fontStyle)?.url ?? null;
}

/** One face a piece of text asks for (the shape of TextSpanStyle / ResolvedText). */
export interface FontRequest {
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
}

/**
 * Every distinct (family, weight, style) a composition's text asks for: walks the layer data for
 * any object carrying a string `fontFamily` (text spans, caption styles, ...) and follows precomp
 * layers into their sub-compositions. Pure; used to load lazy faces before an export / frame render.
 */
export function collectFontRequests(root: unknown, getComposition?: (id: string) => unknown): FontRequest[] {
  const out = new Map<string, FontRequest>();
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number): void => {
    if (depth > 64 || v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    if (typeof o.fontFamily === 'string' && o.fontFamily) {
      const req: FontRequest = {
        fontFamily: o.fontFamily,
        fontWeight: typeof o.fontWeight === 'number' ? o.fontWeight : 400,
        fontStyle: o.fontStyle === 'italic' ? 'italic' : 'normal',
      };
      out.set(`${req.fontFamily}|${req.fontWeight}|${req.fontStyle}`, req);
    }
    if (o.type === 'precomp' && typeof o.compositionId === 'string' && getComposition) walk(getComposition(o.compositionId), depth + 1);
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (x !== null && typeof x === 'object') walk(x, depth + 1);
    }
  };
  walk(root, 0);
  return [...out.values()];
}

// ---- Loading -------------------------------------------------------------------

let loadPromise: Promise<void> | null = null;
let loaded = false;
const changeListeners = new Set<() => void>();

/**
 * Fire whenever the available fonts change - bundled faces finished loading, or a custom font was
 * imported/removed. Busts the text caches (via the epoch) and notifies subscribers so open frames
 * repaint. Both the bundled loader and the custom-font store call this.
 */
export function fireFontsChanged(): void {
  bumpFontEpoch();
  for (const cb of [...changeListeners]) {
    try { cb(); } catch { /* a listener must not break font notification */ }
  }
}

/** Subscribe to font-set changes (bundled ready, custom added/removed). Returns an unsubscribe fn. */
export function onFontsChanged(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

/**
 * Register the bundled BOOT faces with the browser and bust the text caches once they resolve, and
 * install the on-demand loader for the lazy ones (B52 families, extra weights, italic faces).
 * Idempotent - safe to call from multiple mount points; the work happens once.
 */
export function loadBundledFonts(): Promise<void> {
  if (loadPromise) return loadPromise;
  // Guard for non-browser/SSR-ish contexts and very old engines.
  if (typeof document === 'undefined' || !('fonts' in document) || typeof FontFace === 'undefined') {
    loaded = true;
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  // Lazy faces: the text rasterizer reports every face it draws with; the first request loads it.
  setFontFaceRequester((family, weight, style) => { void ensureFontFace(family, weight, style); });

  const faces: Promise<unknown>[] = [];
  for (const entry of FONT_MANIFEST) {
    if (!entry.slug || entry.lazy) continue;
    for (const weight of entry.weights) {
      if ((entry.lazyWeights ?? []).includes(weight)) continue;
      const url = `/fonts/${entry.slug}-${weight}.woff`;
      try {
        const face = new FontFace(entry.family, `url(${url})`, { weight: String(weight), style: 'normal' });
        // Register immediately so measurement can find it once loaded.
        (document.fonts as FontFaceSet).add(face);
        faces.push(face.load().catch(() => { /* missing/broken face - skip, don't fail the batch */ }));
      } catch {
        /* invalid descriptor - skip this face */
      }
    }
  }

  loadPromise = Promise.allSettled(faces).then(() => {
    loaded = true;
    // Both the textAtlas bitmap cache and the renderer's GPU texture cache are keyed by
    // textCacheKey; bumping the epoch (inside fireFontsChanged) folds into that key so every
    // text re-rasterizes with the now-loaded face instead of the cached sans-serif fallback.
    fireFontsChanged();
  });
  return loadPromise;
}

/** True once the bundled faces have finished their initial load attempt. */
export function bundledFontsLoaded(): boolean {
  return loaded;
}

// ---- Lazy faces ----------------------------------------------------------------

/** In-flight / finished loads of lazy faces, keyed by file URL. */
const lazyFaceLoads = new Map<string, Promise<void>>();
/** Memo of request -> load, so the per-draw requester is one map lookup after the first call. */
const requestLoads = new Map<string, Promise<void> | null>();

/**
 * Make sure the bundled face that renders (family, weight, style) is loaded. A boot face resolves
 * with the boot load; a lazy face is fetched and loaded and only THEN added to document.fonts (so
 * the browser never matches a pending face and flashes the sans-serif fallback), after which the
 * text caches are busted so open frames re-rasterize in the real face. Null for system / custom
 * families (custom faces are registered when imported / hydrated).
 */
export function ensureFontFace(family: string, fontWeight: number, fontStyle: 'normal' | 'italic' = 'normal'): Promise<void> | null {
  const key = `${family}|${fontWeight}|${fontStyle}`;
  const memo = requestLoads.get(key);
  if (memo !== undefined) return memo;
  let result: Promise<void> | null = null;
  const match = matchBundledFace(family, fontWeight, fontStyle);
  if (match && typeof document !== 'undefined' && 'fonts' in document && typeof FontFace !== 'undefined') {
    if (match.boot) {
      result = loadPromise;
    } else {
      let p = lazyFaceLoads.get(match.url);
      if (!p) {
        p = (async () => {
          try {
            const face = new FontFace(match.family, `url(${match.url})`, { weight: String(match.weight), style: match.italic ? 'italic' : 'normal' });
            await face.load();
            (document.fonts as FontFaceSet).add(face);
            fireFontsChanged();
          } catch { /* missing/broken face - the text keeps its fallback */ }
        })();
        lazyFaceLoads.set(match.url, p);
      }
      result = p;
    }
  }
  if (result || !match) requestLoads.set(key, result);
  return result;
}

/**
 * Load every face a composition's text uses (lazy bundled faces included) before frames are
 * rendered for keeps (MP4 export, agent renderFrame), so no kept frame draws a fallback face.
 */
export async function ensureCompositionFonts(composition: unknown, getComposition?: (id: string) => unknown): Promise<void> {
  if (typeof document === 'undefined') return;
  const loads: Promise<void>[] = [];
  if (loadPromise) loads.push(loadPromise);
  for (const r of collectFontRequests(composition, getComposition)) {
    const p = ensureFontFace(r.fontFamily, r.fontWeight, r.fontStyle);
    if (p) loads.push(p);
  }
  await Promise.allSettled(loads);
}
