// Shared MM:SS:FF time-code formatter used by GeneralTimeline, AnimationTimeline,
// and TimelineControlsPanel. Was previously duplicated identically in all three files.
export function formatTimeCode(seconds: number, fps: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * fps);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}
