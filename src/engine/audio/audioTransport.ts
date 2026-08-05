// The single shared AudioContext + master output graph for ALL preview audio —
// audio layers (AudioBufferSourceNodes) AND video-clip audio (MediaElementSource).
//
// Previously audioPlayback and videoAudioPlayer each created their OWN context:
// video audio therefore never reached the master gain or the VU analysers, and its
// private context was created suspended and never resumed → video audio was silent
// on load and the meters were dead. Owning ONE context + graph here fixes both, and
// gives the whole session a single clock (the basis for the audio-master rework).
// The first caller — video import OR play — lazily creates it (suspended until a
// user gesture resumes it).

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let masterAnalyser: AnalyserNode | null = null;
let analyserL: AnalyserNode | null = null;
let analyserR: AnalyserNode | null = null;

function ensure(): void {
  if (ctx && ctx.state !== 'closed') return;
  ctx = new AudioContext();
  masterGain = ctx.createGain();

  masterAnalyser = ctx.createAnalyser();
  masterAnalyser.fftSize = 2048;
  masterAnalyser.smoothingTimeConstant = 0.8;

  const splitter = ctx.createChannelSplitter(2);
  analyserL = ctx.createAnalyser();
  analyserL.fftSize = 1024;
  analyserL.smoothingTimeConstant = 0.8;
  analyserR = ctx.createAnalyser();
  analyserR.fftSize = 1024;
  analyserR.smoothingTimeConstant = 0.8;

  // masterGain → analyser → destination, with a splitter tap for L/R VU meters.
  masterGain.connect(masterAnalyser);
  masterAnalyser.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
  masterAnalyser.connect(ctx.destination);

  // Keep-alive: a silent constant source keeps the context's currentTime advancing
  // reliably (the audio master clock) even when no audible layer is scheduled — e.g.
  // an image/text-only composition.
  try {
    const keepAlive = ctx.createConstantSource();
    const silent = ctx.createGain();
    silent.gain.value = 0;
    keepAlive.connect(silent);
    silent.connect(ctx.destination);
    keepAlive.start();
  } catch {
    // ConstantSourceNode unsupported → currentTime still advances while running.
  }
}

export const audioTransport = {
  /** The shared AudioContext (created on first use, suspended until resumed). */
  getContext(): AudioContext {
    ensure();
    return ctx!;
  },
  /** Everything audible connects here. */
  getMasterGain(): GainNode {
    ensure();
    return masterGain!;
  },
  getMasterAnalyser(): AnalyserNode | null {
    return masterAnalyser;
  },
  getAnalyserLeft(): AnalyserNode | null {
    return analyserL;
  },
  getAnalyserRight(): AnalyserNode | null {
    return analyserR;
  },
  /** Whether the context exists yet (without creating it). */
  exists(): boolean {
    return ctx !== null;
  },
  state(): AudioContextState | 'uninitialized' {
    return ctx ? ctx.state : 'uninitialized';
  },
  /** currentTime of the shared context, or 0 if not yet created. */
  currentTime(): number {
    return ctx ? ctx.currentTime : 0;
  },
  /** ctx.outputLatency (+ baseLatency) in seconds — audible-vs-scheduled offset. */
  outputLatencySec(): number {
    if (!ctx) return 0;
    const out = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    const base = ctx.baseLatency ?? 0;
    return out > 0 ? out + base : base;
  },
  /** Resume the shared context (call from a user gesture). Resolves to isRunning. */
  async resume(): Promise<boolean> {
    ensure();
    if (ctx!.state === 'suspended') {
      try {
        await ctx!.resume();
      } catch {
        return false;
      }
    }
    return ctx!.state === 'running';
  },
};
