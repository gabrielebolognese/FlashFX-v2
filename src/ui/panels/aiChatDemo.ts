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
