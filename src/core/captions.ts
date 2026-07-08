import type { TextLayer, Vec4 } from './types';
import { createTextLayer } from './factory';

// ─── Caption domain types ───
// A CaptionSegment is the model-agnostic unit produced by the worker: text plus
// timing in SECONDS. The editor converts these into ordinary text clips; nothing
// about captions is special once they land on the timeline.

export interface CaptionSegment {
  text: string;
  start: number; // seconds
  end: number; // seconds
  confidence?: number;
}

export type WhisperModelId = 'Xenova/whisper-tiny' | 'Xenova/whisper-base';

export interface ModelOption {
  id: WhisperModelId;
  label: string;
  description: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'Xenova/whisper-tiny', label: 'Whisper Tiny', description: 'Fastest, smallest download (~75 MB)' },
  { id: 'Xenova/whisper-base', label: 'Whisper Base', description: 'More accurate, larger download (~145 MB)' },
];

export type TimestampMode = 'phrase' | 'word';

export interface LanguageOption {
  code: string | null; // null = auto-detect
  label: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: null, label: 'Auto Detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ru', label: 'Russian' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
];

// ─── Position presets ───
// Normalized (0..1) anchor positions so the same preset works across every
// composition aspect ratio. Converted to pixels at generation time and clamped
// to a safe area so captions never touch the frame edge.

export type PositionPresetId =
  | 'bottom-center'
  | 'center'
  | 'top-center'
  | 'bottom-left'
  | 'bottom-right';

export interface PositionPreset {
  id: PositionPresetId;
  label: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  align: 'left' | 'center' | 'right';
}

export const POSITION_PRESETS: PositionPreset[] = [
  { id: 'bottom-center', label: 'Bottom Center', x: 0.5, y: 0.85, align: 'center' },
  { id: 'center', label: 'Center', x: 0.5, y: 0.5, align: 'center' },
  { id: 'top-center', label: 'Top Center', x: 0.5, y: 0.15, align: 'center' },
  { id: 'bottom-left', label: 'Bottom Left', x: 0.25, y: 0.85, align: 'left' },
  { id: 'bottom-right', label: 'Bottom Right', x: 0.75, y: 0.85, align: 'right' },
];

// Fraction of width/height kept clear at every edge.
export const SAFE_AREA_PADDING = 0.05;

// ─── Style templates ───
// Defined relative to composition height so caption size scales with resolution.

export type StyleTemplateId = 'classic' | 'subtitle' | 'social' | 'minimal' | 'bold';

export interface StyleTemplate {
  id: StyleTemplateId;
  label: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fillColor: Vec4;
  strokeColor: Vec4;
  fontSizeRatio: number; // multiplied by composition height
  strokeWidthRatio: number; // multiplied by computed font size
  letterSpacing: number;
}

const WHITE: Vec4 = [1, 1, 1, 1];
const BLACK: Vec4 = [0, 0, 0, 1];
const YELLOW: Vec4 = [1, 0.83, 0.08, 1];

export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: 'classic', label: 'Classic', fontFamily: 'Inter', fontWeight: 600, fontStyle: 'normal',
    fillColor: WHITE, strokeColor: BLACK, fontSizeRatio: 0.05, strokeWidthRatio: 0.06, letterSpacing: 0,
  },
  {
    id: 'subtitle', label: 'Subtitle', fontFamily: 'Inter', fontWeight: 500, fontStyle: 'normal',
    fillColor: WHITE, strokeColor: [0, 0, 0, 0.85], fontSizeRatio: 0.042, strokeWidthRatio: 0.05, letterSpacing: 0,
  },
  {
    id: 'social', label: 'Social Media', fontFamily: 'Inter', fontWeight: 800, fontStyle: 'normal',
    fillColor: WHITE, strokeColor: BLACK, fontSizeRatio: 0.07, strokeWidthRatio: 0.1, letterSpacing: 0.5,
  },
  {
    id: 'minimal', label: 'Minimal', fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal',
    fillColor: WHITE, strokeColor: [0, 0, 0, 0], fontSizeRatio: 0.04, strokeWidthRatio: 0, letterSpacing: 0,
  },
  {
    id: 'bold', label: 'Bold', fontFamily: 'Inter', fontWeight: 900, fontStyle: 'normal',
    fillColor: YELLOW, strokeColor: BLACK, fontSizeRatio: 0.075, strokeWidthRatio: 0.09, letterSpacing: 0,
  },
];

