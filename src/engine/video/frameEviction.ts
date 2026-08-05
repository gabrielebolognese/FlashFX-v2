// Pure frame-eviction policy for the video frame scheduler. Dependency-free and
// deterministic so it's unit-testable (scripts/verify-framecap).
//
// A hardware VideoDecoder stalls once too many decoded output frames are held
// open (~16-24), so the scheduler must cap how many it retains per asset. When
// over the cap, evict already-PLAYED frames first (behind the earliest playhead
// anchor, oldest first), then the frames farthest AHEAD of any anchor — keeping a
// tight ring around what's on screen so the picture never freezes.

/**
 * Choose which of `open` buffered frame indices to evict to bring the count down
 * to `cap`, given the current playhead `anchors` (source frames on screen).
 * Returns [] when already within cap.
 */
export function selectFramesToEvict(open: number[], anchors: number[], cap: number): number[] {
  if (open.length <= cap) return [];
  // No anchors → treat every frame as "behind" so we evict oldest (lowest) first.
  const minAnchor = anchors.length ? Math.min(...anchors) : Infinity;
  const nearest = (idx: number) => (anchors.length ? Math.min(...anchors.map((a) => Math.abs(idx - a))) : idx);
  const sorted = [...open].sort((a, b) => {
    const aBehind = a < minAnchor;
    const bBehind = b < minAnchor;
    if (aBehind !== bBehind) return aBehind ? -1 : 1; // behind (played) evicted first
    if (aBehind) return a - b; // both behind → oldest (lowest index) first
    return nearest(b) - nearest(a); // both ahead → farthest from an anchor first
  });
  return sorted.slice(0, open.length - cap);
}
