# Playback Bug Fix - Implementation Plan

## Executive Summary

**Problem**: The playhead goes backward during playback, with significant lag and erratic behavior.

**Root Cause**: A dependency cycle in the `usePlayback` hook's animation loop that causes the entire effect to re-run on every frame, destroying and recreating the animation loop constantly.

**Impact**: 
- Playhead moves backward
- Severe performance lag
- Unpredictable animation behavior
- High CPU usage

---

## Root Cause Analysis

### Location: `/src/animation-engine/usePlayback.ts` (Lines 92-132)

### The Bug

```typescript
useEffect(() => {
  if (!isPlaying) {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    return;
  }

  lastTimeRef.current = performance.now();

  const animate = (timestamp: number) => {
    const deltaMs = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const deltaSeconds = deltaMs / 1000;
    const newTime = currentTime + deltaSeconds;

    if (newTime >= duration) {
      if (loop) {
        setCurrentTime(0);
      } else {
        setCurrentTime(duration);
        setPlaying(false);
        return;
      }
    } else {
      setCurrentTime(newTime);
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  animationFrameRef.current = requestAnimationFrame(animate);

  return () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };
}, [isPlaying, currentTime, duration, loop, setCurrentTime, setPlaying]);
//              ^^^^^^^^^^^ THIS IS THE PROBLEM
```

### Why This Causes Backward Movement

1. **Frame 0**: `currentTime = 0`, effect runs, sets `lastTimeRef = performance.now()` (e.g., 1000ms)
2. **Frame 1**: After 16ms, `timestamp = 1016`, delta = 16ms, `newTime = 0 + 0.016 = 0.016`
3. **State Update**: `setCurrentTime(0.016)` is called
4. **Frame 1 (continued)**: Before next RAF fires, React re-renders because `currentTime` changed
5. **Effect Re-runs**: The entire effect unmounts and remounts because `currentTime` is in deps
6. **Bug**: `lastTimeRef.current = performance.now()` resets to current time (e.g., 1016ms)
7. **Frame 2**: RAF fires with `timestamp = 1032`, but now using `currentTime = 0.016`
8. **Delta Calculation**: `deltaMs = 1032 - 1016 = 16ms` (correct)
9. **New Time**: `newTime = 0.016 + 0.016 = 0.032` (should be correct)
10. **BUT**: Sometimes the effect re-runs mid-frame, causing:
    - `lastTimeRef` to reset incorrectly
    - Delta to be calculated from wrong baseline
    - Negative deltas or huge jumps
    - Backward movement

### Performance Impact

Every frame (60 FPS = 60 times per second):
1. State update triggers re-render
2. useEffect dependency check sees `currentTime` changed
3. Old animation loop cancels
4. New animation loop starts
5. All cleanup functions run
6. All setup functions run

This creates a **cascade of re-renders and re-mounts**, causing:
- 60+ effect remounts per second
- Garbage collection pressure
- Timing drift and inconsistency
- Backward playhead movement

---

## The Fix

### Solution: Remove `currentTime` from Dependencies

The animation loop should:
1. Start once when `isPlaying` becomes true
2. Run continuously using internal refs
3. Update state periodically
4. Stop when `isPlaying` becomes false

### Implementation

**File**: `/src/animation-engine/usePlayback.ts`

**Change the useEffect dependencies from:**
```typescript
}, [isPlaying, currentTime, duration, loop, setCurrentTime, setPlaying]);
```

**To:**
```typescript
}, [isPlaying, duration, loop, setCurrentTime, setPlaying]);
```

**But wait!** Simply removing `currentTime` creates another issue: the animation loop uses `currentTime` in its calculation:

```typescript
const newTime = currentTime + deltaSeconds;
```

This creates a **stale closure** - the `animate` function will always use the `currentTime` value from when the effect first ran.

### Complete Fix

We need to use a **ref to track current time** internally:

```typescript
const animationFrameRef = useRef<number | null>(null);
const lastTimeRef = useRef<number>(0);
const internalTimeRef = useRef<number>(currentTime); // NEW: Track time in ref

// Sync ref when currentTime changes from external sources (seeking)
useEffect(() => {
  internalTimeRef.current = currentTime;
}, [currentTime]);

useEffect(() => {
  if (!isPlaying) {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    return;
  }

  lastTimeRef.current = performance.now();

  const animate = (timestamp: number) => {
    const deltaMs = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const deltaSeconds = deltaMs / 1000;
    const newTime = internalTimeRef.current + deltaSeconds; // Use ref instead
    internalTimeRef.current = newTime; // Update ref

    if (newTime >= duration) {
      if (loop) {
        internalTimeRef.current = 0;
        setCurrentTime(0);
      } else {
        internalTimeRef.current = duration;
        setCurrentTime(duration);
        setPlaying(false);
        return;
      }
    } else {
      setCurrentTime(newTime);
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  animationFrameRef.current = requestAnimationFrame(animate);

  return () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };
}, [isPlaying, duration, loop, setCurrentTime, setPlaying]);
// Notice: currentTime is REMOVED from dependencies
```

