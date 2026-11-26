// FlashFX animation recipes: parameterized, reusable action sequences (mcp/recipes/*.json) that the MCP
// server expands and runs through the same whitelisted agent actions as run_actions. A recipe encodes one
// piece of house taste (a kinetic title, a prompt bar, a pop, a wipe) with the timing, easing and layout
// numbers measured on the owner's reference videos (mcp/TASTE.md), so a one-line brief becomes clean motion.
//
// Pure Node, no dependency, no eval: expressions are parsed by the small evaluator below.
//
// Recipe file:
//   { id, name, category, description, source: [refs it was extracted from], taste: [TASTE.md sections],
//     params: { name: { type, default?, description, enum?, min?, max? } },
//     length30: <expr: natural length in frames at 30 fps>,   // end = start + f(length30) unless endFrame is given
//     checkFrames30: [<expr>, ...],                            // offsets from start (30 fps frames) worth a look
//     lets: { name: <expr>, ... },                             // derived values, evaluated in order
//     steps: [ step, ... ],
//     returns: { name: <expr>, ... } }
//
// Steps (run in order):
//   { id?, action: "editor.xxx", args, layer?: true, root?: true, when?: <expr> }   one whitelisted action
//   { id?, tool: "get_layer" | "measure_text" | "get_state" | "import_image", args, layer?, root?, when? }
//   { let: { name: <expr>, ... } }                                                     more derived values
//   { forEach: <expr array>, as: "item", index: "i", steps: [ ... ], when? }          loop
//   layer: true  = the step creates a layer (id = result when it is a string, else activeLayerId); it is
//                  listed in the summary and clipped to [start, end] when the caller passes endFrame.
//   root: true   = that layer is parented to the caller's parentId (a scene camera / group). Positions of root
//                  layers must be written as x - PX, y - PY (PX / PY = the parent's position, 0 without one).
//
// Values: any string "{{expr}}" is replaced by the typed value of expr; "a {{expr}} b" interpolates text.
// Expressions: numbers, 'strings', [arrays], params and lets by name, @stepId.path (results of earlier steps;
// a skipped step reads as undefined), member access a.b / a[i] (negative i counts from the end),
// + - * / %, comparisons, && || !, cond ? a : b, and the functions below.
//   f(n)        n frames at 30 fps -> frames at the comp fps (rounded)      t(n) = start + f(n)
//   min max round floor ceil abs sqrt sin cos   len(x)   words(s) (array)   chars(s) (count, no spaces)
//   rgba('#hex', a?) / mix(c1, c2, k)  colours        repo('relative/path') absolute path in the repo
//   num(x) / str(x)                   conversions     pick(arr, i) element with wraparound
// Context names: start, end, fps, W, H, CX, CY (comp centre), PX, PY, DUR (comp duration).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../..');
export const RECIPES_DIR = resolve(HERE, '../recipes');

// ---------------------------------------------------------------------------------------------
// Expression evaluator
// ---------------------------------------------------------------------------------------------

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (m) { toks.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
    }
    if (c === "'" || c === '"') {
      let j = i + 1; let s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { j++; } s += src[j]; j++; }
      if (j >= src.length) throw new Error(`unterminated string in "${src}"`);
      toks.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (c === '@') {
      const m = /^@[A-Za-z_][\w-]*/.exec(src.slice(i));
      if (!m) throw new Error(`bad reference in "${src}"`);
      toks.push({ t: 'ref', v: m[0].slice(1) }); i += m[0].length; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%<>!?:()[],.'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`unexpected "${c}" in "${src}"`);
  }
  return toks;
}

