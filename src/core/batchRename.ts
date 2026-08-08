// M19 — Batch rename. Pure name-generation for a multi-selection: a template of tokens plus an
// optional regex Match/Replace, applied to a doc-ordered layer list. Dependency-free +
// deterministic (no Date/Math.random), proven by scripts/verify-batchrename.mjs.
//
// Order of operations (Figma parity): the regex find/replace runs FIRST on each layer's CURRENT
// name → an intermediate name; THEN the template composes around it, where {name} expands to that
// intermediate. So "strip a prefix then re-number" works. Invalid regex never throws — it sets
// regexError and skips the regex pass (every layer still gets a valid templated name).
//
// Tokens:  {name}  current (regex-transformed) name
//          {type}  layer type
//          {n}     running number, auto-padded to the widest number in the run
//          {n:W}   running number, zero-padded to width W (e.g. {n:3} → 007)
// Numbering: value = startNumber + i (ascending) or startNumber − i (descending), i = array index.

export interface RenamePattern {
  template: string;
  startNumber: number;
  descending?: boolean;
  find?: string;    // regex source (optional)
  replace?: string; // JS replacement string ($1, $&) — default ''
  flags?: string;   // regex flags, sanitized; 'g' is forced on
}

export interface RenameInput { id: string; name: string; type?: string }
export interface RenameResult { results: { id: string; name: string }[]; regexError: boolean }

const ALLOWED_FLAGS = 'gimsuy';
const TOKEN_RE = /\{(name|type|n(?::(\d+))?)\}/g;

function padNum(num: number, width: number): string {
  const s = String(Math.abs(num)).padStart(Math.max(1, width), '0');
  return num < 0 ? `-${s}` : s;
}

function expandTemplate(template: string, name: string, num: number, autoWidth: number, type: string): string {
  return template.replace(TOKEN_RE, (_m, tok: string, widthStr?: string) => {
    if (tok === 'name') return name;
    if (tok === 'type') return type;
    return padNum(num, widthStr ? parseInt(widthStr, 10) : autoWidth); // n / n:W
  });
}

export function computeBatchNames(layers: RenameInput[], pattern: RenamePattern): RenameResult {
  let regexError = false;
  let re: RegExp | null = null;
  const find = pattern.find ?? '';
  if (find) {
    let flags = (pattern.flags ?? 'g').split('').filter((f) => ALLOWED_FLAGS.includes(f)).join('');
    if (!flags.includes('g')) flags += 'g'; // replace-all like Figma
    try { re = new RegExp(find, flags); } catch { regexError = true; re = null; }
  }
  const replace = pattern.replace ?? '';

  const values = layers.map((_, i) => (pattern.descending ? pattern.startNumber - i : pattern.startNumber + i));
  const autoWidth = values.length ? Math.max(1, ...values.map((v) => String(Math.abs(v)).length)) : 1;

  const results = layers.map((layer, i) => {
    let base = layer.name;
    if (re) { try { base = layer.name.replace(re, replace); } catch { /* flagged above */ } }
    const name = expandTemplate(pattern.template, base, values[i], autoWidth, layer.type ?? '');
    return { id: layer.id, name: name.length > 0 ? name : layer.name }; // never blank
  });
  return { results, regexError };
}
