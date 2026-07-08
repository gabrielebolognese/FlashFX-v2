import { supabase } from '../lib/supabase';
import type { SplitMode } from '../core/textExplode';

// Write a one-shot metadata record linking generated clips back to their source
// text layer. Best-effort: never awaited, never throws. The generated clips
// themselves persist through the normal local scene save.
export function persistExplodeGroup(args: {
  projectId: string | null;
  groupId: string;
  originalClipId: string;
  splitMode: SplitMode;
  staggerFrames: number;
  clipCount: number;
}): void {
  if (!supabase) return;
  void supabase
    .from('text_explode_groups')
    .insert({
      project_id: args.projectId,
      group_id: args.groupId,
      original_clip_id: args.originalClipId,
      split_mode: args.splitMode,
      stagger_frames: args.staggerFrames,
      clip_count: args.clipCount,
    })
    .then(undefined, () => { /* offline / unreachable — ignore */ });
}
