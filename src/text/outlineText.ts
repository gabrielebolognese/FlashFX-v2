import * as opentype from 'opentype.js';
import type { PathVertex, Vec2 } from '../core/types';
import { commandsToContours, recenterContours, type OutlineCommand } from '../core/textOutline';
import { bundledFontUrl } from '../engine/fonts';

// M17 — Text → vector paths (impure, main-thread: needs fetch + font parsing). Loads a bundled
// OFL font (public/fonts, parsed by opentype.js), lays the text out with real advances/kerning,
// and hands each glyph's outline commands to the PURE core (commandsToContours) for the
// quad→cubic conversion. Bundled woff families only; anything else returns null so the caller
// can report "no outline available" rather than guess. Fonts are cached per URL. The bundled
// family/slug/weight list lives in the shared font manifest (engine/fonts.ts).

/** True if "Create Outlines" can run for this family (a bundled font exists). */
export function canOutlineFont(fontFamily: string): boolean {
  return bundledFontUrl(fontFamily, 400) !== null;
}

function fontUrl(fontFamily: string, fontWeight: number): string | null {
  return bundledFontUrl(fontFamily, fontWeight);
}

const fontCache = new Map<string, Promise<opentype.Font>>();
function loadFont(fontFamily: string, fontWeight: number): Promise<opentype.Font> | null {
  const url = fontUrl(fontFamily, fontWeight);
  if (!url) return null;
  let p = fontCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => r.arrayBuffer()).then((ab) => opentype.parse(ab));
    fontCache.set(url, p);
  }
  return p;
}

export interface OutlinedGlyph {
  /** The glyph's centre in group-local space (the child polygon's position under the group). */
  center: Vec2;
  /** Closed cubic contours relative to `center` — [outer, ...counters]. */
  contours: PathVertex[][];
}

export interface OutlineTextParams {
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;    // multiplier
  letterSpacing: number; // px
  textAlign: 'left' | 'center' | 'right';
}

/**
 * Outline a text block into per-glyph cubic contours (group-local, centred on the block). Returns
 * null when the family isn't bundled (caller reports it). Whitespace glyphs emit nothing.
 */
export async function outlineText(params: OutlineTextParams): Promise<OutlinedGlyph[] | null> {
  const fontP = loadFont(params.fontFamily, params.fontWeight);
  if (!fontP) return null;
  let font: opentype.Font;
  try { font = await fontP; } catch { return null; }

  const { text, fontSize, lineHeight, letterSpacing, textAlign } = params;
  const lines = text.split('\n');
  const lineHeightPx = fontSize * (lineHeight || 1.2);
  const lsEm = fontSize > 0 ? letterSpacing / fontSize : 0; // opentype letterSpacing is em-relative
  const opts = { kerning: true, letterSpacing: lsEm };
  const ascentPx = fontSize * (font.ascender / font.unitsPerEm);

  const lineWidths = lines.map((l) => font.getAdvanceWidth(l, fontSize, opts));
  const maxW = Math.max(0, ...lineWidths);

  // First collect absolute contours per glyph, tracking the block's union bbox.
  const raw: { absCenter: Vec2; contours: PathVertex[][] }[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  lines.forEach((line, li) => {
    const startX = textAlign === 'center' ? (maxW - lineWidths[li]) / 2 : textAlign === 'right' ? maxW - lineWidths[li] : 0;
    const baselineY = li * lineHeightPx + ascentPx;
    const paths = font.getPaths(line, startX, baselineY, fontSize, opts);
    for (const p of paths) {
      const contours = commandsToContours(p.commands as OutlineCommand[]);
      if (contours.length === 0) continue; // whitespace / empty glyph
      const { center, contours: rec } = recenterContours(contours);
      raw.push({ absCenter: center, contours: rec });
      // union bbox from the glyph centre + its recentred extents
      for (const c of rec) for (const v of c) {
        const x = center[0] + v.position[0], y = center[1] + v.position[1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  });

  if (raw.length === 0) return [];
  const ux = (minX + maxX) / 2, uy = (minY + maxY) / 2; // block centre → group origin
  return raw.map((g) => ({ center: [g.absCenter[0] - ux, g.absCenter[1] - uy] as Vec2, contours: g.contours }));
}
