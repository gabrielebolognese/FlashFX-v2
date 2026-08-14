import { useEffect } from 'react';
import { useAutoCaptionStore } from '../../store/autoCaption';
import { useIslandStore } from '../island/islandStore';

/**
 * Bridge (no UI of its own): mirrors the batch auto-caption state into the
 * Dynamic Island — download %/"Transcribing clip N of M…" as a determinate/
 * indeterminate progress with cancel, and failures as a sticky error. The old
 * bottom-right chip is retired; the island is the single notification hub.
 */
export function AutoCaptionProgress() {
  const active = useAutoCaptionStore((s) => s.active);
  const label = useAutoCaptionStore((s) => s.label);
  const download = useAutoCaptionStore((s) => s.download);
  const error = useAutoCaptionStore((s) => s.error);
  const cancel = useAutoCaptionStore((s) => s.cancel);

  useEffect(() => {
    const island = useIslandStore.getState();
    if (error) {
      island.error(`Auto-caption failed: ${error}`);
    } else if (active) {
      const prog = download ? Math.max(0, Math.min(1, download.progress / 100)) : null;
      island.showProgress(label || 'Auto-captioning…', prog, download ? 'download' : 'loader', cancel);
    } else if (island.mode === 'progress') {
      // Batch finished/cancelled — collapse the island (only if we own it).
      island.dismiss();
    }
  }, [active, label, download, error, cancel]);

  return null;
}
