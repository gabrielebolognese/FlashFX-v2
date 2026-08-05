// Pure timing math for the audio-master playback clock. Dependency-free and
// deterministic so it's unit-testable (scripts/verify-masterclock); the runtime
// MasterClock class wraps these with a real AudioContext.
//
// Core idea (CapCut/Canva model): a single monotonic clock time (AudioContext
// currentTime when audible, else a fallback) is captured at an ANCHOR alongside
// the composition frame; the current composition position is then a pure function
// of elapsed clock time. TWO readings matter:
//   - forPicture: subtracts output latency → what the speakers emit NOW → drives
//     which video frame to display (else picture LEADS sound by 20-200 ms).
//   - forScheduling: raw elapsed → used to schedule FUTURE audio nodes (start time).

export interface ClockAnchor {
  /** Composition frame captured at the anchor. */
  anchorFrame: number;
  /** Clock time (seconds) captured at the anchor (ctx.currentTime or performance.now()/1000). */
  anchorTime: number;
}

export interface ClockParams {
  fps: number;
  /** Playback rate (1 = realtime). Negative = reverse (audio muted; caller handles direction). */
  rate: number;
  /** ctx.outputLatency (+ baseLatency) in seconds; 0 when unknown. Only applied forPicture. */
  outputLatencySec: number;
}

/** Elapsed COMPOSITION seconds since the anchor. `forPicture` compensates output latency. */
export function elapsedCompSeconds(anchor: ClockAnchor, nowTime: number, params: ClockParams, forPicture: boolean): number {
  const rawElapsed = nowTime - anchor.anchorTime - (forPicture ? params.outputLatencySec : 0);
  return rawElapsed * params.rate;
}

/** Continuous composition-frame position (unbounded — caller applies looping). */
export function frameFloat(anchor: ClockAnchor, nowTime: number, params: ClockParams, forPicture: boolean): number {
  return anchor.anchorFrame + elapsedCompSeconds(anchor, nowTime, params, forPicture) * params.fps;
}

/**
 * Fold a continuous frame position into [0, durationFrames) when looping. Handles
 * negative positions (reverse / pre-anchor). No-op when not looping or duration ≤ 0.
 */
export function applyLoop(position: number, durationFrames: number, loop: boolean): number {
  if (!loop || durationFrames <= 0) return position;
  const m = position % durationFrames;
  return m < 0 ? m + durationFrames : m;
}

/**
 * The clock time to use, given whether the AudioContext is actually running. When
 * running, ctx.currentTime is authoritative; otherwise fall back to a monotonic
 * wall time (performance.now()/1000). Kept pure by passing both in.
 */
export function selectClockTime(ctxRunning: boolean, ctxTimeSec: number, wallTimeSec: number): number {
  return ctxRunning ? ctxTimeSec : wallTimeSec;
}

/**
 * Guard against a non-monotonic clock read (some browsers coarsen/round
 * AudioContext.currentTime). Never let the returned time go backwards vs the last
 * observed value — returns max(now, last). Callers keep `last` across ticks.
 */
export function monotonic(nowTime: number, lastTime: number): number {
  return nowTime > lastTime ? nowTime : lastTime;
}
