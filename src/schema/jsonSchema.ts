import { z } from 'zod/v4';
import { makeSchemas } from './factory';
import { DECODE_CAPS, type Caps } from './caps';

// JSON Schema export for tool-use CONSTRAINED DECODING. Verified against zod/v4's `toJSONSchema`
// (see scripts/verify-schema.mjs), not assumed. Findings that shaped this:
//   • `.strict()` → `additionalProperties:false` (kept — an unexpected key means the model
//     misunderstood, and we want the decoder to forbid it).
//   • discriminated unions → `anyOf` + a `const` discriminator (constrained-decoding friendly).
//   • defaults: exported with `io:'input'` so a defaulted field is OPTIONAL in the tool schema —
//     the Coder isn't forced to emit values it can omit.
//   • `.refine`/`.superRefine` are DROPPED from JSON Schema (runtime-only). That is the deliberate
//     line: structural constraints (int/min/max/enum/length) reach the decoder; semantic/cross-
//     field checks live in the separate semantic validator and never constrain decoding.
//   • RECURSION forces `$ref`, which some decoders reject. The constrained-decoding targets below
//     are all non-recursive; `assertDecodable` throws if a `$ref`/`$defs` ever sneaks in.

export interface JsonSchemaOptions {
  /** 'input' (default) makes defaulted fields optional — correct for tool definitions. */
  io?: 'input' | 'output';
  target?: 'draft-7' | 'draft-2020-12';
}

export function toJsonSchema(schema: z.ZodType, opts: JsonSchemaOptions = {}): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    io: opts.io ?? 'input',
    target: opts.target ?? 'draft-2020-12',
    // Anything Zod can't represent (there shouldn't be any in the decoding targets) becomes a
    // permissive `{}` rather than throwing, so a stray refinement never breaks export.
    unrepresentable: 'any',
  }) as Record<string, unknown>;
}

/** Deep-scan a JSON Schema for `$ref`/`$defs`/`definitions` — the constrained-decoding red flags. */
export function findRefs(node: unknown, path = '$'): string[] {
  const hits: string[] = [];
  const walk = (n: unknown, p: string) => {
    if (Array.isArray(n)) { n.forEach((v, i) => walk(v, `${p}[${i}]`)); return; }
    if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (k === '$ref' || k === '$defs' || k === 'definitions') hits.push(`${p}.${k}`);
        walk(v, `${p}.${k}`);
      }
    }
  };
  walk(node, path);
  return hits;
}

/** Export a schema for constrained decoding and assert it is `$ref`-free (throws with the paths). */
export function assertDecodable(schema: z.ZodType, name: string, opts?: JsonSchemaOptions): Record<string, unknown> {
  const js = toJsonSchema(schema, opts);
  const refs = findRefs(js);
  if (refs.length) {
    throw new Error(
      `[schema] ${name} is not constrained-decoding-safe: found $ref/$defs at ${refs.join(', ')}. ` +
      `Make it non-recursive before exporting for tool use.`,
    );
  }
  return js;
}

/** The three schemas handed to a model for constrained decoding. Defaults to the FROZEN DECODE_CAPS
 *  so the tool definition — and thus the prompt-cache prefix — is stable across tiers. Pass explicit
 *  caps only for testing; production always uses the frozen ceiling. */
export function exportDecodingSchemas(caps: Caps = DECODE_CAPS): {
  coderFragment: Record<string, unknown>;
  directorOutput: Record<string, unknown>;
  patch: Record<string, unknown>;
} {
  const s = makeSchemas(caps);
  return {
    coderFragment: assertDecodable(s.coderFragment, 'coderFragment'),
    directorOutput: assertDecodable(s.directorOutput, 'directorOutput'),
    patch: assertDecodable(s.patch, 'patch'),
  };
}
