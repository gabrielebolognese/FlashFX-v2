// Aggregate test runner: runs every `verify:*` harness in package.json sequentially,
// prints PASS/FAIL per harness, and exits non-zero if any fail. There is no test
// framework in this repo — the ~50 esbuild+node:assert harnesses ARE the test suite,
// and this is the single `npm test` entry point that runs them all (used by CI).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts ?? {};
const verifies = Object.keys(scripts).filter((k) => k.startsWith('verify:')).sort();

if (verifies.length === 0) {
  console.error('No verify:* scripts found in package.json.');
  process.exit(1);
}

console.log(`Running ${verifies.length} verify harnesses…\n`);
const failed = [];
for (const name of verifies) {
  process.stdout.write(`  ${name.padEnd(28)} `);
  const res = spawnSync('npm', ['run', '--silent', name], {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (res.status === 0) {
    console.log('PASS');
  } else {
    console.log('FAIL');
    failed.push({ name, out: `${res.stdout ?? ''}${res.stderr ?? ''}` });
  }
}

console.log('');
if (failed.length > 0) {
  console.log(`✖ ${failed.length}/${verifies.length} harness(es) failed:`);
  for (const f of failed) {
    console.log(`\n─── ${f.name} ───`);
    console.log(f.out.trim().split('\n').slice(-20).join('\n'));
  }
  process.exit(1);
}
console.log(`✓ all ${verifies.length} verify harnesses passed`);