/** Parse to an AST (so the ternary and && / || can be lazy). */
function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
  const eat = (v) => { if (!peek(v)) throw new Error(`expected "${v}" in "${src}"`); p++; };
  function ternary() {
    const c = or();
    if (peek('?')) { p++; const a = ternary(); eat(':'); const b = ternary(); return { k: 'cond', c, a, b }; }
    return c;
  }
  function bin(next, ops) {
    return function self() {
      let l = next();
      while (toks[p] && toks[p].t === 'op' && ops.includes(toks[p].v)) { const op = toks[p++].v; l = { k: 'bin', op, l, r: next() }; }
      return l;
    };
  }
  const unary = () => {
    if (peek('-')) { p++; return { k: 'neg', e: unary() }; }
    if (peek('!')) { p++; return { k: 'not', e: unary() }; }
    if (peek('+')) { p++; return unary(); }
    return postfix();
  };
  const mul = bin(unary, ['*', '/', '%']);
  const add = bin(mul, ['+', '-']);
  const cmp = bin(add, ['<', '>', '<=', '>=']);
  const eq = bin(cmp, ['==', '!=']);
  const and = bin(eq, ['&&']);
  const or = bin(and, ['||']);
  function postfix() {
    let e = primary();
    for (;;) {
      if (peek('.')) { p++; const t = toks[p++]; if (!t || (t.t !== 'id' && t.t !== 'num')) throw new Error(`bad member in "${src}"`); e = { k: 'mem', o: e, key: { k: 'lit', v: String(t.v) } }; continue; }
      if (peek('[')) { p++; const key = ternary(); eat(']'); e = { k: 'mem', o: e, key }; continue; }
      if (peek('(') && e.k === 'id') { p++; const args = []; if (!peek(')')) { args.push(ternary()); while (peek(',')) { p++; args.push(ternary()); } } eat(')'); e = { k: 'call', fn: e.v, args }; continue; }
      return e;
    }
  }
  function primary() {
    const t = toks[p++];
    if (!t) throw new Error(`unexpected end of "${src}"`);
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'ref') return { k: 'ref', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      return { k: 'id', v: t.v };
    }
    if (t.t === 'op' && t.v === '(') { const e = ternary(); eat(')'); return e; }
    if (t.t === 'op' && t.v === '[') { const items = []; if (!peek(']')) { items.push(ternary()); while (peek(',')) { p++; items.push(ternary()); } } eat(']'); return { k: 'arr', items }; }
    throw new Error(`unexpected "${t.v}" in "${src}"`);
  }
  const ast = ternary();
  if (p !== toks.length) throw new Error(`trailing tokens in "${src}"`);
  return ast;
}

const AST_CACHE = new Map();
const astOf = (src) => { let a = AST_CACHE.get(src); if (!a) { a = parse(src); AST_CACHE.set(src, a); } return a; };

export function hexToRgba(hex, a) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(full)) throw new Error(`bad colour "${hex}"`);
  const c = [0, 2, 4].map((i) => Math.round((parseInt(full.slice(i, i + 2), 16) / 255) * 1000) / 1000);
  const alpha = a ?? (full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1);
  return [...c, alpha];
}
const toColor = (v) => (typeof v === 'string' ? hexToRgba(v) : Array.isArray(v) ? (v.length === 3 ? [...v, 1] : v) : v);