export interface CaptionOptions {
  language: string | null;
  model: WhisperModelId;
  timestampMode: TimestampMode;
  position: PositionPresetId;
  style: StyleTemplateId;
}

export const DEFAULT_CAPTION_OPTIONS: CaptionOptions = {
  language: null,
  model: 'Xenova/whisper-tiny',
  timestampMode: 'phrase',
  position: 'bottom-center',
  style: 'classic',
};

// ─── Segment cleaning pipeline ───

export interface CleaningConfig {
  minDuration: number; // seconds; segments shorter than this are merged
  maxDuration: number; // seconds; segments longer than this are split
  mergeGapThreshold: number; // seconds; a near-identical timestamp counts as duplicate
}

export const DEFAULT_CLEANING: CleaningConfig = {
  minDuration: 0.1,
  maxDuration: 7,
  mergeGapThreshold: 0.3,
};

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function isEmptyCaption(text: string): boolean {
  if (text.length === 0) return true;
  // Reject strings that contain no letters or digits in any script.
  return !/[\p{L}\p{N}]/u.test(text);
}

// Remove empty/garbage segments and normalize whitespace.
function discardEmpty(segments: CaptionSegment[]): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  for (const seg of segments) {
    const text = normalizeText(seg.text);
    if (isEmptyCaption(text)) continue;
    if (!(seg.end > seg.start)) continue;
    out.push({ ...seg, text });
  }
  return out;
}

// Drop segments whose text matches a neighbour with a near-identical start time.
function dedupe(segments: CaptionSegment[], gap: number): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.text.toLowerCase() === seg.text.toLowerCase() &&
      Math.abs(prev.start - seg.start) <= gap
    ) {
      // Keep the wider span of the two.
      prev.end = Math.max(prev.end, seg.end);
      prev.start = Math.min(prev.start, seg.start);
      continue;
    }
    out.push({ ...seg });
  }
  return out;
}

// Trim earlier segment ends so no two captions are visible at once.
function resolveOverlaps(segments: CaptionSegment[]): CaptionSegment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.start < prev.end) {
      const boundary = Math.max(prev.start + 0.001, cur.start);
      prev.end = boundary;
    }
  }
  return sorted.filter((s) => s.end > s.start);
}

// Merge segments shorter than the minimum into a neighbour.
function enforceMinDuration(segments: CaptionSegment[], min: number): CaptionSegment[] {
  if (segments.length === 0) return segments;
  const out: CaptionSegment[] = [];
  for (const seg of segments) {
    const dur = seg.end - seg.start;
    if (dur >= min) {
      out.push({ ...seg });
      continue;
    }
    const prev = out[out.length - 1];
    if (prev) {
      prev.text = normalizeText(`${prev.text} ${seg.text}`);
      prev.end = Math.max(prev.end, seg.end);
    } else {
      // First segment too short: just stretch it to the minimum.
      out.push({ ...seg, end: seg.start + min });
    }
  }
  return out;
}

// Split segments longer than the maximum into evenly timed, word-balanced chunks.
function enforceMaxDuration(segments: CaptionSegment[], max: number): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  for (const seg of segments) {
    const dur = seg.end - seg.start;
    if (dur <= max) {
      out.push({ ...seg });
      continue;
    }
    const parts = Math.ceil(dur / max);
    const words = seg.text.split(' ');
    if (words.length <= 1) {
      // Cannot split a single token by words; split the time span only.
      for (let i = 0; i < parts; i++) {
        const start = seg.start + (dur * i) / parts;
        const end = seg.start + (dur * (i + 1)) / parts;
        out.push({ text: seg.text, start, end, confidence: seg.confidence });
      }
      continue;
    }
    const perPart = Math.ceil(words.length / parts);
    for (let i = 0; i < parts; i++) {
      const chunk = words.slice(i * perPart, (i + 1) * perPart).join(' ');
      if (!chunk) continue;
      const start = seg.start + (dur * i) / parts;
      const end = seg.start + (dur * (i + 1)) / parts;
      out.push({ text: chunk, start, end, confidence: seg.confidence });
    }
  }
  return out;
}

