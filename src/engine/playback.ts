import { WebGPURenderer } from './renderer';
import { TimelineEngine } from './timeline';
import { audioPlaybackEngine } from './media/audioPlayback';
import { frameScheduler } from './video/frameScheduler';

type FrameCallback = (frame: number) => void;
type LagCallback = (lagging: boolean) => void;

export class PlaybackController {
  private engine: TimelineEngine;
  private renderer: WebGPURenderer | null = null;
  private animFrameId = 0;
  private _currentFrame = 0;
  private _isPlaying = false;
  private _frameRate = 30;
  private _durationFrames = 150;
  private listeners: Set<FrameCallback> = new Set();
  private lagListeners: Set<LagCallback> = new Set();
  private pendingReRender = false;

  private playStartTime = 0;
  private playStartFrame = 0;

  private prevTickTime = 0;
  private minDt = Infinity;
  private emaDt = 0;
  private behindSince = 0;
  private _isLagging = false;

  private isScrubbing = false;

  constructor(engine: TimelineEngine) {
    this.engine = engine;
  }

  attachRenderer(renderer: WebGPURenderer): void {
    this.renderer = renderer;
  }

  detachRenderer(): void {
    this.renderer = null;
  }

  getRenderer(): WebGPURenderer | null {
    return this.renderer;
  }

  get currentFrame(): number {
    return this._currentFrame;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isLagging(): boolean {
    return this._isLagging;
  }

  setFrameRate(fps: number): void {
    this._frameRate = fps;
    frameScheduler.setCompositionFrameRate(fps);
  }

  setDuration(frames: number): void {
    this._durationFrames = frames;
  }

  onFrameChange(cb: FrameCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onLagChange(cb: LagCallback): () => void {
    this.lagListeners.add(cb);
    return () => this.lagListeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) cb(this._currentFrame);
  }

  private notifyLag(lagging: boolean): void {
    for (const cb of this.lagListeners) cb(lagging);
  }

  private anchorClock(): void {
    this.playStartTime = performance.now();
    this.playStartFrame = this._currentFrame;
  }

  private resetLagMonitor(): void {
    this.prevTickTime = 0;
    this.minDt = Infinity;
    this.emaDt = 0;
    this.behindSince = 0;
    if (this._isLagging) {
      this._isLagging = false;
      this.notifyLag(false);
    }
  }

  play(): void {
    if (this._isPlaying) return;
    this._isPlaying = true;
    this.isScrubbing = false;
    this.anchorClock();
    this.resetLagMonitor();

    const composition = this.engine.getComposition();
    if (composition) {
      audioPlaybackEngine.startPlayback(composition, this._currentFrame, this._frameRate);
    }

    this.animFrameId = requestAnimationFrame(this.tick);
    this.notify();
  }

  pause(): void {
    this._isPlaying = false;
    this.isScrubbing = false;
    cancelAnimationFrame(this.animFrameId);
    audioPlaybackEngine.stopPlayback();
    this.resetLagMonitor();
    this.notify();
  }

  stop(): void {
    this._isPlaying = false;
    this.isScrubbing = false;
    cancelAnimationFrame(this.animFrameId);
    audioPlaybackEngine.stopPlayback();
    this.resetLagMonitor();
    this._currentFrame = 0;
    this.renderCurrentFrame();
    this.notify();
  }

  seekTo(frame: number): void {
    this._currentFrame = Math.max(0, Math.min(frame, this._durationFrames - 1));
    this.renderCurrentFrame();

    if (this._isPlaying) {
      this.anchorClock();
      const composition = this.engine.getComposition();
      if (composition) {
        audioPlaybackEngine.startPlayback(composition, this._currentFrame, this._frameRate);
      }
    }

    this.notify();
  }

  scrubTo(frame: number): void {
    const clamped = Math.max(0, Math.min(frame, this._durationFrames - 1));
    if (clamped === this._currentFrame) return;
    this._currentFrame = clamped;
    this.isScrubbing = true;
    frameScheduler.setPlaybackState(clamped, 0, true);

    if (this._isPlaying) this.anchorClock();
    this.renderCurrentFrame();
    this.notify();
  }

  renderCurrentFrame(): void {
    const renderFrame = this.engine.evaluate(this._currentFrame);
    if (renderFrame && this.renderer) {
      this.renderer.renderFrame(renderFrame, 'screen');
    }
  }

  private tick = (time: number): void => {
    if (!this._isPlaying) return;

    this.recordPacing(time);

    const dur = this._durationFrames > 0 ? this._durationFrames : 1;
    this.tickRealtime(time, dur);

    this.evaluateLag(time);
    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private tickRealtime(_time: number, dur: number): void {
    const now = performance.now();
    const elapsedSec = (now - this.playStartTime) / 1000;
    const absoluteFrame = this.playStartFrame + elapsedSec * this._frameRate;
    const loopedFrame = ((absoluteFrame % dur) + dur) % dur;
    const newFrame = Math.floor(loopedFrame);

    if (newFrame !== this._currentFrame) {
      const wrapped = newFrame < this._currentFrame;
      this._currentFrame = newFrame;
      frameScheduler.setPlaybackState(newFrame, 1, false);
      this.renderCurrentFrame();
      this.syncAudio(wrapped);
      this.notify();
    }
  }

  private syncAudio(wrapped: boolean): void {
    const composition = this.engine.getComposition();
    if (!composition) return;
    if (wrapped) {
      audioPlaybackEngine.startPlayback(composition, this._currentFrame, this._frameRate);
    } else {
      audioPlaybackEngine.updatePlayback(composition, this._currentFrame, this._frameRate);
    }
  }

  private recordPacing(time: number): void {
    if (this.prevTickTime !== 0) {
      const dt = time - this.prevTickTime;
      if (dt > 0 && dt < 1000) {
        this.minDt = Math.min(this.minDt, dt);
        this.emaDt = this.emaDt === 0 ? dt : this.emaDt * 0.85 + dt * 0.15;
      }
    }
    this.prevTickTime = time;
  }

  private evaluateLag(time: number): void {
    if (this._frameRate <= 0) return;
    const targetDt = 1000 / this._frameRate;
    const achievableDt = this.minDt === Infinity ? targetDt : Math.max(targetDt, this.minDt);
    const laggingNow = this.emaDt > achievableDt * 1.8;

    if (laggingNow) {
      if (this.behindSince === 0) {
        this.behindSince = time;
      } else if (time - this.behindSince >= 3000 && !this._isLagging) {
        this._isLagging = true;
        this.notifyLag(true);
      }
    } else {
      this.behindSince = 0;
      if (this._isLagging) {
        this._isLagging = false;
        this.notifyLag(false);
      }
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.animFrameId);
    this._isPlaying = false;
    this.listeners.clear();
    this.lagListeners.clear();
    audioPlaybackEngine.destroy();
  }
}
