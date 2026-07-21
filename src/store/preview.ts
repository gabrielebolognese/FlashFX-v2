import { create } from 'zustand';

export type PreviewQuality = 'full' | 'half' | 'third' | 'quarter';

export const PREVIEW_QUALITY_SCALES: Record<PreviewQuality, number> = {
  full: 1,
  half: 0.5,
  third: 1 / 3,
  quarter: 0.25,
};

export const PREVIEW_QUALITY_LABELS: Record<PreviewQuality, string> = {
  full: 'Full',
  half: 'Half',
  third: 'Third',
  quarter: 'Quarter',
};

export const PREVIEW_QUALITY_ORDER: PreviewQuality[] = ['full', 'half', 'third', 'quarter'];

interface PreviewState {
  quality: PreviewQuality;
  transparencyGrid: boolean;
  globalMotionBlur: boolean;
  pixelPreview: boolean;
  regionOfInterest: boolean;
  fastDraft: boolean;
  /** Skip layer effects (shadow/glow/blur) in the interactive preview only. */
  disableEffects: boolean;

  setQuality: (q: PreviewQuality) => void;
  toggleTransparencyGrid: () => void;
  toggleGlobalMotionBlur: () => void;
  togglePixelPreview: () => void;
  toggleRegionOfInterest: () => void;
  toggleFastDraft: () => void;
  toggleDisableEffects: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  quality: 'full',
  transparencyGrid: false,
  globalMotionBlur: false,
  pixelPreview: false,
  regionOfInterest: false,
  fastDraft: false,
  disableEffects: false,

  setQuality: (quality) => set({ quality }),
  toggleTransparencyGrid: () => set((s) => ({ transparencyGrid: !s.transparencyGrid })),
  toggleGlobalMotionBlur: () => set((s) => ({ globalMotionBlur: !s.globalMotionBlur })),
  togglePixelPreview: () => set((s) => ({ pixelPreview: !s.pixelPreview })),
  toggleRegionOfInterest: () => set((s) => ({ regionOfInterest: !s.regionOfInterest })),
  toggleFastDraft: () => set((s) => ({ fastDraft: !s.fastDraft })),
  toggleDisableEffects: () => set((s) => ({ disableEffects: !s.disableEffects })),
}));

export function getQualityScale(quality: PreviewQuality): number {
  return PREVIEW_QUALITY_SCALES[quality];
}

// Directional motion-blur sample counts, scaled with preview quality:
// Draft (low res) trades samples for speed; Full preview matches export.
const MOTION_BLUR_SAMPLES: Record<PreviewQuality, number> = {
  full: 16,
  half: 8,
  third: 4,
  quarter: 4,
};

export function getMotionBlurSamples(quality: PreviewQuality): number {
  return MOTION_BLUR_SAMPLES[quality];
}

// Sample count used by the export renderer — always the high-quality path so
// that exported frames match the full-quality preview.
export const EXPORT_MOTION_BLUR_SAMPLES = 16;
