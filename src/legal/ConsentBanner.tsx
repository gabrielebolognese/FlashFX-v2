import { Button } from '../ui/primitives/Button';
import { useConsentStore } from './consentStore';
import { useLegalStore } from './legalStore';

/**
 * Opt-in analytics consent banner. Shows once until the user chooses; analytics stay off
 * until "Accept". Solid surface (no blur — it can float over the live viewport).
 */
export function ConsentBanner() {
  const status = useConsentStore((s) => s.status);
  const grant = useConsentStore((s) => s.grant);
  const deny = useConsentStore((s) => s.deny);
  const openLegal = useLegalStore((s) => s.open);

  if (status !== 'unknown') return null;

  return (
    <div className="fixed bottom-3 left-1/2 z-overlay w-[min(92vw,560px)] -translate-x-1/2 rounded-lg border border-hairline bg-surface-2 p-3.5 shadow-overlay">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-caption leading-relaxed text-secondary">
          FlashFX uses privacy-friendly analytics to understand what to improve. Your projects and
          media stay on your device. See our{' '}
          <button
            type="button"
            onClick={() => openLegal('privacy')}
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Privacy Policy
          </button>
          .
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="secondary" size="compact" onClick={deny}>Decline</Button>
          <Button variant="primary" size="compact" onClick={grant}>Accept</Button>
        </div>
      </div>
    </div>
  );
}
