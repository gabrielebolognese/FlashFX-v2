import type { FaceBox } from './faceMask';

// Face Blur - detection (browser). Best-effort via the Shape Detection API (window.FaceDetector), no
// model download. Returns normalized face boxes; where the API is unavailable it returns [] and the
// user adds regions manually (the tool never blocks on detection). Not runtime-testable here.

interface DomFace { boundingBox: DOMRectReadOnly }
type FaceDetectorCtor = new (o?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect(b: ImageBitmap): Promise<DomFace[]> };

export function faceDetectionAvailable(): boolean {
  return typeof (globalThis as unknown as { FaceDetector?: unknown }).FaceDetector === 'function';
}

export async function detectFaces(bitmap: ImageBitmap): Promise<FaceBox[]> {
  const FD = (globalThis as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (!FD) return [];
  try {
    const det = new FD({ fastMode: false, maxDetectedFaces: 32 });
    const faces = await det.detect(bitmap);
    return faces
      .map((f, i) => ({
        id: `face-${i}`,
        x: f.boundingBox.x / bitmap.width,
        y: f.boundingBox.y / bitmap.height,
        w: f.boundingBox.width / bitmap.width,
        h: f.boundingBox.height / bitmap.height,
        confidence: 0.9, // the Shape Detection API does not expose a score; treat detections as high
      }))
      .filter((r) => r.w > 0.005 && r.h > 0.005);
  } catch {
    return [];
  }
}
