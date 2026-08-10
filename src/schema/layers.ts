import { z } from 'zod/v4';
import {
  AI_LAYER_TYPES, DOCUMENT_LAYER_TYPES, BLEND_MODES, TEXT_ALIGN, TEXT_VALIGN, VERTEX_TYPES,
} from './enums';
import {
  zNamespacedId, zId, zSemanticName, zFrame, zVec2, zAiColor,
} from './primitives';
import { makeAiNumberProp, makeAiTransform } from './properties';
import { makeClonerConfig } from './cloner';
import { zMotionPresetAttachment } from './presetParams';
import type { Caps } from './caps';

export { zMotionPresetAttachment };

// LAYERS in two forms (see properties.ts for the same split rationale):
//   • makeAiLayer(caps) — the STRICT, closed, compact union the Coder emits. Colors are ROLE
//     references (never literals). Every layer carries `panelId` (explicit membership, so panel and
//     layer cannot desync) and a namespaced `id` that assembly MUST preserve verbatim.
//   • zDocumentLayer — the round-trip form. Core identity/timing fields are validated; the rich
//     per-type payload + decorations (shadow/glow/blur/masks/material/pattern) PASS THROUGH so a
//     hand-authored scene round-trips LOSSLESSLY. Deliberately preserve-not-lock (see summary).

function aiBase(caps: Caps) {
  return {
    id: zNamespacedId,
    name: zSemanticName,
    // Membership is the enclosing fragment — no panelId here (it would be pure drift risk). Assembly
    // writes panelId onto the DOCUMENT layer, where panels are time ranges in one composition.
    parentId: zNamespacedId.nullable().default(null),
    blendMode: z.enum(BLEND_MODES).default('normal'),
    visible: z.boolean().default(true),
    transform: makeAiTransform(caps).optional(),
    /** Visible window; defaults to the owning panel's range at assembly when omitted. */
    in: zFrame.optional(),
    out: zFrame.optional(),
    presets: z.array(zMotionPresetAttachment).max(6).optional(),
  };
}

export function makeAiLayer(caps: Caps) {
  const num = makeAiNumberProp(caps);
  const base = aiBase(caps);

  const aiVertex = z.strictObject({
    position: zVec2,
    handleIn: zVec2.optional(),
    handleOut: zVec2.optional(),
    vertexType: z.enum(VERTEX_TYPES).default('corner'),
  });
  const shapeGeom = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('rectangle'), width: num, height: num, borderRadius: num.optional() }),
    z.strictObject({ type: z.literal('circle'), radius: num }),
    z.strictObject({ type: z.literal('star'), points: z.int().min(3), outerRadius: num, innerRadius: num }),
    z.strictObject({ type: z.literal('polygon'), vertices: z.array(aiVertex).min(2), closed: z.boolean().default(true) }),
  ]);

  const aiShape = z.strictObject({
    ...base, type: z.literal('shape'),
    shape: shapeGeom,
    fill: zAiColor.optional(),
    stroke: zAiColor.optional(),
    strokeWidth: num.optional(),
  });

  const aiSpan = z.strictObject({
    text: z.string(),
    fontFamily: z.string().optional(),
    fontWeight: z.int().min(100).max(900).optional(),
    fontStyle: z.enum(['normal', 'italic']).optional(),
    fontSize: z.number().positive().optional(),
    color: zAiColor.optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().positive().optional(),
  });
  const aiText = z.strictObject({
    ...base, type: z.literal('text'),
    spans: z.array(aiSpan).min(1),
    align: z.enum(TEXT_ALIGN).default('left'),
    valign: z.enum(TEXT_VALIGN).default('top'),
    /** Text box: 'auto' (point text) or a fixed box (enables wrap + fit checks in the validator). */
    box: z.union([z.literal('auto'), z.strictObject({ width: z.number().positive(), height: z.number().positive() })]).default('auto'),
  });

  const aiGroup = z.strictObject({ ...base, type: z.literal('group') });

  const assetSlot = z.strictObject({ assetId: zId.describe('free string; validated against the asset manifest afterward') });
  const aiImage = z.strictObject({ ...base, type: z.literal('image'), image: assetSlot });
  const aiVideo = z.strictObject({
    ...base, type: z.literal('video'),
    video: z.strictObject({
      assetId: zId,
      startOffset: z.int().min(0).default(0),
      playbackRate: z.number().positive().default(1),
      muted: z.boolean().default(false),
    }),
  });
  const aiCloner = z.strictObject({ ...base, type: z.literal('cloner'), ...makeClonerConfig(caps) });

  // NOTE: camera and audio are intentionally absent — they are forbidden from the AI vocabulary
  // (see AI_LAYER_TYPES). The document schema still round-trips them; the Coder just never emits them.
  return z.discriminatedUnion('type', [aiShape, aiText, aiGroup, aiImage, aiVideo, aiCloner])
    .describe('a Coder-authored layer (compact, strict; colors are palette roles)');
}

// Compile-time guard: the AI union covers exactly AI_LAYER_TYPES.
type _AiCovers = (typeof AI_LAYER_TYPES)[number];
const _aiCheck: readonly _AiCovers[] = AI_LAYER_TYPES;
void _aiCheck;

// ── DOCUMENT layer (round-trip; preserve-not-lock) ──
// Core identity/timing validated; everything else preserved. `.loose()` keeps unknown keys so a
// hand-authored scene with rich decorations / exotic payloads round-trips byte-for-byte.
const zDocLayerCommon = {
  id: zId,
  name: z.string(),
  parentId: zId.nullable(),
  trackId: zId.nullable(),
  visible: z.boolean(),
  locked: z.boolean(),
  blendMode: z.enum(BLEND_MODES),
  inPoint: zFrame,
  outPoint: z.int().min(0),
  /** Panel membership on the assembled document (the AI fragment carries it implicitly). Optional so
   *  hand-authored scenes without panels still round-trip. */
  panelId: zId.optional(),
};
// A single loose object rather than a discriminated union: the common identity/timing fields are
// validated, `type` must be a known document layer type, and every per-type payload + decoration
// PASSES THROUGH (loose) so a hand-authored scene round-trips byte-for-byte. (A discriminated union
// of 18 field-locked members would be the field-locking upgrade — see summary; not needed for
// lossless round-trip.)
export const zDocumentLayer = z
  .looseObject({ ...zDocLayerCommon, type: z.enum(DOCUMENT_LAYER_TYPES) })
  .describe('a document layer (round-trip; core fields validated, payload preserved)');

// Types are derived from a default-cap bundle in factory.ts; expose the doc layer type here.
export type DocumentLayer = z.infer<typeof zDocumentLayer>;
export type MotionPresetAttachment = z.infer<typeof zMotionPresetAttachment>;
