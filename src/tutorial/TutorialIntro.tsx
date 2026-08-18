import { useEffect, useState } from 'react';
import { useTutorialIntroStore, TUTORIAL_EXAMPLE_FPS, TUTORIAL_EXAMPLE_DURATION_FRAMES } from './introStore';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useEditorStore } from '../store/editor';
import { useTimelineStore } from '../store/timeline';
import { launchTutorial } from './launch';

const CHOREO_MS = (TUTORIAL_EXAMPLE_DURATION_FRAMES / TUTORIAL_EXAMPLE_FPS) * 1000 + 500;

type Phase = 'idle' | 'popup' | 'starting';

/**
 * Onboarding → "Yes, open the example" flow. Mounted in the editor. When the intro is
 * pending and the example project is open: wait 2s, then show a full-screen "do not
 * touch" popup. On "Start tutorial" the button greys, the text becomes "Enjoy" and the
 * overlay fades out over 500ms; the bar-chart-race choreography plays; when it ends the
 * already-coded guided tutorial (launchTutorial) starts.
 */
export function TutorialIntro() {
  const pending = useTutorialIntroStore((s) => s.pending);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const [phase, setPhase] = useState<Phase>('idle');
  const [visible, setVisible] = useState(false);

  // Arm the 2s countdown once the example project is actually open.
  useEffect(() => {
    if (!pending || !activeProjectId || phase !== 'idle') return;
    const t = window.setTimeout(() => {
      setPhase('popup');
      setVisible(true);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [pending, activeProjectId, phase]);

  if (phase === 'idle') return null;

  const handleStart = () => {
    setPhase('starting'); // grey the button, swap the text to "Enjoy"
    setVisible(false); // begin the 500ms fade-out
    window.setTimeout(() => {
      // Kick off the bar-chart-race choreography in the example project.
      useEditorStore.getState().insertAnimationTemplate('bar-chart-race');
      const tl = useTimelineStore.getState();
      tl.seekTo(0);
      tl.play();
      setPhase('idle'); // remove the overlay; let the animation play
      useTutorialIntroStore.getState().clear();
      // When the race finishes, hand off to the already-coded guided tutorial.
      window.setTimeout(() => {
        useTimelineStore.getState().pause();
        void launchTutorial();
      }, CHOREO_MS);
    }, 500);
  };

  return (
    <div
      className={`fixed inset-0 z-top flex items-center justify-center bg-surface-sunken px-8 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex flex-col items-center gap-8 text-center">
        <p className="max-w-2xl text-2xl font-light leading-snug text-primary md:text-3xl">
          {phase === 'starting'
            ? 'Enjoy'
            : 'Tutorial project example. Do not touch the screen unless prompted to.'}
        </p>
        <button
          type="button"
          onClick={handleStart}
          disabled={phase === 'starting'}
          className={`h-comfortable rounded-md px-6 text-body-strong transition-colors duration-micro ${
            phase === 'starting'
              ? 'cursor-default bg-surface-3 text-muted'
              : 'bg-accent text-on-accent hover:bg-accent-hover'
          }`}
        >
          Start tutorial
        </button>
      </div>
    </div>
  );
}
