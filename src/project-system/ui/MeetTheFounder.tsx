import { useState } from 'react';
import type { ReactNode } from 'react';
import { UserRound, ChevronDown, Coffee, Globe, Instagram, Linkedin, Youtube, Twitter, ExternalLink } from 'lucide-react';
import { Modal } from '../../ui/primitives/Modal';
import { cx } from '../../ui/primitives/cx';

interface LinkItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const PERSONAL_LINKS: LinkItem[] = [
  { label: 'Personal site', href: 'https://gabrielebolognese.blog', icon: <Globe size={14} /> },
  { label: 'Instagram', href: 'https://www.instagram.com/logs.of.gabry/', icon: <Instagram size={14} /> },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/gabriele-bolognese/', icon: <Linkedin size={14} /> },
  { label: 'X (Twitter)', href: 'https://x.com/bologabriele', icon: <Twitter size={14} /> },
  { label: 'YouTube', href: 'https://www.youtube.com/@gabriele.bolognese', icon: <Youtube size={14} /> },
];

const FLASHFX_LINKS: LinkItem[] = [
  { label: 'flashfx.app', href: 'https://flashfx.app', icon: <Globe size={14} /> },
  { label: 'Instagram', href: 'https://www.instagram.com/flashfxeditor/', icon: <Instagram size={14} /> },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/flashfx/', icon: <Linkedin size={14} /> },
];

const DONATE_URL = 'https://buymeacoffee.com/therealg';

function LinkRow({ item }: { item: LinkItem }) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-default items-center gap-2.5 rounded-md px-2.5 text-body text-secondary transition-colors duration-micro hover:bg-white/5 hover:text-primary"
    >
      <span className="text-tertiary transition-colors group-hover:text-accent">{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>
      <ExternalLink size={12} className="text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function LinkGroup({ title, items }: { title: string; items: LinkItem[] }) {
  return (
    <div>
      <div className="mb-1 px-2.5 text-overline uppercase text-tertiary">{title}</div>
      {items.map((item) => <LinkRow key={item.href} item={item} />)}
    </div>
  );
}

/**
 * "Meet the Founder" — a trigger in the Dashboard sidebar footer that opens a modal
 * with a short bio, a collapsible "Where to find me" list of all links (personal +
 * FlashFX), and a Buy-Me-a-Coffee donate button.
 */
export function MeetTheFounder() {
  const [open, setOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-[6px] text-[12px] font-medium text-slate-400 transition-colors hover:bg-[#141c28] hover:text-slate-200"
      >
        <UserRound size={13} className="text-slate-500" />
        <span className="flex-1 text-left">Meet the Founder</span>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} size="sm" icon={<UserRound size={16} />} title="Meet the Founder">
          <div className="space-y-4">
            <p className="text-body leading-relaxed text-secondary">
              Hi, I&apos;m <span className="text-primary">Gabriele Bolognese</span> — the solo founder and
              developer of FlashFX. I build browser-based creative tools and share the process as I go.
              FlashFX is my take on a fast, GPU-powered motion-graphics and video editor that runs entirely
              in the browser: no installs, no accounts, just open a tab and create.
            </p>

            {/* Where to find me — collapsed by default */}
            <div className="overflow-hidden rounded-lg border border-hairline">
              <button
                type="button"
                onClick={() => setLinksOpen((v) => !v)}
                className="flex h-comfortable w-full items-center gap-2 px-3 text-body-strong text-primary transition-colors hover:bg-white/5"
                aria-expanded={linksOpen}
              >
                <span className="flex-1 text-left">Where to find me</span>
                <ChevronDown
                  size={14}
                  className={cx('text-tertiary transition-transform duration-standard ease-out', linksOpen && 'rotate-180')}
                />
              </button>
              {linksOpen && (
                <div className="space-y-3 border-t border-hairline p-2">
                  <LinkGroup title="Personal" items={PERSONAL_LINKS} />
                  <LinkGroup title="FlashFX" items={FLASHFX_LINKS} />
                </div>
              )}
            </div>

            {/* Donate */}
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
