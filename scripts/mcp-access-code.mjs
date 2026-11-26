// Issue a FlashFX Link early-access code (docs/MCP-PRODUCT-ARCHITECTURE.md, "Early-access gate").
// Prints the code (give it to the user once; it is not stored anywhere) and the allowlist entry (hash only).
//
//   node scripts/mcp-access-code.mjs [--kind founding|early|team] [--label early-01] [--add] [--allowlist PATH]
//
// --add appends the entry to mcp/access/allowlist.json (the file ships inside the FlashFX Link package, so
// a new code works after the next package build). The label is PUBLIC: use "early-01", never an email.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_ALLOWLIST, hashCode, readAllowlist } from '../mcp/lib/entitlement.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const kind = arg('kind', 'early');
const label = arg('label', `${kind}-${new Date().toISOString().slice(0, 10)}`);
const path = arg('allowlist', DEFAULT_ALLOWLIST);
if (!['founding', 'early', 'team'].includes(kind)) { console.error('--kind must be founding, early or team'); process.exit(1); }
if (/@/.test(label)) { console.error('--label is public: do not put an email in it'); process.exit(1); }

// 130 random bits in Crockford base32 (no I, L, O, U): FFX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const bytes = randomBytes(17);
let bits = 0n;
for (const b of bytes) bits = (bits << 8n) | BigInt(b);
let body = '';
for (let i = 0; i < 26; i++) { body += ALPHA[Number(bits & 31n)]; bits >>= 5n; }
const code = `FFX-${body.match(/.{1,5}/g).join('-')}`;
const entry = { hash: hashCode(code), kind, label, issued: new Date().toISOString().slice(0, 10) };

if (argv.includes('--add')) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const list = readAllowlist(path);
  raw.codes = [...list.codes, entry];
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
  console.error(`added to ${path}`);
}
console.log(JSON.stringify({ code, entry }, null, 2));
