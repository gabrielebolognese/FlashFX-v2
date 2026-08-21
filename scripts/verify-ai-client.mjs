// Acceptance harness for the Anthropic wire client (src/ai/director/client.ts). The one client is
// shared by BOTH stages, which force DIFFERENT tools (Director → emit_director_output, Coder →
// emit_coder_fragment). A prior version pinned the Director's tool name, so the same client silently
// failed the Coder stage — the bug this pins. No test runner in this repo (see CLAUDE.md); bundles
// the real TS with esbuild + node:assert. Run: node scripts/verify-ai-client.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'aiclient-verify-'));
const outfile = join(tmp, 'client.mjs');

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

try {
  await build({
    entryPoints: ['src/ai/director/client.ts'],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  });
  const { createAnthropicClient } = await import(pathToFileURL(outfile).href);

  // A fake fetch that echoes the forced tool name back as a tool_use block (unless overridden).
  const makeFetch = (opts = {}) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      if (opts.notOk) return { ok: false, status: 401, async text() { return 'bad key'; }, async json() { return {}; } };
      const forced = JSON.parse(init.body).tool_choice.name;
      const name = opts.blockName ?? forced;
      const content = opts.noTool
        ? [{ type: 'text', text: 'prose reply' }]
        : [{ type: 'tool_use', name, input: { ok: true, tool: name } }];
      return {
        ok: true,
        status: 200,
        async json() {
          return { content, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 3 } };
        },
        async text() { return ''; },
      };
    };
    return { fetchImpl, calls };
  };
  const reqFor = (name) => ({ model: 'm', max_tokens: 1, system: [], messages: [], tools: [], tool_choice: { type: 'tool', name } });

  await check('Director tool block is matched (emit_director_output)', async () => {
    const { fetchImpl } = makeFetch();
    const c = createAnthropicClient({ apiKey: 'k', fetchImpl });
    const r = await c.createMessage(reqFor('emit_director_output'));
    assert.deepEqual(r.toolInput, { ok: true, tool: 'emit_director_output' });
  });

  await check('Coder tool block is matched via the same client (the bug fix)', async () => {
    const { fetchImpl } = makeFetch();
    const c = createAnthropicClient({ apiKey: 'k', fetchImpl });
    const r = await c.createMessage(reqFor('emit_coder_fragment'));
    assert.deepEqual(r.toolInput, { ok: true, tool: 'emit_coder_fragment' });
  });

  await check('usage is mapped from the Anthropic field names', async () => {
    const { fetchImpl } = makeFetch();
    const c = createAnthropicClient({ apiKey: 'k', fetchImpl });
    const r = await c.createMessage(reqFor('emit_director_output'));
    assert.deepEqual(r.usage, { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 3 });
  });

  await check('falls back to the sole tool_use block when the name differs', async () => {
    const { fetchImpl } = makeFetch({ blockName: 'some_other_tool' });
    const c = createAnthropicClient({ apiKey: 'k', fetchImpl });
    const r = await c.createMessage(reqFor('emit_coder_fragment'));
    assert.deepEqual(r.toolInput, { ok: true, tool: 'some_other_tool' });
  });

  await check('BYOK adds the direct-browser-access header only when opted in', async () => {
    const withFlag = makeFetch();
    await createAnthropicClient({ apiKey: 'k', fetchImpl: withFlag.fetchImpl, dangerousDirectBrowserAccess: true }).createMessage(reqFor('emit_director_output'));
    assert.equal(withFlag.calls[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(withFlag.calls[0].headers['x-api-key'], 'k');

    const noFlag = makeFetch();
    await createAnthropicClient({ apiKey: 'k', fetchImpl: noFlag.fetchImpl }).createMessage(reqFor('emit_director_output'));
    assert.equal(noFlag.calls[0].headers['anthropic-dangerous-direct-browser-access'], undefined);
  });

  await check('proxy baseUrl is used verbatim for the endpoint', async () => {
    const { fetchImpl, calls } = makeFetch();
    await createAnthropicClient({ apiKey: 'proxy', baseUrl: 'https://proxy.example.com', fetchImpl }).createMessage(reqFor('emit_director_output'));
    assert.equal(calls[0].url, 'https://proxy.example.com/v1/messages');
  });

  await check('a prose reply (no tool_use block) throws', async () => {
    const { fetchImpl } = makeFetch({ noTool: true });
    const c = createAnthropicClient({ apiKey: 'k', fetchImpl });
    await assert.rejects(() => c.createMessage(reqFor('emit_director_output')), /did not return a tool call/);
  });

  await check('a non-ok HTTP response throws with the status', async () => {
    const { fetchImpl } = makeFetch({ notOk: true });
    const c = createAnthropicClient({ apiKey: 'k', fetchImpl });
    await assert.rejects(() => c.createMessage(reqFor('emit_director_output')), /401/);
  });

  console.log(`\nai-client: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
