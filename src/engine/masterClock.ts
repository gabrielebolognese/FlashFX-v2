import { frameFloat, applyLoop, selectClockTime, monotonic, type ClockAnchor } from './masterClockMath';
import { audioTransport } from './audio/audioTransport';

/**
 * Audio-master playback clock (CapCut/Canva model). The single source of "current
 * composition time" for the reworked playback path: time comes from the shared
 * AudioContext.currentTime while it's running (what the speakers actually follow),
 * else performance.now() as a fallback. Picture time is output-latency compensated
 * (the audible-NOW position); a separate reading (no compensation) is used to
 * schedule future audio nodes.
 *
 * Pure arithmetic lives in masterClockMath (harness-proven); this wraps it with the
 * real context. The ctx and perf clocks have different origins, so an anchored run
 * stays on whichever source it was anchored against — re-anchor to switch.
 */
export class MasterClock {
  private anchor: ClockAnchor = { anchorFrame: 0, anchorTime: 0 };
  private anchoredOnCtx = false;
  private lastTime = 0;

  /** True once the shared audio context is running (the clock is authoritative). */
  isRunning(): boolean {
    return audioTransport.exists() && audioTransport.state() === 'running';
  }

  /** Resume the shared context (call from a user gesture / play). Resolves to isRunning. */
  async resume(): Promise<boolean> {
    return audioTransport.resume();
  }

  private rawClock(useCtx: boolean): number {
    return selectClockTime(useCtx, audioTransport.currentTime(), performance.now() / 1000);
  }

  /**
   * Capture the anchor at the current clock time. Call on play, seek, loop wrap, and
   * any playbackRate change (so elapsed×rate integrates piecewise, never retroactively).
   */
  reanchor(frame: number): void {
    this.anchoredOnCtx = this.isRunning();
    const t = this.rawClock(this.anchoredOnCtx);
    this.lastTime = t;
    this.anchor = { anchorFrame: frame, anchorTime: t };
  }

  /**
   * Continuous composition-frame position for PICTURE (output-latency compensated),
   * folded into [0, durationFrames) when looping.
   */
  nowFrameFloat(fps: number, rate: number, durationFrames: number, loop: boolean): number {
    const t = monotonic(this.rawClock(this.anchoredOnCtx), this.lastTime);
    this.lastTime = t;
    const latencySec = this.anchoredOnCtx ? audioTransport.outputLatencySec() : 0;
    const f = frameFloat(this.anchor, t, { fps, rate, outputLatencySec: latencySec }, true);
    return applyLoop(f, durationFrames, loop);
  }
}

export const masterClock = new MasterClock();
