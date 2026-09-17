import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTutorialIntroStore } from './introStore';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useEditorStore } from '../store/editor';
import { useTimelineStore } from '../store/timeline';
import { usePanelStore } from '../store/panels';
import { getTemplate } from '../animation-templates/catalog';
import { SpotlightOverlay } from './SpotlightOverlay';
import { launchTutorial } from './launch';

/**
 * Onboarding → "Yes, open the example" flow. Mounted in the editor.
 *
 * Reworked into a scripted showcase (no jarring "editor first, then popup"): first a
 * "Loading editor" bridge covers the raw editor, then an intro button. On start it drives
 * the Starter editor's own choreography one animation at a time:
 *   pen-writing (plays)  → box + Continue
 *   bar-chart-race (plays to end) → box + Show me
 *   recursive-editor (static, no play) → box + Show me
 *   forest (static, no play) → deselect all → focus rectangle on the mode switch + final box
 * When the user switches to the Full editor (confirmed), the normal guided tutorial launches.
 *
 * Between every step the composition is cleared and the playhead is reset to 0.
 * This is pure UI/store scripting - the interactive TIMING/UX still needs a browser eyeball.
 */

type Phase =
  | 'idle'
  | 'loading' // "Loading editor" bridge (hides the raw editor before the first prompt)
  | 'intro' // example-project start button
  | 'penPlay' // pen-writing playing
  | 'penBox' // box after pen (Continue)
  | 'racePlay' // bar-chart-race playing to the end
  | 'raceBox' // box after race (Show me)
  | 'recursive' // recursive-editor shown static (no play)
  | 'recursiveBox' // box (Show me)
  | 'forest' // forest shown static (no play)
  | 'finalBox'; // deselect + focus rectangle on the mode switch + final prompt

const LOADING_MS = 1800; // bridge long enough for the fresh comp to settle before we script it
const PLAY_TAIL_MS = 200; // small tail so play() reaches the last content frame before we pause
const STATIC_BEAT_MS = 1100; // let a no-play template register on screen before its box appears

// ── Store-scripting helpers (read the live stores fresh each call) ───────────────────────────────

function clearComposition() {
  const st = useEditorStore.getState();
  const ids = st.composition.layers.map((l) => l.id);
  if (ids.length) st.removeLayers(ids);
}

/** Clear everything, insert the template, and reset the playhead to 0. */
function loadTemplate(id: string) {
  clearComposition();
  useEditorStore.getState().insertAnimationTemplate(id);
  useTimelineStore.getState().seekTo(0);
}

function playTemplate(id: string) {
  loadTemplate(id);
  const tl = useTimelineStore.getState();
  tl.seekTo(0);
  tl.play();
}

/** Show a template's first frame without ever playing it. */
function showTemplateStatic(id: string) {
  loadTemplate(id);
  const tl = useTimelineStore.getState();
  tl.pause();
  tl.seekTo(0);
}

/** How long to let a template play before pausing on its final content frame. */
function playMs(id: string): number {
  const t = getTemplate(id);
  if (!t) return 6000;
  return (t.durationFrames / t.authorFps) * 1000 + PLAY_TAIL_MS;
}

/** Pause and land on the template's last content frame (the finished look). */
function pauseAtEnd(id: string) {
  const tl = useTimelineStore.getState();
  tl.pause();
  const t = getTemplate(id);
  const total = useEditorStore.getState().composition.settings.durationFrames;
  const frame = t ? Math.min(total - 1, t.durationFrames) : Math.max(0, total - 1);
  tl.seekTo(Math.max(0, frame));
}