// Full cleaning pipeline: discard → dedupe → de-overlap → min → max.
export function cleanSegments(
  raw: CaptionSegment[],
  config: CleaningConfig = DEFAULT_CLEANING,
): CaptionSegment[] {
  let segs = discardEmpty(raw);
  segs = segs.sort((a, b) => a.start - b.start);
  segs = dedupe(segs, config.mergeGapThreshold);
  segs = resolveOverlaps(segs);
  segs = enforceMinDuration(segs, config.minDuration);
  segs = enforceMaxDuration(segs, config.maxDuration);
  segs = discardEmpty(segs);
  return segs;
}

// ─── Layer building ───

export function getPositionPreset(id: PositionPresetId): PositionPreset {
  return POSITION_PRESETS.find((p) => p.id === id) ?? POSITION_PRESETS[0];
}

export function getStyleTemplate(id: StyleTemplateId): StyleTemplate {
  return STYLE_TEMPLATES.find((s) => s.id === id) ?? STYLE_TEMPLATES[0];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface BuildCaptionLayersArgs {
  segments: CaptionSegment[];
  compWidth: number;
  compHeight: number;
  frameRate: number;
  position: PositionPresetId;
  style: StyleTemplateId;
  clipStartOffsetFrames: number; // frame at which the source clip starts on the timeline
}

// Convert cleaned segments into ordinary point-mode text clips positioned with a
// resolution-independent preset, clamped to the safe area, styled by template.
export function buildCaptionLayers(args: BuildCaptionLayersArgs): TextLayer[] {
  const { segments, compWidth, compHeight, frameRate, clipStartOffsetFrames } = args;
  const preset = getPositionPreset(args.position);
  const template = getStyleTemplate(args.style);

  const minX = SAFE_AREA_PADDING * compWidth;
  const maxX = (1 - SAFE_AREA_PADDING) * compWidth;
  const minY = SAFE_AREA_PADDING * compHeight;
  const maxY = (1 - SAFE_AREA_PADDING) * compHeight;

  const px = clamp(preset.x * compWidth, minX, maxX);
  const py = clamp(preset.y * compHeight, minY, maxY);

  const fontSize = Math.round(template.fontSizeRatio * compHeight);
  const strokeWidth = Math.round(template.strokeWidthRatio * fontSize);
  const boxWidth = Math.round((1 - 2 * SAFE_AREA_PADDING) * compWidth);

  return segments.map((seg, i) => {
    const inPoint = clipStartOffsetFrames + Math.round(seg.start * frameRate);
    const outPointRaw = clipStartOffsetFrames + Math.round(seg.end * frameRate);
    const outPoint = Math.max(inPoint + 1, outPointRaw);

    const layer = createTextLayer(`Caption ${i + 1}`, px, py, seg.text, outPoint - inPoint, template.fillColor);
    layer.inPoint = inPoint;
    layer.outPoint = outPoint;

    const span = layer.content.spans[0];
    if (span) {
      span.style.fontFamily = template.fontFamily;
      span.style.fontWeight = template.fontWeight as any;
      span.style.fontStyle = template.fontStyle;
      span.style.color = template.fillColor;
      span.style.strokeColor = template.strokeColor;
      span.style.letterSpacing = template.letterSpacing;
    }
    layer.layoutConfig.horizontalAlign = preset.align;
    layer.layoutConfig.boundingBox = { type: 'fixedWidth', width: boxWidth };
    layer.animOverrides.fontSize.defaultValue = fontSize;
    layer.animOverrides.strokeWidth.defaultValue = strokeWidth;
    layer.animOverrides.letterSpacing.defaultValue = template.letterSpacing;

    return layer;
  });
}