function member(o, key) {
  if (o === undefined || o === null) return undefined;
  if (Array.isArray(o) || typeof o === 'string') {
    if (key === 'length') return o.length;
    const i = Number(key);
    if (Number.isInteger(i)) return o[i < 0 ? o.length + i : i];
  }
  if (typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
  return undefined;
}

function makeFunctions(scope) {
  const fps = () => scope.fps ?? 30;
  return {
    f: (n) => Math.round((Number(n) * fps()) / 30),
    t: (n) => scope.start + Math.round((Number(n) * fps()) / 30),
    min: Math.min, max: Math.max, round: (x, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; },
    floor: Math.floor, ceil: Math.ceil, abs: Math.abs, sqrt: Math.sqrt,
    sin: (deg) => Math.sin((deg * Math.PI) / 180), cos: (deg) => Math.cos((deg * Math.PI) / 180),
    len: (x) => (x === undefined || x === null ? 0 : Array.isArray(x) || typeof x === 'string' ? x.length : Object.keys(x).length),
    words: (s) => String(s ?? '').split(/\s+/).filter(Boolean),
    chars: (s) => String(s ?? '').replace(/\s+/g, '').length,
    rgba: (c, a) => { const v = toColor(c); return a === undefined ? v : [v[0], v[1], v[2], a]; },
    mix: (a, b, k) => { const x = toColor(a); const y = toColor(b); return x.map((v, i) => Math.round((v + (y[i] - v) * k) * 1000) / 1000); },
    repo: (rel) => (isAbsolute(String(rel)) ? String(rel) : join(REPO_ROOT, String(rel))).replace(/\\/g, '/'),
    num: Number, str: (x) => String(x),
    pick: (arr, i) => (Array.isArray(arr) && arr.length ? arr[((Math.floor(i) % arr.length) + arr.length) % arr.length] : undefined),
    upper: (s) => String(s ?? '').toUpperCase(),
    range: (n) => Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => i),
    append: (arr, ...items) => [...(Array.isArray(arr) ? arr : []), ...items],
    obj: (...kv) => { const o = {}; for (let i = 0; i + 1 < kv.length; i += 2) if (kv[i + 1] !== undefined && kv[i + 1] !== null) o[String(kv[i])] = kv[i + 1]; return o; },
    /** A setShapeMorph outline by name: square, rounded, circle, pill, star, burst, hexagon, triangle, diamond. */
    outline: (name, w, h = w) => {
      switch (name) {
        case 'square': return { type: 'rectangle', width: w, height: h, radius: 0 };
        case 'rounded': return { type: 'rectangle', width: w, height: h, radius: Math.min(w, h) * 0.22 };
        case 'pill': return { type: 'rectangle', width: w * 1.6, height: h * 0.62, radius: h * 0.31 };
        case 'circle': return { type: 'ellipse', width: w, height: w };
        case 'star': return { type: 'star', width: w * 1.2, height: h * 1.2, points: 5, innerRatio: 0.48 };
        case 'burst': return { type: 'star', width: w * 1.2, height: h * 1.2, points: 12, innerRatio: 0.72 };
        case 'hexagon': return { type: 'polygon', width: w * 1.1, height: h * 1.1, sides: 6 };
        case 'triangle': return { type: 'polygon', width: w * 1.15, height: h * 1.15, sides: 3 };
        case 'diamond': return { type: 'polygon', width: w * 1.1, height: h * 1.1, sides: 4 };
        default: throw new Error(`unknown outline "${name}" (square, rounded, pill, circle, star, burst, hexagon, triangle, diamond)`);
      }
    },
  };
}

function evalAst(n, scope, fns) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'id': {
      if (Object.prototype.hasOwnProperty.call(scope.vars, n.v)) return scope.vars[n.v];
      throw new Error(`unknown name "${n.v}"`);
    }
    case 'ref': return scope.results[n.v];
    case 'arr': return n.items.map((e) => evalAst(e, scope, fns));
    case 'mem': return member(evalAst(n.o, scope, fns), evalAst(n.key, scope, fns));
    case 'neg': return -evalAst(n.e, scope, fns);
    case 'not': return !evalAst(n.e, scope, fns);
    case 'cond': return evalAst(n.c, scope, fns) ? evalAst(n.a, scope, fns) : evalAst(n.b, scope, fns);
    case 'call': {
      const fn = fns[n.fn];
      if (!fn) throw new Error(`unknown function "${n.fn}"`);
      return fn(...n.args.map((a) => evalAst(a, scope, fns)));
    }
    case 'bin': {
      if (n.op === '&&') { const l = evalAst(n.l, scope, fns); return l ? evalAst(n.r, scope, fns) : l; }
      if (n.op === '||') { const l = evalAst(n.l, scope, fns); return l ? l : evalAst(n.r, scope, fns); }
      const l = evalAst(n.l, scope, fns); const r = evalAst(n.r, scope, fns);
      switch (n.op) {
        case '+': return typeof l === 'string' || typeof r === 'string' ? `${l}${r}` : l + r;
        case '-': return l - r; case '*': return l * r; case '/': return l / r; case '%': return l % r;
        case '<': return l < r; case '>': return l > r; case '<=': return l <= r; case '>=': return l >= r;
        case '==': return l === r; case '!=': return l !== r;
        default: throw new Error(`bad operator ${n.op}`);
      }
    }
    default: throw new Error(`bad node ${n.k}`);
  }
}