---

## Implementation Steps

### Step 1: Modify `usePlayback.ts`

1. Add `internalTimeRef` to track time internally
2. Add sync effect to update ref when seeking externally
3. Update animation loop to use ref instead of state
4. Remove `currentTime` from main effect dependencies

### Step 2: Test the Fix

**Test Case 1: Basic Playback**
- Press play
- Verify playhead moves forward smoothly
- Verify no backward movement
- Verify consistent speed

**Test Case 2: Seeking While Playing**
- Start playback
- Drag playhead to different position
- Verify playback continues from new position
- Verify no glitches

**Test Case 3: Looping**
- Enable loop mode
- Let animation reach end
- Verify smooth loop to beginning
- Verify no backward jumps

**Test Case 4: Performance**
- Open browser DevTools Performance tab
- Record during playback
- Verify no excessive re-renders
- Verify smooth 60 FPS

**Test Case 5: Stop/Start**
- Play, stop, play again
- Verify consistent behavior
- Verify time resets correctly on stop

### Step 3: Verify Frame Accuracy

After the fix, verify:
- Frame counter increases by 1 per frame at 30 FPS
- Time progresses at ~0.033s per frame
- No dropped frames or stuttering

---

## Expected Improvements

### Before Fix
- ❌ Playhead goes backward
- ❌ 60+ effect remounts per second
- ❌ Severe lag and stuttering
- ❌ High CPU usage
- ❌ Unpredictable behavior

### After Fix
- ✅ Smooth forward playback
- ✅ Single animation loop runs continuously
- ✅ No lag or stuttering
- ✅ Normal CPU usage
- ✅ Predictable, accurate timing

---

## Additional Considerations

### 1. Frame Rate Accuracy

The current implementation uses `performance.now()` which is good, but consider:
- Actual delta time between frames varies (16.6ms ± jitter)
- May want frame-rate limiting or fixed timestep
- Consider using `timestamp` parameter from RAF directly

### 2. Pause/Resume Behavior

When pausing and resuming:
- Current code correctly resets `lastTimeRef` on resume
- This prevents time jump from pause duration
- No changes needed here

### 3. Seeking Behavior

The fix includes a sync effect:
```typescript
useEffect(() => {
  internalTimeRef.current = currentTime;
}, [currentTime]);
```

This ensures:
- Seeking updates internal time
- Next animation frame uses correct time
- No discontinuity after seek

### 4. Edge Cases

Test these scenarios:
- Seeking while paused
- Seeking past duration
- Seeking to negative time (should clamp to 0)
- Changing duration while playing
- Changing FPS while playing

---

## Code Changes Summary

**File**: `/src/animation-engine/usePlayback.ts`

**Changes Required**:
1. Add `internalTimeRef` ref declaration (line ~28)
2. Add sync useEffect (before main animation effect)
3. Update animation loop to use `internalTimeRef.current` instead of `currentTime`
4. Update `internalTimeRef.current` on each frame
5. Remove `currentTime` from main effect dependency array

**Lines to Modify**: 23-132

**Estimated Time**: 15 minutes

**Risk Level**: Low (isolated change to single hook)

---

## Testing Checklist

- [ ] Basic playback moves forward
- [ ] No backward movement during playback
- [ ] No lag or stuttering
- [ ] Seeking while playing works correctly
- [ ] Seeking while paused works correctly
- [ ] Stop resets to beginning
- [ ] Loop mode works correctly
- [ ] Frame counter increments correctly
- [ ] Time display is accurate
- [ ] No console errors
- [ ] Performance is smooth (60 FPS)
- [ ] CPU usage is normal
- [ ] Works with different FPS settings
- [ ] Works with different durations
- [ ] Step forward/backward buttons work
- [ ] Playhead snapping works correctly

---

## Conclusion

This is a **critical bug** caused by a React hook dependency cycle. The fix is straightforward:
- Use refs for internal time tracking
- Remove `currentTime` from effect dependencies
- Keep state updates for UI rendering

This will result in smooth, accurate, forward-moving playback with no performance issues.

---

## Next Steps

1. Apply the code changes to `usePlayback.ts`
2. Run the application and test all playback scenarios
3. Use browser DevTools to verify performance
4. Test with various project configurations
5. Verify all timeline features still work correctly

The fix should provide immediate, dramatic improvement in playback behavior.
