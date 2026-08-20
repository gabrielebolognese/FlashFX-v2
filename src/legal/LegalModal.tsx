import { useEffect, useRef } from 'react';
import { Modal } from '../ui/primitives/Modal';
import { useLegalStore, type LegalDoc } from './legalStore';

// Termly-hosted legal documents (Italy). The embed script renders the policy into a
// <div name="termly-embed" data-id="…"> once it loads.
const TERMLY_IDS: Record<LegalDoc, string> = {
  privacy: '3988d8e2-6a65-4a0e-b9ed-f9d69258766b',
  return: '018911a9-2bbf-4134-b294-587fbc90fcea',
  terms: '6f1659f4-6685-4aab-a869-79fc9c08d1b6',
};

const TITLES: Record<LegalDoc, string> = {
  privacy: 'Privacy Policy',
  return: 'Return & Refund Policy',
  terms: 'Terms of Service',
};

const TERMLY_SRC = 'https://app.termly.io/embed-policy.min.js';

/**
 * Renders a Termly policy. The embed div must carry name="termly-embed" (not a valid React
 * prop on a div, so it's set via ref) + data-id. On first use the Termly script is injected
 * (it scans and renders); afterwards window.Termly.initialize() re-renders for the new id.
 */
function TermlyEmbed({ dataId }: { dataId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.setAttribute('name', 'termly-embed');
      el.setAttribute('data-id', dataId);
    }
    const w = window as unknown as { Termly?: { initialize?: () => void } };
    if (w.Termly?.initialize) {
      w.Termly.initialize();
      return;
    }
    if (document.querySelector(`script[src="${TERMLY_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = TERMLY_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, [dataId]);

  return (
    <div className="text-body text-secondary">
      <div ref={ref} />
      <noscript>Enable JavaScript to view this policy.</noscript>
    </div>
  );
}

export function LegalModal() {
  const doc = useLegalStore((s) => s.doc);
  const close = useLegalStore((s) => s.close);

  if (!doc) return null;

  return (
    <Modal onClose={close} size="lg" title={TITLES[doc]}>
      <div className="max-h-[70vh] min-h-[240px] overflow-y-auto pr-1">
        <TermlyEmbed key={doc} dataId={TERMLY_IDS[doc]} />
      </div>
    </Modal>
  );
}
