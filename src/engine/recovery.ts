import { playbackController } from '../store/timeline';
import { clearTextCache } from './textAtlas';
import { supabase } from '../lib/supabase';
import {
  useRecoveryStore,
  type RecoveryEventType,
  type RecoverySeverity,
  type RecoveryStats,
} from '../store/recovery';
import { useProjectStore } from '../project-system/hooks/useProjectStore';

const TEXTURE_DANGER = 140;
const JS_HEAP_DANGER_RATIO = 0.88;
const MONITOR_INTERVAL_MS = 2000;

interface PerfMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function readHeap(): { mb: number | null; ratio: number | null } {
  const mem = (performance as unknown as { memory?: PerfMemory }).memory;
  if (!mem || !mem.jsHeapSizeLimit) return { mb: null, ratio: null };
  return {
    mb: Math.round(mem.usedJSHeapSize / (1024 * 1024)),
    ratio: mem.usedJSHeapSize / mem.jsHeapSizeLimit,
  };
}

class EditorRecovery {
  private sessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  private monitorId: ReturnType<typeof setInterval> | null = null;
  private resetting = false;
  private autoRecovering = false;

  log(
    type: RecoveryEventType,
    severity: RecoverySeverity,
    message: string,
    details: Record<string, unknown> = {},
  ): void {
    const store = useRecoveryStore.getState();
    store.pushEvent({
      id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      severity,
      message,
      at: Date.now(),
    });
    if (severity === 'error') store.setLastError(message);

    // Best-effort remote logging. Never await, never throw into callers.
    if (supabase) {
      const projectId = useProjectStore.getState().activeProjectId ?? null;
      void supabase
        .from('editor_recovery_logs')
        .insert({
          event_type: type,
          severity,
          message,
          details,
          project_id: projectId,
          session_id: this.sessionId,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        })
        .then(undefined, () => { /* offline / unreachable — ignore */ });
    }
  }

  startMonitor(): void {
    if (this.monitorId !== null) return;
    this.monitorId = setInterval(() => this.sampleAndProtect(), MONITOR_INTERVAL_MS);
  }

  stopMonitor(): void {
    if (this.monitorId !== null) {
      clearInterval(this.monitorId);
      this.monitorId = null;
    }
  }

  private sampleAndProtect(): void {
    const renderer = playbackController.getRenderer();
    const heap = readHeap();
    const stats: RecoveryStats = {
      totalTextures: renderer?.getStats().totalTextures ?? 0,
      decoders: 0,
      cachedFrames: 0,
      jsHeapMB: heap.mb,
    };
    useRecoveryStore.getState().setStats(stats);

    const heapDanger = heap.ratio !== null && heap.ratio >= JS_HEAP_DANGER_RATIO;
    const textureDanger = stats.totalTextures >= TEXTURE_DANGER;

    if (heapDanger || textureDanger) {
      const reason = heapDanger
        ? `JS heap at ${(heap.ratio! * 100).toFixed(0)}%`
        : `${stats.totalTextures} GPU textures`;
      this.log('memory_pressure', 'warning', `Memory pressure detected: ${reason}`, {
        ...stats,
        heapRatio: heap.ratio,
      });
      this.autoTrim();
    }
  }

  // Reduce caches without tearing down the device. Preferred over crashing.
  private autoTrim(): void {
    const renderer = playbackController.getRenderer();
    renderer?.flushTextureCaches();
    this.log('auto_trim', 'info', 'Reduced caches to relieve memory pressure');
    playbackController.renderCurrentFrame();
  }

  // Called by the renderer when the WebGPU device is lost. Attempts an
  // automatic rebuild before any error is shown to the user.
  handleDeviceLost(reason: string): void {
    this.log('device_lost', 'error', `WebGPU device lost: ${reason}`, { reason });
    this.attemptAutoRecovery('device loss');
  }

  private attemptAutoRecovery(cause: string): void {
    if (this.autoRecovering || this.resetting) return;
    this.autoRecovering = true;
    const store = useRecoveryStore.getState();
    store.setStatus('recovering');
    this.log('auto_recovery', 'warning', `Attempting automatic recovery after ${cause}`);

    try {
      playbackController.pause();
    } catch { /* ignore */ }

    // Release transient GPU/decoder state, then force the Viewport to rebuild
    // the renderer (new device + pipelines) by bumping the epoch.
    clearTextCache();
    store.bumpRendererEpoch();

    // The rebuild happens in the Viewport effect; give it a tick, then resume.
    setTimeout(() => {
      this.autoRecovering = false;
      const ok = playbackController.getRenderer()?.isReady() ?? false;
      if (ok) {
        store.setStatus('healthy');
        store.setInitFailed(false);
        this.log('init_recovered', 'info', 'Rendering engine rebuilt successfully');
        playbackController.renderCurrentFrame();
      } else {
        store.setStatus('failed');
        store.setInitFailed(true);
        this.log('init_failed', 'error', 'Automatic recovery failed; manual reset required');
      }
    }, 250);
  }

  // Full, user-initiated reset. Clears every transient cache and rebuilds the
  // rendering engine from scratch. Never deletes projects, assets, or settings.
  async resetEditor(): Promise<void> {
    if (this.resetting) return;
    this.resetting = true;
    const store = useRecoveryStore.getState();
    store.setStatus('recovering');
    this.log('reset_editor', 'info', 'Reset Editor invoked by user');

    try {
      playbackController.pause();
    } catch { /* ignore */ }

    // 1. Texture cache (GPU textures, thumbnails) on the live renderer.
    playbackController.getRenderer()?.flushTextureCaches();
    // 2. Text atlas (rendered glyph bitmaps).
    clearTextCache();

    // 4. Force a complete WebGPU reconstruction: bumping the epoch tears down
    //    the old device/pipelines/buffers and builds a fresh renderer.
    store.bumpRendererEpoch();
    store.closeResetDialog();

    // 5. Wait for the Viewport to rebuild, then reload current project state.
    await new Promise((r) => setTimeout(r, 300));

    const ready = playbackController.getRenderer()?.isReady() ?? false;
    if (ready) {
      store.setStatus('healthy');
      store.setInitFailed(false);
      store.setLastError(null);
      this.log('init_recovered', 'info', 'Editor reset complete; rendering engine rebuilt');
      playbackController.renderCurrentFrame();
    } else {
      store.setStatus('failed');
      store.setInitFailed(true);
      this.log('init_failed', 'error', 'Rendering engine failed to reinitialize after reset');
    }

    this.resetting = false;
  }

  reportInitFailure(message: string): void {
    useRecoveryStore.getState().setInitFailed(true);
    useRecoveryStore.getState().setStatus('failed');
    this.log('init_failed', 'error', message);
  }

  reportInitSuccess(): void {
    const store = useRecoveryStore.getState();
    if (store.initFailed || store.status !== 'healthy') {
      store.setInitFailed(false);
      store.setStatus('healthy');
      this.log('init_recovered', 'info', 'Rendering engine initialized');
    }
  }
}

export const editorRecovery = new EditorRecovery();
