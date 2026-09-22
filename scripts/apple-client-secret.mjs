// Generate the "Sign in with Apple" client secret (an ES256-signed JWT) to paste into the Supabase
// Apple provider's "Secret Key (for OAuth)" field. Runs entirely on YOUR machine with Node's built-in
// crypto - your .p8 private key never leaves the box and never goes to the repo. Apple caps this JWT at
// ~6 months, so re-run it before it expires. See docs/AUTH-SETUP.md for where each id comes from.
//
// Usage (flags or the matching APPLE_* env vars; flags win):
//   node scripts/apple-client-secret.mjs \
//     --team ABCDE12345 \            # Team ID (developer.apple.com, top-right)
//     --services studio.flashfx.web \# Services ID (the web "Client ID" = the JWT's sub)
//     --kid XYZ9876543 \             # Key ID (Keys -> your Sign in with Apple key)
//     --p8 ./AuthKey_XYZ9876543.p8 \ # path to the downloaded private key
//     --days 180                     # optional, 1..180 (default 180)
//
// The JWT prints to STDOUT (nothing else), so you can pipe it:  ... > apple-secret.txt
// Do NOT commit the .p8 or the generated JWT.

import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

function argVal(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const die = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

const teamId = argVal('team') ?? process.env.APPLE_TEAM_ID;
const servicesId = argVal('services') ?? process.env.APPLE_SERVICES_ID ?? process.env.APPLE_CLIENT_ID;
const keyId = argVal('kid') ?? process.env.APPLE_KEY_ID;
const p8Path = argVal('p8') ?? process.env.APPLE_P8_PATH;
const days = Math.min(180, Math.max(1, Math.round(Number(argVal('days') ?? 180))));

if (!teamId || !servicesId || !keyId || !p8Path) {
  die('missing required input. Need --team, --services, --kid, --p8 (or the APPLE_* env vars). See the header of this file.');
}
if (Number.isNaN(days)) die('--days must be a number (1..180)');

let pem;
try { pem = readFileSync(p8Path, 'utf8'); } catch { die(`could not read the .p8 key at "${p8Path}"`); }
if (!/BEGIN PRIVATE KEY/.test(pem)) die('that file does not look like an Apple .p8 (PKCS#8) private key');

let key;
try { key = crypto.createPrivateKey(pem); } catch (e) { die(`could not parse the private key: ${e.message}`); }

const now = Math.floor(Date.now() / 1000);
const exp = now + days * 86400;
const header = { alg: 'ES256', kid: keyId };
const payload = { iss: teamId, iat: now, exp, aud: 'https://appleid.apple.com', sub: servicesId };
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

let sig;
try {
  // ES256 = ECDSA P-256 + SHA-256; JOSE needs the raw r||s signature, not DER -> dsaEncoding ieee-p1363.
  sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
} catch (e) {
  die(`signing failed (is this a Sign in with Apple ES256/P-256 key?): ${e.message}`);
}

const jwt = `${signingInput}.${b64url(sig)}`;

// Human context to stderr so stdout stays a clean, pipeable JWT.
console.error(`✓ Apple client secret generated for sub=${servicesId}`);
console.error(`  expires ${new Date(exp * 1000).toISOString()} (${days} days) - regenerate before then.`);
console.error('  Paste the line below into Supabase -> Authentication -> Providers -> Apple -> "Secret Key (for OAuth)".\n');
console.log(jwt);
