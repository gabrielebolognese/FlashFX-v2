// Pure runtime-policy helpers for the MP4 exporter: stall detection, software-fallback gating, and the
// copyable diagnostics block. Split out so the overnight-hang guards are unit-testable without a browser
// (the exporter shell that calls these needs WebCodecs/WebGPU; this file does not). See
// scripts/verify-export-runtime.mjs.
//
// Context: on some GPU/driver + Chrome combinations the hardware H.264 encoder silently WEDGES partway
// through an export - it stops emitting chunks and never fires its error callback. The old loop then
// waited on encodeQueueSize forever (a silent hang, reported as "stuck after frame 10"). These policies
// turn that into: detect no-progress -> abort that attempt -> retry once with a software encoder ->
// if that also fails, surface a clear error with diagnostics. Never an infinite wait.

/** No encoded frame for this long (ms) => treat the encoder/GPU as wedged and abort the attempt. Generous
 *  enough that a slow 4K software encode of a single frame never trips it. */
export const EXPORT_STALL_TIMEOUT_MS = 30_000;

/** Backpressure: start waiting when the encoder's queue exceeds HIGH, resume once it drains to LOW. */
export const EXPORT_QUEUE_HIGH = 5;
export const EXPORT_QUEUE_LOW = 2;

/** True once `nowMs - lastAdvanceMs` reaches the timeout (no progress => wedged). Pure. Any wait that
 *  consults this is therefore bounded: once the wall clock advances past the timeout it returns true, so
 *  the caller cannot loop forever. */
export function isExportStalled(
  nowMs: number,
  lastAdvanceMs: number,
  timeoutMs: number = EXPORT_STALL_TIMEOUT_MS,
): boolean {
  return nowMs - lastAdvanceMs >= timeoutMs;
}

/**
 * Given a failed attempt, decide whether a software-encoder retry is worth it. A hardware encoder that
 * wedged (stall) or errored is exactly the case a prefer-software retry fixes; once software has already
 * been tried, give up and surface the error. A user cancellation is never retried.
 */
export function shouldRetryWithSoftware(opts: { cancelled: boolean; triedSoftware: boolean }): boolean {
  if (opts.cancelled) return false;
  return !opts.triedSoftware;
}

/** The encoder-acceleration ladder: browser default first (usually hardware), then forced software. */
export type ExportAccel = 'no-preference' | 'prefer-software';
export const EXPORT_ACCEL_LADDER: ExportAccel[] = ['no-preference', 'prefer-software'];

export interface ExportDiagnostics {
  appVersion: string;
  userAgent: string;
  deviceMemoryGB: number | null;
  gpu: string; // adapter vendor/architecture/device/description, best-effort
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  hardwareAcceleration: string;
  configSupported: boolean | null;
  stoppedAtFrame: number | null;
  totalFrames: number;
  reason: string;
}

/** Join a GPUAdapterInfo-like object into one line, dropping empties. Pure. */
export function formatAdapterInfo(
  info: { vendor?: string; architecture?: string; device?: string; description?: string } | null | undefined,
): string {
  if (!info) return '';
  return [info.vendor, info.architecture, info.device, info.description]
    .filter((s) => typeof s === 'string' && s.length > 0)
    .join(' ')
    .trim();
}

/** A human-readable, copyable block for a bug report. Pure (takes a plain object). */
export function formatExportDiagnostics(d: ExportDiagnostics): string {
  const lines = [
    'FlashFX export diagnostics',
    `build:        ${d.appVersion}`,
    `browser:      ${d.userAgent}`,
    `deviceMemory: ${d.deviceMemoryGB == null ? 'unknown' : `${d.deviceMemoryGB} GB`}`,
    `gpu:          ${d.gpu || 'unknown'}`,
    `codec:        ${d.codec}`,
    `resolution:   ${d.width}x${d.height} @ ${d.framerate}fps`,
    `bitrate:      ${Math.round(d.bitrate / 1000)} kbps`,
    `hwAccel:      ${d.hardwareAcceleration}`,
    `configOK:     ${d.configSupported == null ? 'unknown' : String(d.configSupported)}`,
    `stoppedAt:    ${d.stoppedAtFrame == null ? 'n/a' : d.stoppedAtFrame} / ${d.totalFrames}`,
    `reason:       ${d.reason}`,
  ];
  return lines.join('\n');
}
