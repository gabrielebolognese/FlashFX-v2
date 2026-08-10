// Scripted "generation" for the AI panel MOCKUP. The first message the user sends runs this instead
// of the canned streamResponse: it streams an intro, walks a real checklist (Director → Coders with a
// rising layer count → Assembly → Preset expansion → Polish → Commit), then — so it isn't useless —
// actually builds the Blackjack template on the canvas and streams a summary. Cancelable timers only;
// no model, no network. This is the seam the real Director → Coder → assembly pipeline replaces.

export interface Step { key: string; label: string; detail?: string; status: 'pending' | 'running' | 'done' }

export interface DemoHandlers {
  appendToken: (t: string) => void;   // append to the assistant message text
  setSteps: (steps: Step[]) => void;  // replace the checklist
  insert: () => void;                 // build the template on the canvas
  done: (ms: number) => void;         // finish (stops streaming, stamps elapsed)
}

const INTRO =
  "I'll create a full blackjack card animation — a top-down casino table where the dealer distributes " +
  'two hands, with a slow cinematic camera push-in for energy and a running commentary that types each ' +
  'hand out character by character. Planning it now:';

const SUMMARY =
  '\n\nDone — a 13-second top-down blackjack scene is on your canvas. The dealer deals two hands ' +
  '(Player A♠ 10♥ = 21 · Dealer K♦ 7♣ = 17) with staggered throws, a slow camera push-in and drift for ' +
  'depth, and a monospace commentary that types each hand out character by character. Everything is fully ' +
  'editable — every card, keyframe, and the camera move sits on the timeline.\n\n' +
  '(This is a mockup of the generation flow; the real Director → Coder → assembly pipeline is being wired in.)';

const STEP_DEFS: { key: string; label: string }[] = [
  { key: 'director', label: 'Director — planning the scene' },
  { key: 'coders', label: 'Coders — building panel layers' },
  { key: 'assembly', label: 'Assembly — merging layers, z-order & seams' },
  { key: 'presets', label: 'Preset expansion — deal, camera pan, reveals' },
  { key: 'polish', label: 'Polish — easing, timing, contrast' },
  { key: 'commit', label: 'Commit — one undo step' },
];

export function runBlackjackDemo(h: DemoHandlers): { cancel: () => void } {
  let cancelled = false;
  const timers: number[] = [];
  const start = Date.now();
  const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms)); };

  // 1) stream the intro, token by token.
  let t = 320;
  for (const tok of INTRO.split(/(\s+)/)) { const tk = tok; at(t, () => h.appendToken(tk)); t += tk.trim() ? 30 : 12; }

  // 2) the checklist.
  const steps: Step[] = STEP_DEFS.map((s) => ({ ...s, status: 'pending' }));
  const push = () => h.setSteps(steps.map((s) => ({ ...s })));
  let cur = t + 250;
  at(cur, push);

  const run = (i: number, dur: number, detail: string, onDone?: () => void) => {
    at(cur, () => { steps[i].status = 'running'; push(); });
    cur += dur;
    at(cur, () => { steps[i].status = 'done'; steps[i].detail = detail; push(); onDone?.(); });
    cur += 130;
  };

  run(0, 1100, '2 panels · 13.0s · cinematic tone');

  // Coders — the layer count rises as each "coder" reports in.
  at(cur, () => { steps[1].status = 'running'; steps[1].detail = '0 / 6 layers'; push(); });
  const N = 6;
  for (let k = 1; k <= N; k++) at(cur + k * 340, () => { steps[1].detail = `${k} / ${N} layers`; push(); });
  cur += N * 340 + 220;
  at(cur, () => { steps[1].status = 'done'; steps[1].detail = `${N} / ${N} layers`; push(); });
  cur += 150;

  run(2, 900, 'z-order + seams reconciled');
  run(3, 1050, 'deal · camera pan · char reveals');
  run(4, 850, 'easing + contrast pass');
  run(5, 480, '1 undo step', () => h.insert()); // BUILD the scene on the canvas at "commit"

  // 3) stream the summary, then finish.
  let st = cur + 300;
  for (const tok of SUMMARY.split(/(\s+)/)) { const tk = tok; at(st, () => h.appendToken(tk)); st += 26; }
  at(st + 120, () => h.done(Date.now() - start));

  return { cancel: () => { cancelled = true; timers.forEach(clearTimeout); } };
}

// ── Second message: "can you create a galaxy too?" — same shape, but the build is ANIMATED on the
// canvas (layers appear one at a time, THEN the keyframes are applied), driven by the store's
// insertAnimationTemplateAnimated via the `animate` handler.

