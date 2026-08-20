import { useState } from 'react';
import type { ReactNode } from 'react';
import { Coffee, Globe, Instagram, Linkedin, Youtube, Twitter, ExternalLink } from 'lucide-react';
import { Modal } from '../../ui/primitives/Modal';
import portrait from './ports.png';

interface LinkItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const PERSONAL_LINKS: LinkItem[] = [
  { label: 'Personal site', href: 'https://gabrielebolognese.blog', icon: <Globe size={13} /> },
  { label: 'Instagram', href: 'https://www.instagram.com/logs.of.gabry/', icon: <Instagram size={13} /> },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/gabriele-bolognese/', icon: <Linkedin size={13} /> },
  { label: 'X (Twitter)', href: 'https://x.com/bologabriele', icon: <Twitter size={13} /> },
  { label: 'YouTube', href: 'https://www.youtube.com/@gabriele.bolognese', icon: <Youtube size={13} /> },
];

const FLASHFX_LINKS: LinkItem[] = [
  { label: 'flashfx.app', href: 'https://flashfx.app', icon: <Globe size={13} /> },
  { label: 'Instagram', href: 'https://www.instagram.com/flashfxeditor/', icon: <Instagram size={13} /> },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/flashfx/', icon: <Linkedin size={13} /> },
];

const DONATE_URL = 'https://buymeacoffee.com/therealg';

function LinkRow({ item }: { item: LinkItem }) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 rounded-md border border-hairline bg-surface-2 px-2.5 py-2 text-caption text-secondary transition-colors duration-micro hover:border-accent-dim hover:bg-surface-3 hover:text-primary"
    >
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-surface-4 text-accent">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <ExternalLink size={11} className="flex-shrink-0 text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function LinkGroup({ title, items }: { title: string; items: LinkItem[] }) {
  return (
    <div>
      <div className="mb-1.5 text-overline uppercase text-tertiary">{title}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => <LinkRow key={item.href} item={item} />)}
      </div>
    </div>
  );
}

/**
 * A square, gradient founder button (portrait on a yellow->orange gradient) that opens a
 * modal with the portrait, a short bio, all links laid out visibly, and a donate button.
 */
export function MeetTheFounder() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative mx-auto block aspect-square w-full max-w-[150px] overflow-hidden rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 p-1.5 shadow-overlay transition hover:brightness-105"
        title="Meet the Founder"
      >
        <img src={portrait} alt="Gabriele Bolognese" className="h-full w-full rounded-lg object-cover" />
        <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 rounded-b-lg bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 text-center text-[11px] font-semibold text-white">
          Meet the Founder
        </span>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} size="sm" title="Meet the Founder">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img
                src={portrait}
                alt="Gabriele Bolognese"
                className="h-16 w-16 flex-shrink-0 rounded-full border-2 border-accent-dim object-cover"
              />
              <div className="min-w-0">
                <div className="text-title text-primary">Gabriele Bolognese</div>
                <div className="text-caption text-tertiary">Founder &amp; developer of FlashFX</div>
              </div>
            </div>

            <p className="text-body leading-relaxed text-secondary">
              I build browser-based creative tools and share the process as I go. FlashFX is my take on
              a fast, GPU-powered motion-graphics and video editor that runs entirely in the browser:
              no installs, no accounts, just open a tab and create.
            </p>

            <LinkGroup title="Personal" items={PERSONAL_LINKS} />
            <LinkGroup title="FlashFX" items={FLASHFX_LINKS} />

            <a
              href={DONATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-comfortable w-full items-center justify-center gap-1.5 rounded-md bg-accent text-body-strong text-on-accent transition-colors duration-micro hover:bg-accent-hover"
            >
              <Coffee size={15} />
              Buy me a coffee
            </a>
          </div>
        </Modal>
      )}
    </>
  );
}
