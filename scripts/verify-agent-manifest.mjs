// Acceptance harness for the agent-mode feature manifest (src/agent/featureManifest.ts) and the
// window.__ffxAgent whitelist (src/agent/runtime.ts). Run: npm run verify:agent-manifest
//
// The editor store cannot be imported in Node (it pulls in WebGPU / WebCodecs / IndexedDB / workers),
// so "resolves on the real stores" is proven against the store SOURCE with the TypeScript compiler
// API: every whitelisted action must be a function member of the store's state interface, be
// implemented in the store's create() body, and declare the same parameter names / order /
// optionality the manifest advertises. String-enum params are cross-checked against the declared
// literal unions where the type is resolvable. (tsc separately proves the method names via the
// EditorMethod / HistoryMethod types in featureManifest.ts.)

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { generateAgentManifest } from './gen-agent-manifest.mjs';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const parse = (file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const nameOf = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : undefined);

/** Function members of `interface <name>` -> Map(method -> [{ name, optional, typeNode }]). */
function interfaceMethods(sf, ifaceName) {
  let iface;
  sf.forEachChild((n) => { if (ts.isInterfaceDeclaration(n) && n.name.text === ifaceName) iface = n; });
  assert.ok(iface, `interface ${ifaceName} not found in ${sf.fileName}`);
  const out = new Map();
  for (const m of iface.members) {
    const key = nameOf(m.name);
    if (!key) continue;
    let params;
    if (ts.isMethodSignature(m)) params = m.parameters;
    else if (ts.isPropertySignature(m) && m.type && ts.isFunctionTypeNode(m.type)) params = m.type.parameters;
    if (!params) continue;
    out.set(key, params.map((p) => ({ name: p.name.getText(sf), optional: !!p.questionToken || !!p.initializer, typeNode: p.type })));
  }
  return out;
}

/** Property names of the object literal returned by `create<StateName>(...)`. */
function createBodyKeys(sf, stateName) {
  const keys = new Set();
  const visit = (n) => {
    if (ts.isCallExpression(n) && n.typeArguments?.[0]?.getText(sf) === stateName) {
      const findObj = (x) => {
        if (ts.isObjectLiteralExpression(x)) {
          for (const p of x.properties) { const k = nameOf(p.name); if (k) keys.add(k); }
          return;
        }
        x.forEachChild(findObj);
      };
      n.arguments.forEach(findObj);
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return keys;
}

/** HELPERS object in runtime.ts -> Map(helper -> [param names]). */
function runtimeHelpers(sf) {
  const out = new Map();
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'HELPERS' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        const k = nameOf(p.name);
        const fn = ts.isPropertyAssignment(p) ? p.initializer : undefined;
        if (k && fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) out.set(k, fn.parameters.map((q) => q.name.getText(sf)));
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

/** `export type X = 'a' | 'b'` string-literal unions across src/ (by alias name). */
function literalAliases() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e) && !e.endsWith('.d.ts')) {
        const text = readFileSync(p, 'utf8');
        if (!text.includes('export type ')) continue;
        const sf = ts.createSourceFile(p, text, ts.ScriptTarget.Latest, true);
        sf.forEachChild((n) => {
          if (ts.isTypeAliasDeclaration(n)) {
            const lits = unionLiterals(n.type);
            if (lits) out.set(n.name.text, lits);
          }
        });
      }
    }
  };
  walk('src');
  return out;
}

function unionLiterals(t) {
  if (!t) return null;
  const parts = ts.isUnionTypeNode(t) ? t.types : [t];
  const lits = [];
  for (const x of parts) {
    if (ts.isLiteralTypeNode(x) && ts.isStringLiteral(x.literal)) lits.push(x.literal.text);
    else if (x.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(x) && x.literal.kind === ts.SyntaxKind.NullKeyword)) continue;
    else return null;
  }
  return lits.length ? lits : null;
}

/** Declared literal values for a param type node (inline union or a resolvable alias), else null. */
function declaredLiterals(typeNode, aliases) {
  if (!typeNode) return null;
  const inline = unionLiterals(typeNode);
  if (inline) return inline;
  const parts = ts.isUnionTypeNode(typeNode) ? typeNode.types : [typeNode];
  const lits = [];
  for (const x of parts) {
    if (ts.isTypeReferenceNode(x) && aliases.has(x.typeName.getText())) lits.push(...aliases.get(x.typeName.getText()));
    else if (x.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(x) && x.literal.kind === ts.SyntaxKind.NullKeyword)) continue;
    else return null;
  }
  return lits.length ? lits : null;
}

const STATUSES = new Set(['shipped', 'browser-gated', 'partial']);

const manifest = await generateAgentManifest();
const json = JSON.parse(JSON.stringify(manifest));

console.log('verify:agent-manifest');

check('manifest serializes to JSON and parses back identically', () => {
  assert.deepEqual(json, manifest);
  assert.equal(typeof json.schemaVersion, 'number');
  assert.match(json.version, /^\d+\./);
  assert.ok(json.generatedAt && json.gitCommit);
  assert.ok(Array.isArray(json.features) && json.features.length >= 30, 'expected a substantial feature list');
  assert.ok(Array.isArray(json.actions) && json.actions.length >= 50, 'expected a substantial action whitelist');
});

check('feature ids are unique and well-formed', () => {
  const ids = json.features.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate feature ids: ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
  for (const f of json.features) {
    for (const k of ['id', 'area', 'name', 'description', 'ui']) assert.ok(typeof f[k] === 'string' && f[k].length > 0, `${f.id}.${k}`);
    assert.ok(STATUSES.has(f.status), `${f.id}: bad status ${f.status}`);
    assert.ok(Array.isArray(f.actions), `${f.id}.actions`);
  }
});

