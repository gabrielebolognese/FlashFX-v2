import type { DirectorOutput, Panel, Job, StyleContractT as StyleContract } from '../schema';

// PLAN COMPILATION: Director output (ms) → frame-space panel plan + per-panel jobs. The ms→frame
// conversion happens EXACTLY ONCE, at the level of the timing beat: we derive an integer beat in
// frames, express every panel boundary as an integer number of beats, and multiply. Converting each
// timestamp independently would accumulate rounding drift and could land a deliberately-chosen beat
// off the frame grid. After this stage NOTHING downstream sees milliseconds.

export interface PlanResult {
  beatFrames: number;
  durationFrames: number;
  panels: Panel[];
  jobs: Job[];
}

type BoundaryState = Panel['inbound']['states'][number];

export function compilePlan(director: DirectorOutput, opts: { fps: number; layerBudget: number }): PlanResult {
  const { fps, layerBudget } = opts;
  const style: StyleContract = director.styleContract;
  const beatMs = style.beatMs;
  const beatFrames = Math.max(1, Math.round((beatMs * fps) / 1000));

  // The single conversion: ms → integer beats → frames. Every boundary lands exactly on `beatFrames`
  // multiples, so a contiguous ms plan stays contiguous in frames with zero drift.
  const toFrames = (ms: number): number => Math.round(ms / beatMs) * beatFrames;

  const states = (ids: string[], atFrame: number): { atFrame: number; states: BoundaryState[] } => ({
    atFrame,
    states: ids.map((layerId) => ({ layerId, present: true, opacity: 1 })),
  });

  const ordered = [...director.panelPlan].sort((a, b) => a.order - b.order);
  const panels: Panel[] = ordered.map((dp) => {
    const start = toFrames(dp.startMs);
    let end = toFrames(dp.endMs);
    if (end <= start) end = start + beatFrames; // guard a beat-rounded-to-zero panel (rare)
    const panel: Panel = {
      id: dp.id,
      order: dp.order,
      start,
      end,
      inbound: states(dp.inboundPresent, start),
      outbound: states(dp.outboundPresent, end),
    };
    if (dp.focalPoint) panel.focalPoint = dp.focalPoint;
    if (dp.transitionIn) {
      panel.transitionIn = { ...dp.transitionIn, duration: toFrames(dp.transitionIn.duration) };
    }
    return panel;
  });

  const durationFrames = panels.reduce((m, p) => Math.max(m, p.end), 0);

  const jobs: Job[] = panels.map((panel, i) => ({
    requestId: `job:${panel.id}`,
    panelId: panel.id,
    styleContract: style,
    panel,
    neighbors: {
      ...(i > 0 ? { prevOutbound: panels[i - 1].outbound } : {}),
      ...(i < panels.length - 1 ? { nextInbound: panels[i + 1].inbound } : {}),
    },
    idNamespace: `p${panel.order}:`,
    layerBudget,
  }));

  return { beatFrames, durationFrames, panels, jobs };
}
