import { getSettingValue } from '../../../settings/store';

const BASE_FRAME_WIDTH = 8;

export function getZoomMin(): number {
  return getSettingValue<number>('timeline.minZoom') ?? 0.05;
}

export function getZoomMax(): number {
  return getSettingValue<number>('timeline.maxZoom') ?? 20;
}

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 20;

export function getRowHeight(): number {
  return getSettingValue<number>('timeline.trackHeight') ?? 22;
}

export function getVideoRowHeight(): number {
  return getSettingValue<number>('timeline.videoTrackHeight') ?? 45;
}

export const ROW_HEIGHT = 22;
export const VIDEO_ROW_HEIGHT = 45;
export const LAYER_ROW_HEIGHT = 19;

export function clampZoom(zoom: number): number {
  return Math.max(getZoomMin(), Math.min(getZoomMax(), zoom));
}

export function getFrameWidth(zoomLevel: number): number {
  return BASE_FRAME_WIDTH * zoomLevel;
}

export function frameToPixel(frame: number, zoomLevel: number, scrollX: number): number {
  return frame * getFrameWidth(zoomLevel) - scrollX;
}

export function pixelToFrame(pixel: number, zoomLevel: number, scrollX: number): number {
  return Math.round((pixel + scrollX) / getFrameWidth(zoomLevel));
}

export function pixelToFrameExact(pixel: number, zoomLevel: number, scrollX: number): number {
  return (pixel + scrollX) / getFrameWidth(zoomLevel);
}

export function getVisibleFrameRange(
  containerWidth: number,
  zoomLevel: number,
  scrollX: number
): [number, number] {
  const fw = getFrameWidth(zoomLevel);
  const start = Math.floor(scrollX / fw);
  const end = Math.ceil((scrollX + containerWidth) / fw);
  return [start, end];
}

export function getTotalTimelineWidth(durationFrames: number, zoomLevel: number): number {
  return durationFrames * getFrameWidth(zoomLevel);
}

export function getMaxScrollX(durationFrames: number, zoomLevel: number, containerWidth: number): number {
  return Math.max(0, getTotalTimelineWidth(durationFrames, zoomLevel) - containerWidth);
}

export function zoomAtPoint(
  currentZoom: number,
  currentScrollX: number,
  cursorPixelX: number,
  zoomFactor: number
): { zoom: number; scrollX: number } {
  const newZoom = clampZoom(currentZoom * zoomFactor);
  const frameUnderCursor = (cursorPixelX + currentScrollX) / getFrameWidth(currentZoom);
  const newScrollX = frameUnderCursor * getFrameWidth(newZoom) - cursorPixelX;
  return { zoom: newZoom, scrollX: Math.max(0, newScrollX) };
}

export type RulerTickMode = 'frame' | 'time';

export interface RulerTick {
  frame: number;
  major: boolean;
  label: string | null;
}

// Candidate tick intervals expressed in frames, each tagged with how it
// should be labeled. Frame-level intervals are used only when heavily zoomed
// in; everything else maps to human-friendly time divisions (0.5s, 1s, 2s,
// 5s, …, minutes). Derived from the composition frame rate so the ruler is
// always mathematically correct regardless of FPS.
function buildNiceIntervals(frameRate: number): { frames: number; mode: RulerTickMode }[] {
  const fps = Math.max(1, frameRate);
  const frameLevel: { frames: number; mode: RulerTickMode }[] =
    [1, 2, 5, 10].map((f) => ({ frames: f, mode: 'frame' as const }));
  const timeSeconds = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const timeLevel: { frames: number; mode: RulerTickMode }[] =
    timeSeconds.map((s) => ({ frames: Math.max(1, Math.round(s * fps)), mode: 'time' as const }));

  // Frame-level entries only make sense below one second; drop ones that
  // overlap the sub-second time grid so we never mix "10 frames" with "0.5s".
  const halfSecondFrames = Math.max(1, Math.round(0.5 * fps));
  const merged = [
    ...frameLevel.filter((c) => c.frames < halfSecondFrames),
    ...timeLevel,
  ].sort((a, b) => a.frames - b.frames);

  const out: { frames: number; mode: RulerTickMode }[] = [];
  for (const c of merged) {
    if (out.length && out[out.length - 1].frames === c.frames) continue;
    out.push(c);
  }
  return out;
}

export function getRulerTicks(
  visibleRange: [number, number],
  zoomLevel: number,
  frameRate: number
): RulerTick[] {
  const [start, end] = visibleRange;
  const fw = getFrameWidth(zoomLevel); // px per frame
  const targetMajorPx = 90;

  const candidates = buildNiceIntervals(frameRate);
  const desiredFrames = targetMajorPx / fw;
  let chosen = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (c.frames >= desiredFrames) { chosen = c; break; }
  }
  const majorFrames = chosen.frames;

  // Subdivide the major interval into minor ticks while keeping them legible
  // (≥ ~9px apart). Falls back to fewer subdivisions as we zoom out.
  let minorFrames = majorFrames;
  for (const div of [5, 4, 2]) {
    const mf = majorFrames / div;
    if (mf * fw >= 9 && mf >= 1) { minorFrames = mf; break; }
  }
  if (chosen.mode === 'frame') minorFrames = Math.max(1, Math.round(minorFrames));

  const ticks: RulerTick[] = [];
  const firstIdx = Math.floor(start / minorFrames) - 1;
  const lastIdx = Math.ceil(end / minorFrames) + 1;
  for (let i = firstIdx; i <= lastIdx; i++) {
    const exact = i * minorFrames;
    if (exact < 0) continue;
    const ratio = exact / majorFrames;
    const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-6;
    ticks.push({
      frame: Math.round(exact),
      major: isMajor,
      label: isMajor ? formatRulerLabel(exact, frameRate, chosen.mode, majorFrames) : null,
    });
  }
  return ticks;
}

export function formatTimecode(frame: number, frameRate: number): string {
  const totalSeconds = frame / frameRate;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.round(frame % frameRate);
  if (mins > 0) {
    return `${mins}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }
  return `${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

// Render a ruler label as real time (or frame number when heavily zoomed).
// `mode`/`intervalFrames` come from the chosen tick interval so the number of
// decimals matches the spacing (e.g. 0.5s steps show one decimal, 1s+ steps
// show whole seconds, ≥1min shows m:ss).
export function formatRulerLabel(
  frame: number,
  frameRate: number,
  mode: RulerTickMode = 'time',
  intervalFrames?: number
): string {
  if (mode === 'frame') return `${Math.round(frame)}`;

  const fps = Math.max(1, frameRate);
  const seconds = frame / fps;

  if (seconds >= 60) {
    const totalSecs = Math.round(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  const intervalSec = intervalFrames !== undefined ? intervalFrames / fps : 1;
  if (intervalSec >= 1) return `${Math.round(seconds)}s`;

  const rounded = Math.round(seconds * 10) / 10;
  return `${rounded}s`;
}