check('action ids are unique and equal "<store>.<method>"', () => {
  const ids = json.actions.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate action ids: ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
  for (const a of json.actions) {
    assert.equal(a.id, `${a.store}.${a.method}`);
    assert.ok(['editor', 'history', 'agent'].includes(a.store), `${a.id}: bad store`);
    assert.equal(typeof a.undoable, 'boolean', `${a.id}.undoable`);
    assert.ok(a.description, `${a.id}.description`);
    const pnames = a.params.map((p) => p.name);
    assert.equal(new Set(pnames).size, pnames.length, `${a.id}: duplicate param names`);
  }
});

check('every feature action reference resolves, and every action belongs to a feature', () => {
  const actionIds = new Set(json.actions.map((a) => a.id));
  const used = new Set();
  for (const f of json.features) for (const id of f.actions) {
    assert.ok(actionIds.has(id), `feature ${f.id} references unknown action ${id}`);
    used.add(id);
  }
  const orphans = [...actionIds].filter((id) => !used.has(id));
  assert.deepEqual(orphans, [], `actions not listed under any feature: ${orphans.join(', ')}`);
});

check('catalogs are populated and catalog-typed params point at a real catalog', () => {
  for (const [k, v] of Object.entries(json.catalogs)) {
    assert.ok(Array.isArray(v) && v.length > 0, `catalog ${k} is empty`);
    const ids = v.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `catalog ${k} has duplicate ids`);
  }
  for (const a of json.actions) for (const p of a.params) {
    if (p.catalog) assert.ok(json.catalogs[p.catalog], `${a.id}.${p.name}: unknown catalog ${p.catalog}`);
  }
});

const editorSf = parse('src/store/editor.ts');
const historySf = parse('src/store/history.ts');
const runtimeSf = parse('src/agent/runtime.ts');
const stores = {
  editor: { methods: interfaceMethods(editorSf, 'EditorState'), impl: createBodyKeys(editorSf, 'EditorState') },
  history: { methods: interfaceMethods(historySf, 'HistoryState'), impl: createBodyKeys(historySf, 'HistoryState') },
};
const helpers = runtimeHelpers(runtimeSf);
const aliases = literalAliases();

check('every whitelisted editor/history action is a declared + implemented store function', () => {
  for (const a of json.actions.filter((x) => x.store !== 'agent')) {
    const s = stores[a.store];
    assert.ok(s.methods.has(a.method), `${a.id}: ${a.method} is not a function member of the ${a.store} store state`);
    assert.ok(s.impl.has(a.method), `${a.id}: ${a.method} is declared but not implemented in the ${a.store} store body`);
  }
});

check('manifest params match the store signatures (names, order, optionality)', () => {
  for (const a of json.actions.filter((x) => x.store !== 'agent')) {
    const declared = stores[a.store].methods.get(a.method);
    assert.deepEqual(a.params.map((p) => p.name), declared.map((p) => p.name), `${a.id}: param names/order differ from the store`);
    a.params.forEach((p, i) => {
      assert.equal(!!p.optional, declared[i].optional, `${a.id}.${p.name}: optional flag differs from the store`);
    });
  }
});

let enumChecked = 0;
check('string-enum params match the declared literal unions', () => {
  for (const a of json.actions.filter((x) => x.store !== 'agent')) {
    const declared = stores[a.store].methods.get(a.method);
    a.params.forEach((p, i) => {
      if (!p.values) return;
      const lits = declaredLiterals(declared[i].typeNode, aliases);
      if (!lits) return; // indexed-access / non-literal type: covered by tsc + manual review
      assert.deepEqual([...p.values].sort(), [...new Set(lits)].sort(), `${a.id}.${p.name}: values differ from the declared type`);
      enumChecked++;
    });
  }
  assert.ok(enumChecked >= 8, `expected to cross-check most enums, only checked ${enumChecked}`);
});

check('agent helper actions exist in runtime HELPERS with matching params', () => {
  const agentActions = json.actions.filter((x) => x.store === 'agent');
  for (const a of agentActions) {
    assert.ok(helpers.has(a.method), `${a.id}: no HELPERS.${a.method} in src/agent/runtime.ts`);
    assert.deepEqual(a.params.map((p) => p.name), helpers.get(a.method), `${a.id}: helper param names differ`);
  }
  assert.deepEqual([...helpers.keys()].sort(), agentActions.map((a) => a.method).sort(), 'every helper must be whitelisted (and only those)');
});

check('runtime dispatch is whitelist-only (no eval / Function / dynamic store lookup)', () => {
  const src = readFileSync('src/agent/runtime.ts', 'utf8');
  assert.ok(!/\beval\s*\(/.test(src) && !/new Function\s*\(/.test(src), 'runtime must not eval');
  assert.ok(src.includes('ACTIONS_BY_ID.get(actionId)'), 'run() must look actions up in the manifest whitelist');
  assert.ok(src.includes('installAgentRuntime'), 'installer missing');
  const main = readFileSync('src/main.tsx', 'utf8');
  assert.ok(/import \{ installAgentRuntime \} from '\.\/agent\/runtime'/.test(main) && /installAgentRuntime\(\)/.test(main), 'runtime must be installed from src/main.tsx');
});

check('catalog ids line up with the action params that consume them', () => {
  const tap = json.catalogs.textAnimatorPresets.map((e) => e.id);
  for (const id of ['type-on', 'fade-in', 'pop-in', 'blur-in']) assert.ok(tap.includes(id), `text animator preset ${id} missing`);
  assert.ok(json.catalogs.easings.some((e) => e.id === 'backOut'));
});

console.log(`\n${passed} checks passed (${json.features.length} features, ${json.actions.length} actions, ${enumChecked} enum params cross-checked).`);