/** Evaluate one expression string against a scope { vars, results, start, fps }. */
export function evaluate(expr, scope) {
  if (typeof expr !== 'string') return expr;
  return evalAst(astOf(expr), scope, makeFunctions(scope));
}

/** A bare expression string (with or without {{ }}) or a literal JSON value. */
const exprOrValue = (v, scope) => (typeof v === 'string' ? evaluate(v.replace(/^\s*\{\{([\s\S]*)\}\}\s*$/, '$1'), scope) : resolveValue(v, scope));

const WHOLE = /^\{\{([\s\S]+)\}\}$/;
const PART = /\{\{([\s\S]+?)\}\}/g;

/** Resolve templates inside any JSON value. */
export function resolveValue(value, scope) {
  if (typeof value === 'string') {
    const m = WHOLE.exec(value);
    if (m && !m[1].includes('}}')) return evaluate(m[1], scope);
    if (!value.includes('{{')) return value;
    return value.replace(PART, (_, e) => { const v = evaluate(e, scope); return typeof v === 'object' ? JSON.stringify(v) : String(v); });
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, scope));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, scope)]));
  return value;
}

// ---------------------------------------------------------------------------------------------
// Loading and validation
// ---------------------------------------------------------------------------------------------

const PARAM_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'color', 'vec2', 'array', 'enum', 'ease', 'path', 'layerId']);

export function validateRecipe(r, file = r?.id) {
  const errs = [];
  if (!r || typeof r !== 'object') return [`${file}: not an object`];
  for (const k of ['id', 'name', 'category', 'description', 'steps']) if (!r[k]) errs.push(`${file}: missing "${k}"`);
  if (r.id && !/^[a-z0-9-]+$/.test(r.id)) errs.push(`${file}: id must be kebab-case`);
  if (!Array.isArray(r.source) || !r.source.length) errs.push(`${file}: "source" must name the references it was extracted from`);
  for (const [name, p] of Object.entries(r.params ?? {})) {
    if (!PARAM_TYPES.has(p.type)) errs.push(`${file}: param ${name} has unknown type ${p.type}`);
    if (!p.description) errs.push(`${file}: param ${name} needs a description`);
    if (p.type === 'enum' && !Array.isArray(p.enum)) errs.push(`${file}: enum param ${name} needs "enum"`);
    if (['start', 'end', 'fps', 'W', 'H', 'CX', 'CY', 'PX', 'PY', 'DUR'].includes(name)) errs.push(`${file}: param name ${name} is reserved`);
  }
  const walk = (steps, where) => {
    if (!Array.isArray(steps)) { errs.push(`${file}: ${where} steps must be an array`); return; }
    steps.forEach((s, i) => {
      const at = `${where}[${i}]`;
      const kinds = ['action', 'tool', 'let', 'forEach'].filter((k) => s[k] !== undefined);
      if (kinds.length !== 1) errs.push(`${file}: step ${at} needs exactly one of action / tool / let / forEach`);
      if (s.tool && !RECIPE_TOOLS.has(s.tool)) errs.push(`${file}: step ${at} tool ${s.tool} is not allowed in recipes`);
      if (s.forEach !== undefined) walk(s.steps, `${at}.steps`);
    });
  };
  walk(r.steps, 'steps');
  return errs;
}

/** Tools (beyond run_action) a recipe step may call. All read-only except import_image. */
export const RECIPE_TOOLS = new Set(['get_layer', 'measure_text', 'get_state', 'import_image']);

export function loadRecipes(dir = RECIPES_DIR) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const errs = validateRecipe(r, f);
    if (errs.length) throw new Error(errs.join('\n'));
    if (out.has(r.id)) throw new Error(`duplicate recipe id ${r.id}`);
    out.set(r.id, { ...r, file: f });
  }
  return out;
}

