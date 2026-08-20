import type { ReactNode } from 'react';
import { Modal } from '../ui/primitives/Modal';
import { useLegalStore } from './legalStore';

const LAST_UPDATED = '20 August 2026';
const CONTACT_EMAIL = 'privacy@flashfx.app';

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 text-title text-primary first:mt-0">{children}</h3>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-body leading-relaxed text-secondary">{children}</p>;
}
function Li({ children }: { children: ReactNode }) {
  return <li className="text-body leading-relaxed text-secondary">{children}</li>;
}

function PrivacyContent() {
  return (
    <div>
      <p className="text-caption text-tertiary">Last updated: {LAST_UPDATED}</p>

      <H>The short version</H>
      <P>
        FlashFX is a browser-based video and motion-graphics editor. Your projects and media are
        stored locally on your device and are not uploaded to us. We collect a small amount of
        diagnostic data to keep the app reliable, and (only if you accept) anonymous product
        analytics to understand what to improve. There are no user accounts at this time.
      </P>

      <H>What we collect</H>
      <P>On your device (never sent to us):</P>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <Li>Your projects, imported media, settings and brand kit, stored in your browser (IndexedDB and localStorage).</Li>
        <Li>Your analytics consent choice, so we can remember it.</Li>
      </ul>
      <P>Sent to our backend to keep the service working (legitimate interest):</P>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <Li>Diagnostic / recovery logs: your browser user-agent, a project identifier, an anonymous session identifier, and error details, used to detect and fix crashes and performance problems.</Li>
        <Li>If you generate captions, the resulting transcript may be stored so it can be reloaded.</Li>
      </ul>
      <P>Only if you accept analytics:</P>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <Li>Anonymous product-usage events (for example, which features are opened and whether an export completed), to prioritise improvements.</Li>
        <Li>Crash / error reports, to fix bugs faster.</Li>
      </ul>
      <P>We do not collect payment information, and we do not sell your data or use it for advertising.</P>

      <H>Cookies and local storage</H>
      <P>
        FlashFX runs almost entirely in your browser and relies on local storage (IndexedDB and
        localStorage) to function and to remember your preferences and consent choice. We do not use
        third-party advertising or tracking cookies. Analytics are loaded only after you accept.
      </P>

      <H>Who processes your data</H>
      <P>
        When data does leave your device, it is handled by service providers acting on our behalf:
        Supabase (database and hosting for diagnostics), and, where enabled, PostHog (product
        analytics) and Sentry (error monitoring). These providers may process data in countries
        outside your own; we rely on their standard safeguards for such transfers.
      </P>

      <H>How long we keep it</H>
      <P>
        Data on your device stays until you delete it or clear your browser storage. Diagnostic logs
        and analytics are retained only as long as needed for reliability and product improvement, and
        then deleted or anonymised.
      </P>

      <H>Your choices and rights</H>
      <P>
        You can accept or decline analytics at any time through the consent banner, and you can clear
        all local data by clearing your browser storage for this site. Depending on where you live,
        you may have rights to access, correct, or delete data we hold, and to withdraw consent. To
        make a request, contact us at {CONTACT_EMAIL}.
      </P>

      <H>Children</H>
      <P>FlashFX is not directed at children under 16, and we do not knowingly collect their data.</P>

      <H>Changes</H>
      <P>
        We may update this policy as the product evolves. Material changes will be reflected here with
        a new &quot;last updated&quot; date.
      </P>

      <H>Contact</H>
      <P>Questions or requests: {CONTACT_EMAIL}.</P>
    </div>
  );
}

function TermsContent() {
  return (
    <div>
      <p className="text-caption text-tertiary">Last updated: {LAST_UPDATED}</p>

      <H>Acceptance</H>
      <P>By using FlashFX you agree to these terms. If you do not agree, please do not use the app.</P>

      <H>The service</H>
      <P>
        FlashFX is a browser-based video and motion-graphics editor, currently offered free of charge
        and under active development. Features may change, and the service is provided on an
        &quot;as is&quot; and &quot;as available&quot; basis.
      </P>

      <H>Your content</H>
      <P>
        You keep all rights to the projects and media you create or import. Your content is stored on
        your device, not on our servers. You are responsible for having the rights to any media you
        import and for how you use your exports.
      </P>

      <H>Acceptable use</H>
      <P>
        Do not use FlashFX to create or distribute unlawful, infringing, or harmful content, and do
        not attempt to disrupt, reverse-engineer, or abuse the service.
      </P>

      <H>No warranty and limitation of liability</H>
      <P>
        FlashFX is provided without warranties of any kind. Because your work is stored locally in
        your browser, please export and back up anything important: to the maximum extent permitted by
        law, we are not liable for lost work, data, or other damages arising from your use of the app.
      </P>

      <H>Intellectual property</H>
      <P>The FlashFX name, brand, and software are owned by the FlashFX operator. These terms do not grant you any rights to them.</P>

      <H>Changes and termination</H>
      <P>We may update these terms or discontinue the service at any time. Continued use after a change means you accept the updated terms.</P>

      <H>Contact</H>
      <P>Questions: {CONTACT_EMAIL}.</P>
    </div>
  );
}

export function LegalModal() {
  const doc = useLegalStore((s) => s.doc);
  const close = useLegalStore((s) => s.close);

  if (!doc) return null;

  return (
    <Modal onClose={close} size="lg" title={doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        {doc === 'privacy' ? <PrivacyContent /> : <TermsContent />}
      </div>
    </Modal>
  );
}
