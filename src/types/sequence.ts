export interface SequenceFrameRate {
  value: number;
  label: string;
}

export const FRAME_RATE_PRESETS: SequenceFrameRate[] = [
  { value: 24, label: '24 fps (Film)' },
  { value: 25, label: '25 fps (PAL)' },
  { value: 30, label: '30 fps (HD)' },
  { value: 60, label: '60 fps (High)' },
  { value: 120, label: '120 fps (Ultra)' },
];

export interface Sequence {
  id: string;
  name: string;
  frameRate: number;
  duration: number;
  canvasId: string;
  createdAt: number;
  updatedAt: number;
}

export interface SequenceState {
  sequences: Record<string, Sequence>;
  activeSequenceId: string | null;
}

export interface RenderConfig {
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  format: 'webm' | 'mp4' | 'gif' | 'png-sequence';
  quality: number;
}

export interface RenderProgress {
  status: 'idle' | 'preloading' | 'rendering' | 'encoding' | 'completed' | 'error';
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  estimatedTimeRemaining: number;
  message: string;
  startTime: number | null;
}

export interface FrameData {
  frameIndex: number;
  time: number;
  imageData: ImageData | null;
  blob: Blob | null;
}

export function createSequence(
  name: string,
  frameRate: number,
  duration: number,
  canvasId: string
): Sequence {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    frameRate,
    duration,
    canvasId,
    createdAt: now,
    updatedAt: now,
  };
}

export function getTotalFrames(sequence: Sequence): number {
  return Math.ceil(sequence.duration * sequence.frameRate);
}

export function getFrameTime(sequence: Sequence, frameIndex: number): number {
  return frameIndex / sequence.frameRate;
}

export function getFrameAtTime(sequence: Sequence, time: number): number {
  return Math.floor(time * sequence.frameRate);
}

export function clampTimeToSequence(sequence: Sequence, time: number): number {
  return Math.max(0, Math.min(time, sequence.duration));
}

export function getFrameDuration(sequence: Sequence): number {
  return 1 / sequence.frameRate;
}