/** Compact catalogue entry (list_recipes). */
export function describeRecipe(r) {
  return {
    id: r.id, name: r.name, category: r.category, description: r.description,
    length30: r.length30, source: r.source, taste: r.taste,
    params: Object.fromEntries(Object.entries(r.params ?? {}).map(([k, p]) => [k, {
      type: p.type, ...(p.default !== undefined ? { default: p.default } : { required: true }),
      ...(p.enum ? { enum: p.enum } : {}), ...(p.min !== undefined ? { min: p.min } : {}), ...(p.max !== undefined ? { max: p.max } : {}),
      description: p.description,
    }])),
    ...(r.returns ? { returns: Object.keys(r.returns) } : {}),
    ...(r.example ? { example: r.example } : {}),
  };
}

/** Validate caller params against the schema, fill defaults, normalise colours. Throws on errors. */
export function normalizeParams(r, given = {}) {
  const errs = [];
  const out = {};
  const schema = r.params ?? {};
  for (const k of Object.keys(given ?? {})) if (!schema[k]) errs.push(`unknown param "${k}" (known: ${Object.keys(schema).join(', ')})`);
  for (const [k, p] of Object.entries(schema)) {
    let v = given?.[k];
    if (v === undefined || v === null) {
      if (p.default === undefined) { errs.push(`param "${k}" is required`); out[k] = null; continue; }
      if (p.default === null) { out[k] = null; continue; } // optional: the recipe derives a value
      v = p.default;
    }
    switch (p.type) {
      case 'number': case 'integer':
        if (typeof v !== 'number' || !Number.isFinite(v)) { errs.push(`param "${k}" must be a number`); break; }
        if (p.type === 'integer' && !Number.isInteger(v)) errs.push(`param "${k}" must be an integer`);
        if (p.min !== undefined && v < p.min) errs.push(`param "${k}" must be >= ${p.min}`);
        if (p.max !== undefined && v > p.max) errs.push(`param "${k}" must be <= ${p.max}`);
        break;
      case 'boolean': if (typeof v !== 'boolean') errs.push(`param "${k}" must be true or false`); break;
      case 'string': case 'path': case 'layerId': if (typeof v !== 'string') errs.push(`param "${k}" must be a string`); break;
      case 'enum': if (!p.enum.includes(v)) errs.push(`param "${k}" must be one of ${p.enum.join(' | ')}`); break;
      case 'color':
        try { v = toColor(v); if (!Array.isArray(v) || v.length !== 4 || v.some((x) => typeof x !== 'number')) throw new Error('x'); }
        catch { errs.push(`param "${k}" must be "#rrggbb" or [r, g, b, a] (0..1)`); }
        break;
      case 'vec2': if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'number')) errs.push(`param "${k}" must be [x, y]`); break;
      case 'array': if (!Array.isArray(v)) errs.push(`param "${k}" must be an array`); else if (p.items === 'color') v = v.map(toColor); break;
      case 'ease': if (!(typeof v === 'string' || (Array.isArray(v) && v.length === 4))) errs.push(`param "${k}" must be an ease name or [x1, y1, x2, y2]`); break;
      default: break;
    }
    out[k] = v;
  }
  if (errs.length) { const e = new Error(`${r.id}: ${errs.join('; ')}`); e.code = 'PARAMS'; throw e; }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------

/**
 * Expand and run a recipe.
 *   ctx  = { width, height, fps, durationFrames, startFrame, endFrame?, parentId?, parentPosition? }
 *   exec = async ({ kind: 'action' | 'tool', name, args }) => result  (an action result { ok, result, activeLayerId }
 *          or a tool's structured result); it must throw on failure.
 * Returns { id, start, end, layers: [{ id, name? }], returns, checkFrames, steps: [...] }.
 */
