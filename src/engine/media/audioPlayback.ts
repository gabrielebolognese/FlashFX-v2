import type { Composition, AudioLayer } from '../../core/types';
import { evaluateNumber } from '../../core/interpolation';
import { mediaAssetManager } from './assetManager';
import { videoAudioPlayer } from '../video/videoAudioPlayer';
import { audioTransport } from '../audio/audioTransport';
import { computeSourceSchedule } from '../audio/audioScheduleMath';

export interface AudioDiagnostics {
  contextState: AudioContextState | 'uninitialized';
  activeSources: number;
  pendingBuffers: string[];
  failedAssets: string[];
}

/**
 * Derives a unique scheduling key for each audible layer. Audio layers use
 * their layer id directly; video layers are prefixed to avoid collisions.
 */
function layerKey(layer: { id: string; type: string }): string {
  return layer.type === 'video' ? `video_${layer.id}` : layer.id;
}

class AudioPlaybackEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private gainNodes = new Map<string, GainNode>();
  private sourceNodes = new Map<string, AudioBufferSourceNode>();
  private activeKeys = new Set<string>();
  /** Asset ids whose video audio is currently synced (played through videoAudioPlayer). */
  private activeVideoAssets = new Set<string>();
  private isPlaying = false;
  private lastComposition: Composition | null = null;
  private lastFrame = 0;
  private lastFrameRate = 30;
  private failedAssets = new Set<string>();
  private pendingAssets = new Set<string>();
  private bufferReadyUnsub: (() => void) | null = null;

  private ensureContext(): AudioContext {
    // One shared context + master graph for audio layers AND video-clip audio.
    this.context = audioTransport.getContext();
    this.masterGain = audioTransport.getMasterGain();
    return this.context;
  }

  getAnalyserLeft(): AnalyserNode | null { return audioTransport.getAnalyserLeft(); }
  getAnalyserRight(): AnalyserNode | null { return audioTransport.getAnalyserRight(); }
  getMasterAnalyser(): AnalyserNode | null { return audioTransport.getMasterAnalyser(); }

  private async resumeContext(): Promise<void> {
    await audioTransport.resume();
  }

  startPlayback(composition: Composition, currentFrame: number, frameRate: number): void {
    this.stopAllSources();
    this.isPlaying = true;
    this.lastComposition = composition;
    this.lastFrame = currentFrame;
    this.lastFrameRate = frameRate;

    this.resumeContext();
    this.evaluateAndSchedule(composition, currentFrame, frameRate);
    this.listenForBufferReady();
  }

  private listenForBufferReady(): void {
    if (this.bufferReadyUnsub) return;
    this.bufferReadyUnsub = mediaAssetManager.subscribe(() => {
      if (!this.isPlaying || !this.lastComposition) return;
      if (this.pendingAssets.size === 0) return;

      let anyResolved = false;
      for (const assetId of this.pendingAssets) {
        if (mediaAssetManager.getAudioBuffer(assetId)) {
          this.pendingAssets.delete(assetId);
          anyResolved = true;
        }
      }

      if (anyResolved) {
        this.evaluateAndSchedule(this.lastComposition!, this.lastFrame, this.lastFrameRate);
      }
    });
  }

  /**
   * Core scheduling method: determines which layers should be audible at the
   * given frame, starts sources for newly-active layers, and stops sources for
   * layers that are no longer active. This is called on every frame advance
   * so that clip transitions are handled seamlessly.
   */
  private evaluateAndSchedule(composition: Composition, currentFrame: number, frameRate: number): void {
    const ctx = this.ensureContext();
    const currentTime = currentFrame / frameRate;

    // Build track mute/hidden lookup
    const tracks = composition.tracks || [];
    const mutedTrackIds = new Set(tracks.filter((t) => t.muted || !t.visible).map((t) => t.id));

    // Determine which AUDIO layers should be audible right now. Video layers are
    // handled separately (reconcileVideoAudio) because their audio plays through
    // <video> elements that must be re-synced/re-muted every frame, not just at
    // clip activation.
    const shouldBeActive = new Set<string>();

    for (const layer of composition.layers) {
      if (!layer.visible) continue;
      if (layer.trackId && mutedTrackIds.has(layer.trackId)) continue;
      if (currentFrame < layer.inPoint || currentFrame >= layer.outPoint) continue;

      if (layer.type === 'audio' && !layer.audio.muted) {
        shouldBeActive.add(layerKey(layer));
      }
    }

    // Stop sources for audio layers that are no longer active
    for (const key of this.activeKeys) {
      if (!shouldBeActive.has(key)) {
        this.stopSource(key);
      }
    }

    // Start sources for newly-active audio layers (one-shot AudioBufferSourceNodes)
    for (const layer of composition.layers) {
      if (layer.type !== 'audio') continue;
      if (!layer.visible) continue;
      if (layer.trackId && mutedTrackIds.has(layer.trackId)) continue;
      if (currentFrame < layer.inPoint || currentFrame >= layer.outPoint) continue;

      const key = layerKey(layer);
      if (!shouldBeActive.has(key)) continue;
      if (this.activeKeys.has(key)) continue; // Already playing

      this.scheduleAudioLayer(layer, currentTime, currentFrame, frameRate, ctx);
    }

    // Reconcile video audio every frame (drift correction + live mute + pause
    // clips that left range).
    this.reconcileVideoAudio(composition, currentFrame, frameRate, mutedTrackIds);
  }

  /**
   * Reconcile video-layer audio every frame. Unlike `audio` layers (one-shot
   * AudioBufferSourceNodes started once), video audio plays through <video>
   * elements managed by videoAudioPlayer and must be re-synced to the playhead
   * each frame (drift correction), re-muted when the mute flag toggles mid-play,
   * and paused when a clip scrolls out of range. The old code only touched video
   * at clip activation, so video audio drifted, ignored live mute toggles, and
   * kept playing after a trimmed clip ended.
   */
  private reconcileVideoAudio(
    composition: Composition,
    currentFrame: number,
    frameRate: number,
    mutedTrackIds: Set<string>
  ): void {
    const currentTime = currentFrame / frameRate;
    const stillActive = new Set<string>();

    for (const layer of composition.layers) {
      if (layer.type !== 'video') continue;
      if (!layer.visible) continue;
      if (layer.trackId && mutedTrackIds.has(layer.trackId)) continue;
      if (currentFrame < layer.inPoint || currentFrame >= layer.outPoint) continue;

      const assetId = layer.video.assetId;
      const layerStartTimeSec = layer.inPoint / frameRate;
      const sourceStartOffsetSec = (layer.video.startOffset ?? 0) / layer.video.sourceFrameRate;

      videoAudioPlayer.syncToPlayhead(
        assetId,
        currentTime,
        this.isPlaying,
        layer.video.playbackRate,
        layerStartTimeSec,
        sourceStartOffsetSec
      );
      videoAudioPlayer.setMuted(assetId, layer.video.muted);
      stillActive.add(assetId);
    }

    // Pause assets whose clips left range (or whose track was muted/hidden).
    for (const assetId of this.activeVideoAssets) {
      if (!stillActive.has(assetId)) {
        videoAudioPlayer.pause(assetId);
      }
    }
    this.activeVideoAssets = stillActive;
  }

  private scheduleAudioLayer(
    layer: AudioLayer,
    currentTime: number,
    currentFrame: number,
    frameRate: number,
    ctx: AudioContext
  ): void {
    const buffer = mediaAssetManager.getAudioBuffer(layer.audio.assetId);
    if (!buffer) {
      this.pendingAssets.add(layer.audio.assetId);
      return;
    }

    const volume = evaluateNumber(layer.audio.volume, currentFrame);
    const pitch = evaluateNumber(layer.audio.pitch, currentFrame);
    // Pitch shift is a resample (Web Audio has no pitch-preserving rate) — so it
    // also sets how fast the source buffer is consumed per composition-second.
    const rate = Math.max(0.25, Math.min(4, Math.pow(2, pitch / 12)));

    // Shared clip→source scheduling (the SAME math the export mixer's anchor
    // reproduces — see engine/audio/audioScheduleMath + verify:audioschedule).
    // The preview anchors at (current playhead, ctx.currentTime, rate 1): a clip
    // already playing at the anchor starts now, advanced into its buffer by how
    // far past the clip start we are — scaled by the clip's own rate. The old
    // inline math advanced the offset UNSCALED, so pressing play with the
    // playhead parked mid-clip started a pitched clip at the wrong sample.
    const schedule = computeSourceSchedule(
      {
        clipStartCompSec: layer.inPoint / frameRate,
        clipDurationCompSec: (layer.outPoint - layer.inPoint) / frameRate,
        startOffsetSec: (layer.audio.startOffset ?? 0) / frameRate,
        playbackRate: rate,
        bufferDurationSec: buffer.duration,
      },
      { anchorCompSec: currentTime, anchorClockTime: ctx.currentTime, masterRate: 1 }
    );
    if (!schedule) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(2, volume));
    source.connect(gain);
    gain.connect(this.masterGain!);

    try {
      source.start(schedule.when, schedule.offset, schedule.duration);
    } catch (err) {
      console.warn(`[AudioEngine] Failed to start audio source for layer "${layer.name}":`, err);
      return;
    }

    const key = layerKey(layer);
    this.sourceNodes.set(key, source);
    this.gainNodes.set(key, gain);
    this.activeKeys.add(key);

    // A source with a finite duration ends on its OWN when its buffer/clip runs out
    // (e.g. a 3s SFX on a 10s layer, or the sample-accurate end just before the
    // rAF-jittered outPoint crossing). Disconnect it from the master graph then —
    // otherwise the node leaks: fadeAndStop's teardown only runs when we explicitly
    // stop a STILL-PLAYING source, never for one that already ended. Keep the key in
    // activeKeys so the one-shot isn't re-scheduled while the clip is still in range;
    // drop only the node maps. If we later stopSource() a still-playing instance,
    // fadeAndStop reassigns onended to its own fade-teardown, superseding this.
    source.onended = () => {
      try { source.disconnect(); } catch { /* already gone */ }
      try { gain.disconnect(); } catch { /* already gone */ }
      if (this.sourceNodes.get(key) === source) this.sourceNodes.delete(key);
      if (this.gainNodes.get(key) === gain) this.gainNodes.delete(key);
    };
  }

  /**
   * Stop and tear down one scheduled source with a short gain ramp to zero so it
   * never cuts on a non-zero sample (an audible click on every clip boundary,
   * pause, and seek). The map entries are removed synchronously (so activeKeys
   * bookkeeping is unaffected); the nodes disconnect after the fade via `onended`.
   */
  private stopSource(key: string): void {
    const source = this.sourceNodes.get(key);
    const gain = this.gainNodes.get(key);
    this.sourceNodes.delete(key);
    this.gainNodes.delete(key);
    this.activeKeys.delete(key);
    this.fadeAndStop(source, gain);
  }

  /** ~8ms declick fade, then stop; disconnect the nodes once the fade finishes. */
  private static readonly DECLICK_SEC = 0.008;
  private fadeAndStop(
    source: AudioBufferSourceNode | undefined,
    gain: GainNode | undefined
  ): void {
    if (!source) {
      if (gain) { try { gain.disconnect(); } catch { /* already gone */ } }
      return;
    }
    const ctx = this.context;
    const disconnect = () => {
      try { source.disconnect(); } catch { /* already gone */ }
      if (gain) { try { gain.disconnect(); } catch { /* already gone */ } }
    };
    if (gain && ctx) {
      const now = ctx.currentTime;
      const end = now + AudioPlaybackEngine.DECLICK_SEC;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, end);
      } catch { /* automation rejected — stop still runs below */ }
      try {
        source.stop(end);
        source.onended = disconnect; // disconnect only after the fade is heard
        return;
      } catch { /* already stopped — fall through to immediate teardown */ }
    } else {
      try { source.stop(); } catch { /* already stopped */ }
    }
    disconnect();
  }

  /**
   * Called on every frame advance during playback. Detects clip transitions
   * (new clips entering range, old clips leaving range) and updates the
   * active source set accordingly. Also updates volume/gain for ongoing clips.
   */
  updatePlayback(composition: Composition, currentFrame: number, frameRate: number): void {
    if (!this.isPlaying) return;
    this.lastComposition = composition;
    this.lastFrame = currentFrame;
    this.lastFrameRate = frameRate;

    this.evaluateAndSchedule(composition, currentFrame, frameRate);
    this.updateVolumes(composition, currentFrame);
  }

  private updateVolumes(composition: Composition, currentFrame: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;

    for (const layer of composition.layers) {
      // Video volume/mute is applied in reconcileVideoAudio via videoAudioPlayer
      // (its gain lives on the <video> element's node, not in this.gainNodes).
      if (layer.type !== 'audio') continue;
      const key = layerKey(layer);
      const gain = this.gainNodes.get(key);
      if (!gain) continue;
      if (layer.audio.muted) {
        gain.gain.setTargetAtTime(0, now, 0.02);
        continue;
      }
      const volume = evaluateNumber(layer.audio.volume, currentFrame);
      gain.gain.setTargetAtTime(Math.max(0, Math.min(2, volume)), now, 0.02);
    }
  }

  stopPlayback(): void {
    this.isPlaying = false;
    this.lastComposition = null;
    this.pendingAssets.clear();
    this.stopAllSources();

    if (this.bufferReadyUnsub) {
      this.bufferReadyUnsub();
      this.bufferReadyUnsub = null;
    }
  }

  private stopAllSources(): void {
    // Snapshot then clear the maps up front so bookkeeping is consistent even
    // though each source keeps playing for the ~8ms declick fade before it stops.
    const pairs: Array<[AudioBufferSourceNode, GainNode | undefined]> = [];
    for (const [key, source] of this.sourceNodes) {
      pairs.push([source, this.gainNodes.get(key)]);
    }
    this.sourceNodes.clear();
    this.gainNodes.clear();
    this.activeKeys.clear();
    for (const [source, gain] of pairs) {
      this.fadeAndStop(source, gain);
    }
    // Pause video audio too: it plays through <video> elements that stopping the
    // buffer sources doesn't touch, so without this it kept playing after pause.
    for (const assetId of this.activeVideoAssets) {
      videoAudioPlayer.pause(assetId);
    }
    this.activeVideoAssets.clear();
  }

  getDiagnostics(): AudioDiagnostics {
    return {
      contextState: this.context?.state ?? 'uninitialized',
      activeSources: this.sourceNodes.size,
      pendingBuffers: [...this.pendingAssets],
      failedAssets: [...this.failedAssets],
    };
  }

  destroy(): void {
    this.stopPlayback();
    // The AudioContext + master graph are owned by audioTransport (shared with
    // video-clip audio), so don't close them here — just drop local references.
    this.context = null;
    this.masterGain = null;
    this.failedAssets.clear();
  }
}

export const audioPlaybackEngine = new AudioPlaybackEngine();
