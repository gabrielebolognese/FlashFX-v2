// Pure clip → AudioBufferSourceNode scheduling math, shared by BOTH the preview
// audio engine and the export mixer so they can never diverge (critique #10:
// preview/export producing different mixes is a bug you can't hear until export).
// Dependency-free + deterministic (scripts/verify-audioschedule).
//
// A clip is scheduled relative to an ANCHOR (a known composition time bound to a
// known clock time). Export anchors at (comp 0, clock 0, rate 1) — so a clip at
// inPoint schedules at when = inPoint/fps, offset = startOffset. Preview anchors at
// (current playhead, ctx.currentTime, playbackRate) — so a clip already playing at
// the anchor starts NOW at an offset advanced into its buffer. Web Audio's
// start(when, offset, duration) uses buffer-seconds for offset/duration, so the
// per-clip playbackRate scales how fast the buffer is consumed.

export interface ClipTiming {
  /** inPoint / compFps. */
  clipStartCompSec: number;
  /** (outPoint - inPoint) / compFps. */
  clipDurationCompSec: number;
  /** Source-buffer offset (seconds) at the clip's own start. */
  startOffsetSec: number;
  /** Per-clip playback rate (buffer-seconds consumed per comp-second). */
  playbackRate: number;
  /** Decoded buffer length (seconds). */
  bufferDurationSec: number;
}

export interface ScheduleAnchor {
  /** Composition time (seconds) captured at the anchor. */
  anchorCompSec: number;
  /** Clock time (seconds) captured at the anchor (ctx.currentTime; 0 for export). */
  anchorClockTime: number;
  /** Master playback rate (composition seconds per clock second). Usually 1. */
  masterRate: number;
}

export interface ScheduledSource {
  /** Clock time to start(); may be ≤ anchor for an already-playing clip (starts now). */
  when: number;
  /** Buffer offset (seconds) to begin from. */
  offset: number;
  /** Buffer seconds to play. */
  duration: number;
}

/**
 * Compute {when, offset, duration} for one clip against an anchor, or null when the
 * clip is not audible at/after the anchor (already ended, or its buffer offset is
 * past the decoded length).
 */
export function computeSourceSchedule(clip: ClipTiming, anchor: ScheduleAnchor): ScheduledSource | null {
  const clipEndCompSec = clip.clipStartCompSec + clip.clipDurationCompSec;
  const nowCompSec = anchor.anchorCompSec;
  const rate = anchor.masterRate || 1;

  // Clip finished before the anchor → nothing to schedule.
  if (nowCompSec >= clipEndCompSec) return null;

  let when: number;
  let offset: number;
  if (clip.clipStartCompSec >= nowCompSec) {
    // Clip starts at/after the anchor → schedule ahead on the clock.
    when = anchor.anchorClockTime + (clip.clipStartCompSec - nowCompSec) / rate;
    offset = clip.startOffsetSec;
  } else {
    // Clip already playing at the anchor → start now, advanced into the buffer by
    // how far past the clip start we already are (in BUFFER seconds → × playbackRate).
    when = anchor.anchorClockTime;
    offset = clip.startOffsetSec + (nowCompSec - clip.clipStartCompSec) * clip.playbackRate;
  }

  // Skip when the offset lands outside the decoded buffer. `< 0` restores the old
  // preview guard (a negative source trim was skipped, not fed to start() where a
  // negative offset throws); `>= duration` is a seek past the buffer end.
  if (offset < 0 || offset >= clip.bufferDurationSec) return null;

  const remainingClipCompSec = clipEndCompSec - Math.max(nowCompSec, clip.clipStartCompSec);
  const remainingBufferSec = clip.bufferDurationSec - offset;
  const duration = Math.min(remainingClipCompSec * clip.playbackRate, remainingBufferSec);
  if (duration <= 0) return null;

  return { when, offset, duration };
}
