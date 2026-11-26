// Build the FlashFX Link package (docs/MCP-PRODUCT-ARCHITECTURE.md, phase 0 / v1):
//   packages/flashfx-mcp/server/index.mjs   one-file esbuild bundle of mcp/flashfx-mcp.mjs + mcp/lib/*
//   packages/flashfx-mcp/server/*.md         TASTE.md + AUTHORING.md (served as resources / prompts)
//   packages/flashfx-mcp/server/packaged.json  marks the packaged defaults (auto mode, editor.flashfx.app)
//   packages/flashfx-mcp/recipes/, skill/, access/allowlist.json
//   packages/flashfx-mcp/flashfx.mcpb         the Claude Desktop extension (a zip, manifest.json at the root)
// No dependency beyond the installed esbuild; the zip is written by hand (deflate + crc32 from node:zlib).
//   node scripts/build-mcp-package.mjs [--no-zip]
// Publishing to npm and hosting the .mcpb on flashfx.app are owner-approved release actions (not done here).

import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PKG = join(ROOT, 'packages/flashfx-mcp');
const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(PKG, 'manifest.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error(`package.json ${pkg.version} != manifest.json ${manifest.version}`);

for (const d of ['server', 'recipes', 'skill', 'access']) rmSync(join(PKG, d), { recursive: true, force: true });
mkdirSync(join(PKG, 'server'), { recursive: true });

await build({
  entryPoints: [join(ROOT, 'mcp/flashfx-mcp.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(PKG, 'server/index.mjs'),
  logLevel: 'error',
  legalComments: 'none',
});
const bundle = readFileSync(join(PKG, 'server/index.mjs'), 'utf8');
if (/\.\.\/\.\.\/scripts\//.test(bundle) || /from ['"]esbuild['"]/.test(bundle)) throw new Error('bundle still reaches into scripts/ or esbuild');

for (const doc of ['TASTE.md', 'AUTHORING.md']) cpSync(join(ROOT, 'mcp', doc), join(PKG, 'server', doc));
cpSync(join(ROOT, 'mcp/recipes'), join(PKG, 'recipes'), { recursive: true });
cpSync(join(ROOT, 'mcp/skill'), join(PKG, 'skill'), { recursive: true });
mkdirSync(join(PKG, 'access'), { recursive: true });
cpSync(join(ROOT, 'mcp/access/allowlist.json'), join(PKG, 'access/allowlist.json'));
writeFileSync(join(PKG, 'server/packaged.json'), `${JSON.stringify({ packaged: true, name: pkg.name, version: pkg.version }, null, 2)}\n`);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Minimal zip writer (deflate, no zip64): enough for a few hundred KB of text. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); // fixed 1980-01-01 timestamp: reproducible bytes
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const included = ['manifest.json', 'package.json', 'README.md', ...['server', 'recipes', 'skill', 'access'].flatMap((d) => walk(join(PKG, d)).map((p) => relative(PKG, p)))]
  .map((p) => p.split(sep).join('/'))
  .sort();
if (!process.argv.includes('--no-zip')) {
  const out = join(PKG, 'flashfx.mcpb');
  const buf = zip(included.map((name) => ({ name, data: readFileSync(join(PKG, name)) })));
  writeFileSync(out, buf);
  console.log(`wrote ${relative(ROOT, out)} (${included.length} files, ${(buf.length / 1024).toFixed(0)} KB)`);
}
console.log(`built packages/flashfx-mcp ${pkg.version}: server/index.mjs ${(bundle.length / 1024).toFixed(0)} KB`);
if (!existsSync(join(PKG, 'recipes/kinetic-title.json'))) throw new Error('recipes missing from the package');
