import type { PlaybackState, SchedulerCallbacks, TimelineConfig } from './types';

export interface PlaybackOptions {
  speed: number;
  loop: boolean;
  startTime: number;
}

export class PlaybackScheduler {
  private state: PlaybackState = 'stopped';
  private currentTime = 0;
  private speed = 1;
  private loop = false;
  private config: TimelineConfig;
  private callbacks: SchedulerCallbacks;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private frameInterval = 0;
  private accumulatedTime = 0;
  private droppedFrames = 0;
  private totalFramesRendered = 0;

  constructor(config: TimelineConfig, callbacks: SchedulerCallbacks) {
    this.config = { ...config };
    this.callbacks = callbacks;
    this.frameInterval = config.fps > 0 ? 1000 / config.fps : 33.33;
  }

  updateConfig(config: Partial<TimelineConfig>): void {
    if (config.fps !== undefined) {
      this.config.fps = config.fps;
      this.frameInterval = config.fps > 0 ? 1000 / config.fps : 33.33;
    }
    if (config.duration !== undefined) this.config.duration = config.duration;
    if (config.loop !== undefined) this.config.loop = config.loop;
  }

  play(options?: Partial<PlaybackOptions>): void {
    if (this.state === 'playing') return;

    if (options?.speed !== undefined) this.speed = options.speed;
    if (options?.loop !== undefined) this.loop = options.loop;
    if (options?.startTime !== undefined) this.currentTime = options.startTime;

    if (this.currentTime >= this.config.duration) {
      this.currentTime = 0;
    }

    this.state = 'playing';
    this.lastTimestamp = 0;
    this.accumulatedTime = 0;
    this.droppedFrames = 0;
    this.totalFramesRendered = 0;
    this.callbacks.onStateChange('playing');
    this.scheduleFrame();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.cancelFrame();
    this.callbacks.onStateChange('paused');
  }

  stop(): void {
    this.state = 'stopped';
    this.cancelFrame();
    this.currentTime = 0;
    this.accumulatedTime = 0;
    this.callbacks.onFrame(0, 0);
    this.callbacks.onStateChange('stopped');
  }

  seek(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.config.duration));
    const frame = this.config.fps > 0 ? Math.floor(this.currentTime * this.config.fps) : 0;
    this.callbacks.onFrame(this.currentTime, frame);
  }

  seekToFrame(frame: number): void {
    if (this.config.fps <= 0) return;
    const time = frame / this.config.fps;
    this.seek(time);
  }

  stepForward(): void {
    if (this.config.fps <= 0) return;
    const frame = Math.floor(this.currentTime * this.config.fps) + 1;
    const totalFrames = Math.ceil(this.config.duration * this.config.fps);
    this.seekToFrame(Math.min(frame, Math.max(0, totalFrames - 1)));
  }

  stepBackward(): void {
    if (this.config.fps <= 0) return;
    const frame = Math.floor(this.currentTime * this.config.fps) - 1;
    this.seekToFrame(Math.max(frame, 0));
  }

  getState(): PlaybackState {
    return this.state;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getCurrentFrame(): number {
    return Math.floor(this.currentTime * this.config.fps);
  }

  getDroppedFrames(): number {
    return this.droppedFrames;
  }

  getTotalFramesRendered(): number {
    return this.totalFramesRendered;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(speed, 4));
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  private scheduleFrame(): void {
    this.rafId = requestAnimationFrame(this.tick);
  }

  private cancelFrame(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (timestamp: number): void => {
    if (this.state !== 'playing') return;

    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      this.scheduleFrame();
      return;
    }

    const deltaMs = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    this.accumulatedTime += deltaMs * this.speed;

    let framesAdvanced = 0;
    while (this.accumulatedTime >= this.frameInterval) {
      this.accumulatedTime -= this.frameInterval;
      framesAdvanced++;
    }

    if (framesAdvanced === 0) {
      this.scheduleFrame();
      return;
    }

    if (framesAdvanced > 2) {
      this.droppedFrames += framesAdvanced - 1;
    }

    this.totalFramesRendered++;

    const timeAdvance = (framesAdvanced * this.frameInterval) / 1000;
    this.currentTime += timeAdvance;

    if (this.currentTime >= this.config.duration) {
      if (this.loop || this.config.loop) {
        this.currentTime = this.currentTime % this.config.duration;
      } else {
        this.currentTime = this.config.duration;
        const frame = Math.max(0, Math.ceil(this.config.duration * this.config.fps) - 1);
        this.callbacks.onFrame(this.currentTime, frame);
        this.state = 'stopped';
        this.cancelFrame();
        this.callbacks.onComplete();
        this.callbacks.onStateChange('stopped');
        return;
      }
    }

    const frame = Math.floor(this.currentTime * this.config.fps);
    this.callbacks.onFrame(this.currentTime, frame);

    this.scheduleFrame();
  };

  destroy(): void {
    this.cancelFrame();
    this.state = 'stopped';
  }
}
