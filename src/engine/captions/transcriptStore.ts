import { supabase } from '../../lib/supabase';
import type { CaptionOptions, CaptionSegment } from '../../core/captions';

// Write the final transcript to Supabase exactly once, when the user accepts
// generated captions. Best-effort: never awaited by callers, never throws.
// The editable caption clips persist through the normal local scene save.
export function persistTranscript(args: {
  projectId: string | null;
  sourceLayerId: string;
  options: CaptionOptions;
  segments: CaptionSegment[];
  processingMs: number;
}): void {
  if (!supabase) return;
  void supabase
    .from('caption_transcripts')
    .insert({
      project_id: args.projectId,
      source_layer_id: args.sourceLayerId,
      language: args.options.language,
      model: args.options.model,
      timestamp_mode: args.options.timestampMode,
      segment_count: args.segments.length,
      processing_ms: Math.round(args.processingMs),
      segments: args.segments,
    })
    .then(undefined, () => { /* offline / unreachable — ignore */ });
}
