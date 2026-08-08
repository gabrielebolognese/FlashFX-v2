import { useEffect, useRef } from 'react';
import { useTutorialStore, SKIP_TO_END } from './store';
import { tutorialScript } from './tutorialScript';
import { NarrationBar } from './NarrationBar';
import type { TutorialApi } from './types';
import { useEditorStore } from '../store/editor';
import { useTimelineStore } from '../store/timeline';
import { useShapeToolStore } from '../store/shapeTool';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The director. Mounted once in the editor; renders nothing when idle. On `active`, runs the script
// against the REAL editor store — genuine edits, paced, skippable — then hands off. Control state is
// mirrored into a ref so the async loop reads live paused/speed/jump without re-subscribing.
export function TutorialRunner() {
  const active = useTutorialStore((s) => s.active);
  const phase = useTutorialStore((s) => s.phase);
  const paused = useTutorialStore((s) => s.paused);

  const ctrl = useRef({ paused: false, speed: 1 as number, jumpTo: null as number | null, aborted: false });

  // Keep the loop's control mirror current.
  useEffect(() => useTutorialStore.subscribe((s) => {
    ctrl.current.paused = s.paused;
    ctrl.current.speed = s.speed;
    ctrl.current.jumpTo = s.jumpTo;
  }), []);

  // Esc = skip the whole tutorial.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); useTutorialStore.getState().skipAll(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    ctrl.current = { paused: false, speed: 1, jumpTo: null, aborted: false };

    const wait = async (ms: number) => {
      let remaining = ms;
      while (remaining > 0 && !ctrl.current.aborted) {
        if (ctrl.current.paused) { await sleep(80); continue; }
        const chunk = Math.min(80, remaining / ctrl.current.speed);
        await sleep(chunk);
        remaining -= chunk * ctrl.current.speed;
      }
    };
    const api: TutorialApi = {
      editor: () => useEditorStore.getState(),
      timeline: () => useTimelineStore.getState(),
      tools: () => useShapeToolStore.getState(),
      wait,
      setFrame: (n) => useEditorStore.getState().setCurrentFrame(n),
      select: (ids) => useEditorStore.getState()._setSelection({ selectedIds: ids, activeId: ids[ids.length - 1] ?? null, selectedKeyframes: [], selectedCurvePoints: [] }),
      lastLayerId: () => { const ls = useEditorStore.getState().composition.layers; return ls[ls.length - 1]?.id; },
    };

    (async () => {
      await wait(600); // let the fresh project's comp settle before the first edit
      let ci = 0, si = 0;
      while (ci < tutorialScript.length && !ctrl.current.aborted) {
        const chapter = tutorialScript[ci];
        if (si >= chapter.steps.length) { ci++; si = 0; continue; }
        useTutorialStore.getState()._patch({ phase: 'running', chapterIndex: ci, stepIndex: si });
        const step = chapter.steps[si];
        try { await step.run?.(api); } catch (err) { console.error('[tutorial] step failed', step.id, err); }
        await wait(step.hold ?? 1200);
        if (ctrl.current.aborted) return;
        if (ctrl.current.jumpTo != null) {
          const target = ctrl.current.jumpTo;
          ctrl.current.jumpTo = null;
          useTutorialStore.getState()._patch({ jumpTo: null });
          if (target >= SKIP_TO_END || target >= tutorialScript.length) break; // skip to handoff
          ci = Math.max(0, target); si = 0;
          continue;
        }
        si++;
      }
      if (!ctrl.current.aborted) {
        useTimelineStore.getState().pause();
        useTutorialStore.getState()._patch({ phase: 'handoff' });
      }
    })();

    return () => { ctrl.current.aborted = true; };
  }, [active]);

  if (!active) return null;

  return (
    <>
      {/* Soft input-lock while auto-running (lifted on pause / handoff) so clicks don't fight the
          script; the narration bar sits above it. */}
      {phase === 'running' && !paused && (
        <div className="fixed inset-0 z-[110] cursor-progress" onClick={(e) => e.stopPropagation()} />
      )}
      <NarrationBar />
    </>
  );
}
