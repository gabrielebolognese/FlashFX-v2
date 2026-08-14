import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';

/**
 * The modal shell every dialog reinvents: a dimmed scrim (blur is allowed here
 * — it floats over static content), a tokenized panel, a header with title +
 * close, and an optional footer action bar. Escape / scrim-click close unless
 * `dismissable` is false (e.g. while a job runs).
 */
export interface ModalProps {
  open?: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  dismissable?: boolean;
  /** Extra classes for the panel (e.g. a wider max-width). */
  className?: string;
}

const SIZE = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' } as const;

export function Modal({
  open = true,
  onClose,
  title,
  icon,
  children,
  footer,
  size = 'md',
  dismissable = true,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
      />
      <div
        className={cx(
          'relative w-full overflow-hidden rounded-xl border border-hairline bg-surface-2 shadow-modal',
          SIZE[size],
          className,
        )}
      >
        {(title || dismissable) && (
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {icon && <span className="flex-shrink-0 text-accent">{icon}</span>}
              {title && <h2 className="truncate text-title text-primary">{title}</h2>}
            </div>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                className="text-tertiary transition-colors hover:text-primary"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-1 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
