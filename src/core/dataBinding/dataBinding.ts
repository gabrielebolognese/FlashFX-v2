import { toValue, type ReactTarget, type Track } from '../audioReactive/audioReactive';

// Data binding (B31-data) - pure CSV/JSON -> keyframe math. Turns a column of a spreadsheet (CSV) or a
// field of a JSON array into ordinary keyframes on a layer property, BAKED (not a live binding): the
// output is plain keyframes flowing through the normal interpolation/playback system, so it renders and
// exports frame-purely - exactly like the audio-reactive core it mirrors (and it reuses that module's
// ReactTarget/Track/toValue rather than duplicating them). Leaf-ish module (only imports the audio leaf),
// so esbuild bundles it standalone for scripts/verify-data-binding.mjs.
//
// Pipeline: parseCSV / parseJSONSeries -> a numeric series -> mapSeries (normalise -> [min,max]) ->
// buildDataTrack (N keyframes evenly spread across a frame range). The `applyOverrides` cloner path is a
// different (single-value content) mechanism; a value animating over time is a keyframe track, so this
// writes keyframes, not overrides.

export type { ReactTarget, Track } from '../audioReactive/audioReactive';

// ── CSV parsing ──────────────────────────────────────────────────────────────

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * Parse CSV text into headers + rows. Handles quoted fields (with embedded commas, newlines, and ""
 * escaped quotes), CRLF or LF line endings, and a trailing newline. The first non-empty record is the
 * header row. Ragged rows are kept as-is (short rows just yield fewer cells). Pure, dependency-free.
 */
export function parseCSV(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let sawAny = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    // Drop a phantom trailing empty record (e.g. from a final newline).
    if (!(row.length === 1 && row[0] === '')) records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
      sawAny = true;
      continue;
    }
    if (c === '"') { inQuotes = true; sawAny = true; continue; }
    if (c === ',') { endField(); sawAny = true; continue; }
    if (c === '\r') continue; // swallow CR (handles CRLF)
    if (c === '\n') { endRow(); continue; }
    field += c;
    sawAny = true;
  }
  // Flush the last field/row if the text didn't end with a newline.
  if (field !== '' || row.length > 0 || (sawAny && records.length === 0)) endRow();

  if (records.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = records;
  return { headers: headers.map((h) => h.trim()), rows };
}

/** The cells of one column, addressed by header name (case-insensitive) or 0-based index. `[]` if the
 *  column can't be resolved. */
export function columnValues(parsed: ParsedCsv, column: string | number): string[] {
  let idx: number;
  if (typeof column === 'number') {
    idx = column;
  } else {
    const want = column.trim().toLowerCase();
    idx = parsed.headers.findIndex((h) => h.toLowerCase() === want);
  }
  if (idx < 0) return [];
  return parsed.rows.map((r) => r[idx] ?? '');
}

// ── JSON parsing ─────────────────────────────────────────────────────────────

/**
 * Extract a numeric series from JSON text. The JSON must be an array; each element is read as a number
 * directly (array of numbers) or via `fieldPath` (a dot path into an array of objects, e.g. "value" or
 * "stats.score"). Non-numeric / missing entries are skipped. Returns [] on parse failure (never throws).
 */
export function parseJSONSeries(text: string, fieldPath?: string): number[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const keys = fieldPath ? fieldPath.split('.').map((k) => k.trim()).filter(Boolean) : [];
  const out: number[] = [];
  for (const el of data) {
    let v: unknown = el;
    for (const k of keys) {
      if (v === null || typeof v !== 'object') { v = undefined; break; }
      v = (v as Record<string, unknown>)[k];
    }
    const n = typeof v === 'number' ? v : Number(v);
    if (typeof v !== 'boolean' && v !== null && v !== '' && v !== undefined && Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Coerce raw cells to finite numbers, skipping blanks / non-numeric ones. Order preserved. */
export function toNumbers(cells: string[]): number[] {
  const out: number[] = [];
  for (const c of cells) {
    const t = c.trim();
    if (t === '') continue;
    const n = Number(t);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// ── mapping + keyframe track ─────────────────────────────────────────────────

export interface MapSeriesOptions {
  /** Output range (the property's target values). */
  min: number;
  max: number;
  /** Explicit input domain; when omitted the series' own min/max is used (auto-normalise). */
  domainMin?: number;
  domainMax?: number;
  /** Flip the mapping (high data -> min). */
  invert?: boolean;
}

/**
 * Normalise a numeric series into the [min,max] output range. By default the series' own min..max maps to
 * min..max (auto-normalise); pass domainMin/domainMax to fix the input scale (values clamp to it). A flat
 * series (no spread) maps everything to `min`. Pure; length-preserving.
 */
export function mapSeries(values: number[], opts: MapSeriesOptions): number[] {
  if (values.length === 0) return [];
  let lo = opts.domainMin;
  let hi = opts.domainMax;
  if (lo === undefined || hi === undefined) {
    lo = Infinity; hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  const span = hi - lo;
  return values.map((v) => {
    let t = span > 1e-12 ? (v - (lo as number)) / span : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t; // clamp to the domain
    if (opts.invert) t = 1 - t;
    return opts.min + (opts.max - opts.min) * t;
  });
}

export interface DataTrackOptions {
  propertyPath: string;
  target: ReactTarget;
  startFrame: number;
  endFrame: number;
  /** Base value for the axis not driven (vec2-x / vec2-y). */
  base?: [number, number];
}

/**
 * Place a mapped numeric series as keyframes evenly spanning [startFrame, endFrame] - one keyframe per
 * value (each data row becomes a keyframe). A single value pins one keyframe at startFrame. Frames are
 * rounded and de-duplicated (a later value wins a frame collision), so a series longer than the frame
 * span collapses onto the available frames rather than emitting out-of-order duplicates.
 */
export function buildDataTrack(mappedValues: number[], opts: DataTrackOptions): Track {
  const base = opts.base ?? [0, 0];
  const n = mappedValues.length;
  if (n === 0) return { propertyPath: opts.propertyPath, keyframes: [] };

  const start = Math.round(opts.startFrame);
  const end = Math.max(start, Math.round(opts.endFrame));
  const byFrame = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const frame = n === 1 ? start : start + Math.round((i / (n - 1)) * (end - start));
    byFrame.set(frame, mappedValues[i]); // later value wins a collision
  }
  const frames = [...byFrame.keys()].sort((a, b) => a - b);
  return {
    propertyPath: opts.propertyPath,
    keyframes: frames.map((frame) => ({ frame, value: toValue(byFrame.get(frame) as number, opts.target, base) })),
  };
}
