// Aggregate test runner: runs every `verify:*` harness in package.json, prints PASS/FAIL per
// harness (sorted by name), and exits non-zero if any fail. There is no test framework in this
// repo — the esbuild+node:assert harnesses ARE the test suite, and this is the single `npm test`
// entry point that runs them all (used by CI).
//
// Harnesses are independent (each bundles into its own mkdtemp dir; servers bind port 0), so they
// run in a bounded worker pool. Concurrency: TEST_CONCURRENCY env, default = CPU count (max 16).
// TEST_CONCURRENCY=1 restores the old strictly sequential behaviour.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { availableParallelism, cpus } from 'node:os';

const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts ?? {};
const verifies = Object.keys(scripts).filter((k) => k.startsWith('verify:')).sort();

if (verifies.length === 0) {
  console.error('No verify:* scripts found in package.json.');
  process.exit(1);
}

const cores = typeof availableParallelism === 'function' ? availableParallelism() : cpus().length;
const concurrency = Math.max(1, Number(process.env.TEST_CONCURRENCY) || Math.min(16, cores));
const started = Date.now();
console.log(`Running ${verifies.length} verify harnesses (concurrency ${concurrency})…\n`);

function run(name) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', '--silent', name], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ name, ok: false, out: `${out}\n${e}` }));
    child.on('close', (code) => resolve({ name, ok: code === 0, out }));
  });
}

const results = new Map();
let next = 0;
async function worker() {
  while (next < verifies.length) {
    const name = verifies[next++];
    results.set(name, await run(name));
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, verifies.length) }, worker));

const failed = [];
for (const name of verifies) {
  const r = results.get(name);
  console.log(`  ${name.padEnd(28)} ${r.ok ? 'PASS' : 'FAIL'}`);
  if (!r.ok) failed.push(r);
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log('');
if (failed.length > 0) {
  console.log(`✖ ${failed.length}/${verifies.length} harness(es) failed (${secs}s):`);
  for (const f of failed) {
    console.log(`\n─── ${f.name} ───`);
    console.log(String(f.out).trim().split('\n').slice(-20).join('\n'));
  }
  process.exit(1);
}
console.log(`✓ all ${verifies.length} verify harnesses passed (${secs}s)`);