const GALAXY_INTRO =
  'Absolutely — a galaxy makes a great companion piece. I\'ll build a deep-space scene: a slow-drifting ' +
  'starfield with parallax layers, a luminous nebula core, and orbiting sparks, tuned to sit in the same ' +
  'dark, cinematic register as the blackjack table so they read as one set — reusing the timing beat and ' +
  'easing vocabulary for consistency. And this time I\'ll assemble it live, so you can watch it come together:';

const GALAXY_SUMMARY =
  '\n\nDone — the galaxy scene is assembled on your canvas. I brought the layers in one at a time ' +
  '(starfield → nebula → core → orbiters), then applied the motion — a slow drift, a breathing glow on the ' +
  'core, and orbiting sparks — so it built rather than popping in all at once. It shares the blackjack ' +
  'scene\'s dark palette and easing set. Scrub the timeline to preview; every layer and keyframe is editable.\n\n' +
  '(Still a mockup of the generation flow — the real Director → Coder → assembly pipeline is being wired in.)';

const GALAXY_STEP_DEFS: { key: string; label: string }[] = [
  { key: 'director', label: 'Director — planning the companion scene' },
  { key: 'coders', label: 'Coders — building layer groups' },
  { key: 'assembly', label: 'Assembly — z-order & parenting' },
  { key: 'animate', label: 'Animating — reveal layers, then keyframes' },
  { key: 'polish', label: 'Polish — easing, glow, contrast' },
  { key: 'commit', label: 'Commit — one undo step' },
];

export interface AnimateHandlers { onLayer: (shown: number, total: number) => void; onKeyframes: () => void; onDone: () => void }
export interface GalaxyHandlers extends DemoHandlers {
  /** Kick off the live animated build; returns a cancel handle. */
  animate: (cbs: AnimateHandlers) => { cancel: () => void };
}

export function runGalaxyDemo(h: GalaxyHandlers): { cancel: () => void } {
  let cancelled = false;
  const timers: number[] = [];
  let animCtl: { cancel: () => void } | null = null;
  const start = Date.now();
  const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms)); };

  // 1) intro.
  let t = 320;
  for (const tok of GALAXY_INTRO.split(/(\s+)/)) { const tk = tok; at(t, () => h.appendToken(tk)); t += tk.trim() ? 30 : 12; }

  // 2) checklist up to the animated build.
  const steps: Step[] = GALAXY_STEP_DEFS.map((s) => ({ ...s, status: 'pending' }));
  const push = () => h.setSteps(steps.map((s) => ({ ...s })));
  let cur = t + 250;
  at(cur, push);
  const run = (i: number, dur: number, detail: string) => {
    at(cur, () => { steps[i].status = 'running'; push(); });
    cur += dur;
    at(cur, () => { steps[i].status = 'done'; steps[i].detail = detail; push(); });
    cur += 130;
  };
  run(0, 1100, 'reuses the scene palette · 1 panel');
  at(cur, () => { steps[1].status = 'running'; steps[1].detail = '0 / 5 groups'; push(); });
  const N = 5;
  for (let k = 1; k <= N; k++) at(cur + k * 320, () => { steps[1].detail = `${k} / ${N} groups`; push(); });
  cur += N * 320 + 200;
  at(cur, () => { steps[1].status = 'done'; steps[1].detail = `${N} / ${N} groups`; push(); });
  cur += 150;
  run(2, 850, 'z-order + parenting resolved');

  // 3) the ANIMATED build — layers reveal, then keyframes; the rest of the checklist + summary chain
  //    off the build's onDone (its duration depends on the layer count).
  at(cur, () => {
    steps[3].status = 'running'; steps[3].detail = 'revealing layers…'; push();
    animCtl = h.animate({
      onLayer: (shown, total) => { steps[3].detail = `layer ${shown} / ${total}`; push(); },
      onKeyframes: () => { steps[3].detail = 'applying keyframes…'; push(); },
      onDone: () => {
        steps[3].status = 'done'; steps[3].detail = 'drift · glow · orbit'; push();
        let c2 = 0;
        const at2 = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms)); };
        at2((c2 += 200), () => { steps[4].status = 'running'; push(); });
        at2((c2 += 850), () => { steps[4].status = 'done'; steps[4].detail = 'easing + contrast'; push(); });
        at2((c2 += 150), () => { steps[5].status = 'running'; push(); });
        at2((c2 += 480), () => { steps[5].status = 'done'; steps[5].detail = '1 undo step'; push(); });
        let sst = c2 + 300;
        for (const tok of GALAXY_SUMMARY.split(/(\s+)/)) { const tk = tok; at2(sst, () => h.appendToken(tk)); sst += 26; }
        at2(sst + 120, () => h.done(Date.now() - start));
      },
    });
  });

  return { cancel: () => { cancelled = true; animCtl?.cancel(); timers.forEach(clearTimeout); } };
}
