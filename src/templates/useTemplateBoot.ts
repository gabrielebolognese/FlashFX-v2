import { useEffect, useState } from 'react';
import { readTemplateFromUrl, clearTemplateParam } from './boot';
import { launchTemplate } from './launch';

// Module-level guard so a deep link creates exactly one project even under React StrictMode's
// double-invoked effects (and any accidental re-mount).
let launchStarted = false;

/**
 * If the app was opened with a valid `?template=` deep link, create + seed the project and report
 * `booting` so the shell can show a splash instead of flashing the dashboard. No param → no-op.
 */
export function useTemplateBoot(): boolean {
  const [booting, setBooting] = useState<boolean>(() => readTemplateFromUrl() !== null);

  useEffect(() => {
    if (launchStarted) return;
    const id = readTemplateFromUrl();
    if (!id) {
      setBooting(false);
      return;
    }
    launchStarted = true;
    clearTemplateParam(); // strip immediately so a refresh doesn't re-fire
    (async () => {
      try {
        await launchTemplate(id);
      } catch (err) {
        console.error('[template] boot failed', err);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  return booting;
}
