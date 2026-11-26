import { videoDecoderPool } from './videoDecoderPool';
import { exportFrameKey, planExportFrames, type ExportFrameReq, type ExportVideoReader, type VideoFrameLookup } from './exportFrames';

/**
 * B68: the exporter's (and render_frame's) private video-frame source. Holds exactly the decoded
 * frames the current composition frame needs (planExportFrames closes the rest before decoding the
 * next set), decodes through its own forward-cursor session (videoDecoderPool.openExportReader), and
 * is handed to the offscreen renderer with setVideoFrameSource, so the export never reads, fills or
 * evicts the shared preview frameScheduler (whose playback prefetch / open-frame cap used to close or
 * race the export's frames and multiply the live decoders).
 */
export class ExportFrameSource implements VideoFrameLookup {
  private held = new Map<string, VideoFrame>();
  private reader: ExportVideoReader = videoDecoderPool.openExportReader();
  private disposed = false;

  /** Make exactly `needed` resident: close frames no longer needed, decode the missing ones. */
  async prepare(needed: readonly ExportFrameReq[]): Promise<void> {
    if (this.disposed) throw new Error('the export frame source is disposed');
    const plan = planExportFrames(this.held.keys(), needed);
    for (const k of plan.close) {
      this.held.get(k)?.close();
      this.held.delete(k);
    }
    await Promise.all(plan.decode.map(async (r) => {
      const frame = await this.reader.decode(r.assetId, r.frame);
      // A decode that lands after dispose (a cancelled / failed export) must not leak its frame.
      if (this.disposed) { frame.close(); return; }
      const k = exportFrameKey(r.assetId, r.frame);
      this.held.get(k)?.close();
      this.held.set(k, frame);
    }));
  }

  getFrame(assetId: string, frameIndex: number): VideoFrame | null {
    return this.held.get(exportFrameKey(assetId, frameIndex)) ?? null;
  }

  /** Frames held right now (diagnostics / harnesses). */
  heldCount(): number {
    return this.held.size;
  }

  /** Close every held frame and the decode session (its decoders). Safe to call twice. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.held.values()) f.close();
    this.held.clear();
    await this.reader.close().catch(() => {});
  }
}