export async function runRecipe(recipe, givenParams, ctx, exec, { dryRun = false } = {}) {
  const params = normalizeParams(recipe, givenParams);
  const fps = ctx.fps ?? 30;
  const start = Math.round(ctx.startFrame ?? 0);
  const [PX, PY] = ctx.parentId ? (ctx.parentPosition ?? [0, 0]) : [0, 0];
  const vars = {
    ...params, start, fps, W: ctx.width, H: ctx.height, CX: ctx.width / 2, CY: ctx.height / 2, PX, PY,
    DUR: ctx.durationFrames, end: undefined,
  };
  const scope = { vars, results: {}, start, fps };
  const natural = Math.round((Number(recipe.length30 !== undefined ? exprOrValue(recipe.length30, scope) : 90) * fps) / 30);
  const end = ctx.endFrame !== undefined && ctx.endFrame !== null ? Math.round(ctx.endFrame) : start + natural;
  if (end <= start) throw new Error(`${recipe.id}: endFrame (${end}) must be after startFrame (${start})`);
  vars.end = end;
  for (const [k, e] of Object.entries(recipe.lets ?? {})) vars[k] = exprOrValue(e, scope);

  const layers = [];
  const log = [];
  let fakeId = 0;
  const runSteps = async (steps, path) => {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const at = `${path}[${i}]${s.id ? `#${s.id}` : ''}`;
      try {
        if (s.when !== undefined && !exprOrValue(s.when, scope)) {
          log.push({ at, skipped: true });
          continue;
        }
        if (s.let) { for (const [k, e] of Object.entries(s.let)) vars[k] = exprOrValue(e, scope); continue; }
        if (s.forEach !== undefined) {
          const list = exprOrValue(s.forEach, scope);
          if (!Array.isArray(list)) throw new Error('forEach did not evaluate to an array');
          const as = s.as ?? 'item'; const ix = s.index ?? 'i';
          const saved = [vars[as], vars[ix]];
          for (let k = 0; k < list.length; k++) { vars[as] = list[k]; vars[ix] = k; await runSteps(s.steps, `${at}{${k}}`); }
          [vars[as], vars[ix]] = saved;
          continue;
        }
        const kind = s.action ? 'action' : 'tool';
        const name = s.action ?? s.tool;
        const args = resolveValue(s.args ?? {}, scope);
        const id = s.id ? resolveValue(s.id, scope) : undefined;
        let result;
        if (dryRun) {
          fakeId++;
          result = { ok: true, dryRun: true, result: s.layer ? `layer_${fakeId}` : undefined, activeLayerId: `layer_${fakeId}` };
          log.push({ at, kind, name, args });
        } else {
          result = await exec({ kind, name, args });
          log.push({ at, kind, name, ok: true });
        }
        if (id) scope.results[id] = result;
        if (s.layer) {
          const layerId = typeof result?.result === 'string' ? result.result : result?.activeLayerId;
          if (!layerId) throw new Error('step is marked layer:true but returned no layer id');
          layers.push({ id: layerId, step: id ?? at, root: !!s.root, name: typeof args?.name === 'string' ? args.name : (args?.opts?.name ?? undefined) });
          if (s.root && ctx.parentId) {
            if (!dryRun) await exec({ kind: 'action', name: 'editor.setLayerParent', args: { childId: layerId, parentId: ctx.parentId } });
            else log.push({ at: `${at}+parent`, kind: 'action', name: 'editor.setLayerParent', args: { childId: layerId, parentId: ctx.parentId } });
          }
        }
      } catch (e) {
        const err = new Error(`${recipe.id} step ${at}: ${e.message}`);
        err.log = log;
        throw err;
      }
    }
  };
  await runSteps(recipe.steps, 'steps');

  // Clip every created layer to [start, end] when the caller fixed the end (a shot inside a longer comp).
  if (ctx.endFrame !== undefined && ctx.endFrame !== null && recipe.clip !== false) {
    for (const l of layers) {
      for (const [path, value] of [['inPoint', start], ['outPoint', end]]) {
        const args = { layerId: l.id, path, value };
        if (dryRun) log.push({ at: 'clip', kind: 'action', name: 'editor.updateLayerProperty', args });
        else await exec({ kind: 'action', name: 'editor.updateLayerProperty', args });
      }
    }
  }
  const returns = recipe.returns ? resolveValue(recipe.returns, scope) : {};
  const checkFrames = (recipe.checkFrames30 ?? []).map((e) => Math.min(end, start + Math.round((Number(exprOrValue(e, scope)) * fps) / 30)));
  return { id: recipe.id, start, end, layers, returns, checkFrames: [...new Set(checkFrames)].sort((a, b) => a - b), steps: dryRun ? log : log.length };
}
