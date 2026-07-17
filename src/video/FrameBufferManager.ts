/**
 * FrameBufferManager — per-clip rolling frame buffer.
 * Stores decoded VideoFrame objects sorted by timestamp.
 * Enforces strict memory management: frames are closed immediately when
 * they fall behind currentTime or when the buffer is flushed.
 *
 * Frame drops are logged to droppedFrameRate for developer diagnostics.
 * This class NEVER stalls — if no frame is available, it returns null.
 */

const STALE_THRESHOLD_SECONDS = 0.1;
const MAX_BUFFER_SECONDS = 0.5;

// Debug mode: warn if open frame count exceeds this
const OPEN_FRAME_WARNING_THRESHOLD = 60;

interface BufferedFrame {
  frame: VideoFrame;
  timestamp: number;
}

export class FrameBufferManager {
  private frames: BufferedFrame[] = [];
  private _droppedFrames = 0;
  private _renderedFrames = 0;
  private _openFrameCount = 0;

  get droppedFrameRate(): number {
    const total = this._droppedFrames + this._renderedFrames;
    return total > 0 ? this._droppedFrames / total : 0;
  }

  get openFrameCount(): number {
    return this._openFrameCount;
  }

  addFrame(frame: VideoFrame, timestamp: number): void {
    this.frames.push({ frame, timestamp });
    this._openFrameCount++;

    // Keep sorted by timestamp
    this.frames.sort((a, b) => a.timestamp - b.timestamp);

    if (this._openFrameCount > OPEN_FRAME_WARNING_THRESHOLD) {
      console.warn(`[FrameBufferManager] High open frame count: ${this._openFrameCount}`);
    }
  }

  /**
   * Returns the most recent frame with timestamp <= requestedTime.
   * Closes and removes all frames that are more than STALE_THRESHOLD_SECONDS
   * behind the current time. Does NOT close the returned frame — the caller
   * must close it after GPU upload.
   */
  getFrameAt(currentTime: number): VideoFrame | null {
    // Drop stale frames
    const staleThreshold = currentTime - STALE_THRESHOLD_SECONDS;
    while (this.frames.length > 1 && this.frames[0].timestamp < staleThreshold) {
      const stale = this.frames.shift()!;
      stale.frame.close();
      this._openFrameCount--;
      this._droppedFrames++;
    }

    // Find the most recent frame at or before currentTime
    let result: BufferedFrame | null = null;
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].timestamp <= currentTime + 0.001) {
        result = this.frames[i];
        break;
      }
    }

    if (result) {
      this._renderedFrames++;
      return result.frame;
    }

    return null;
  }

  /**
   * Returns true if the buffer needs more frames soon (running low on lookahead).
   */
  needsMoreFrames(currentTime: number): boolean {
    if (this.frames.length === 0) return true;
    const lastFrame = this.frames[this.frames.length - 1];
    return lastFrame.timestamp < currentTime + MAX_BUFFER_SECONDS * 0.5;
  }

  /**
   * Closes and discards all buffered frames. Call this on seek or clip end.
   */
  flush(): void {
    for (const { frame } of this.frames) {
      frame.close();
      this._openFrameCount--;
    }
    this.frames = [];
  }

  /**
   * Returns the timestamp of the most recently buffered frame, or -1 if empty.
   */
  get latestTimestamp(): number {
    if (this.frames.length === 0) return -1;
    return this.frames[this.frames.length - 1].timestamp;
  }

  destroy(): void {
    this.flush();
  }
}