export function TutorialIntro() {
  const pending = useTutorialIntroStore((s) => s.pending);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const uiMode = usePanelStore((s) => s.uiMode);
  const [phase, setPhase] = useState<Phase>('idle');
  const launchedRef = useRef(false);

  // Arm the loading bridge once the example project is actually open.
  useEffect(() => {
    if (!pending || !activeProjectId || phase !== 'idle') return;
    setPhase('loading');
  }, [pending, activeProjectId, phase]);

  // Timed transitions for the phases that advance on their own.
  useEffect(() => {
    if (phase === 'loading') {
      const t = window.setTimeout(() => setPhase('intro'), LOADING_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'penPlay') {
      const t = window.setTimeout(() => { pauseAtEnd('pen-writing'); setPhase('penBox'); }, playMs('pen-writing'));
      return () => window.clearTimeout(t);
    }
    if (phase === 'racePlay') {
      const t = window.setTimeout(() => { pauseAtEnd('bar-chart-race'); setPhase('raceBox'); }, playMs('bar-chart-race'));
      return () => window.clearTimeout(t);
    }
    if (phase === 'recursive') {
      const t = window.setTimeout(() => setPhase('recursiveBox'), STATIC_BEAT_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'forest') {
      const t = window.setTimeout(() => { useEditorStore.getState().deselectAll(); setPhase('finalBox'); }, STATIC_BEAT_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  // Final step: when the user confirms the switch to the Full editor, launch the guided tutorial.
  useEffect(() => {
    if (phase !== 'finalBox' || uiMode !== 'pro' || launchedRef.current) return;
    launchedRef.current = true;
    useTutorialIntroStore.getState().clear();
    setPhase('idle');
    void launchTutorial();
  }, [phase, uiMode]);

  if (phase === 'idle') return null;

  const startShowcase = () => { playTemplate('pen-writing'); setPhase('penPlay'); };
  const toRace = () => { playTemplate('bar-chart-race'); setPhase('racePlay'); };
  const toRecursive = () => { showTemplateStatic('recursive-editor'); setPhase('recursive'); };
  const toForest = () => { showTemplateStatic('forest'); setPhase('forest'); };

  const showInputGuard = phase !== 'loading' && phase !== 'intro' && phase !== 'finalBox';

  return (
    <>
      {/* Block stray editor interaction while an animation is on screen (the user must not touch it).
          Off in finalBox, where they need to click the real mode-switch button. */}
      {showInputGuard && <div className="fixed inset-0 z-[110]" aria-hidden />}

      {(phase === 'loading' || phase === 'intro') && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-surface-sunken px-8">
          {phase === 'loading' ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 size={32} className="animate-spin text-accent" />
              <p className="text-lg font-light text-muted">Loading editor...</p>
            </div>
          ) : (
            <div className="flex max-w-2xl flex-col items-center gap-8 text-center">
              <p className="text-2xl font-light leading-snug text-primary md:text-3xl">
                Welcome to FlashFX. Let's look at a few examples of what you can build. Sit back and do not touch the screen unless prompted to.
              </p>
              <button
                type="button"
                onClick={startShowcase}
                className="h-comfortable rounded-md bg-accent px-6 text-body-strong text-on-accent transition-colors duration-micro hover:bg-accent-hover"
              >
                Show me an example
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'finalBox' && <SpotlightOverlay target="editor-mode-switch" />}

      {phase === 'penBox' && (
        <ShowcaseBox
          text="FlashFX can create both simple and complex animations. Here on screen there is a simple one. Let's look at other examples, one a little more complex."
          button={{ label: 'Continue', onClick: toRace }}
        />
      )}
      {phase === 'raceBox' && (
        <ShowcaseBox
          text="This is an example of a medium animation. Let's look at a complex one: an editor inside the editor!"
          button={{ label: 'Show me', onClick: toRecursive }}
        />
      )}
      {phase === 'recursiveBox' && (
        <ShowcaseBox
          text="And finally, you can also create small illustrated animations."
          button={{ label: 'Show me', onClick: toForest }}
        />
      )}
      {phase === 'finalBox' && (
        <ShowcaseBox text="Enough flexing. Now let's get to the sauce. Here you are in the sample editor: click the gray button to switch to the full editor." />
      )}
    </>
  );
}

/** Bottom-center prompt box for a showcase step (its own component so it never couples to the
 *  guided-tutorial NarrationBar/store). */
function ShowcaseBox({ text, button }: { text: string; button?: { label: string; onClick: () => void } }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-[120] w-[min(680px,92vw)] -translate-x-1/2 rounded-xl border border-[#1a2a42] bg-[#0e1c32] px-5 py-4 shadow-2xl">
      <div className="flex items-center gap-4">
        <p className="flex-1 text-[13px] leading-relaxed text-slate-100">{text}</p>
        {button && (
          <button
            type="button"
            onClick={button.onClick}
            className="flex-shrink-0 rounded-md bg-accent px-4 py-2 text-[12px] font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            {button.label}
          </button>
        )}
      </div>
    </div>
  );
}
