import { Modal } from '../ui/primitives/Modal';
import { useLegalStore, type LegalDoc } from './legalStore';

// Termly-hosted legal documents (Italy). Each policy is rendered in an ISOLATED iframe: a fresh
// document on every open means the Termly embed script loads and renders reliably, avoiding the
// single-page-app re-init problem of injecting the script into the live DOM (where a policy opened a
// second time, or a second policy, would not re-render).
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

function TermlyEmbed({ dataId }: { dataId: string }) {
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}body{padding:14px;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;background:#fff}</style></head><body><div name="termly-embed" data-id="${dataId}"></div><script src="${TERMLY_SRC}"></script></body></html>`;
  return (
    <iframe
      title="Policy"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="w-full h-[68vh] rounded-md border border-hairline bg-white"
    />
  );
}

export function LegalModal() {
  const doc = useLegalStore((s) => s.doc);
  const close = useLegalStore((s) => s.close);

  if (!doc) return null;

  return (
    <Modal onClose={close} size="lg" title={TITLES[doc]}>
      <TermlyEmbed key={doc} dataId={TERMLY_IDS[doc]} />
    </Modal>
  );
}
