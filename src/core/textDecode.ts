// Text Decode / scramble (B9) - the "code decrypt" / matrix-decode effect: unrevealed glyphs flicker
// through random characters and lock to the real letter as a reveal sweeps left→right. Pure and
// FRAME-DETERMINISTIC (seeded hash of index+time-bucket, no Math.random/Date), so scrubbing is
// byte-stable. Leaf module - imports nothing - so it bundles in a node harness (`verify:text-kinetic`).
// The renderer needs no change: `expandTextGlyphs` already stamps one glyph per character, so decode
// just chooses which character each stamp shows.

export const DEFAULT_DECODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@?/\\<>=+';

function isWhitespace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

/** Deterministic scramble character for (seed, glyph index, time bucket). */
export function scrambleCharAt(seed: number, index: number, bucket: number, charset: string): string {
  if (charset.length === 0) return ' ';
  let h = (seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(bucket + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h = (h ^ (h >>> 16)) >>> 0;
  return charset[h % charset.length];
}

/**
 * Whether glyph `index` of `count` is revealed at reveal `progress` (0..1). Left→right: at progress 0
 * nothing is locked, at progress 1 every glyph is. Uses (index+1)/count so progress 0 reveals none.
 */
export function isGlyphRevealed(index: number, count: number, progress: number): boolean {
  if (count <= 0) return true;
  return (index + 1) / count <= progress + 1e-9;
}

/**
 * The character glyph `index` shows this frame: the real letter once revealed (or if it's whitespace),
 * otherwise a seeded scramble char that changes every `scrambleHold` frames (the flicker).
 */
export function decodeCharAt(
  realChar: string,
  index: number,
  count: number,
  progress: number,
  frame: number,
  seed: number,
  charset: string,
  scrambleHold: number,
): string {
  if (isWhitespace(realChar)) return realChar;
  if (isGlyphRevealed(index, count, progress)) return realChar;
  const hold = Math.max(1, Math.floor(scrambleHold));
  const bucket = Math.floor(frame / hold);
  return scrambleCharAt(seed, index, bucket, charset);
}

/** Apply decode to a whole string for the current frame. progress ≥ 1 returns the content unchanged. */
export function decodeContent(
  content: string,
  progress: number,
  frame: number,
  seed: number,
  charset: string,
  scrambleHold: number,
): string {
  if (progress >= 1) return content;
  let out = '';
  for (let i = 0; i < content.length; i++) {
    out += decodeCharAt(content[i], i, content.length, progress, frame, seed, charset, scrambleHold);
  }
  return out;
}
