import type { ReactNode } from 'react';
import { cx } from './cx';

/** Small status chip. Colour carries meaning; keep the accent tone rare. */
export type PillTone = 'neutral' | 'accent' | 'success' | 'danger' | 'info';

const TONE: Record<PillTone, string> = {
  neutral: 'bg-surface-3 text-secondary',
  accent: 'bg-accent-wash text-accent',
  success: 'bg-surface-3 text-success',
  danger: 'bg-surface-3 text-danger',
  info: 'bg-surface-3 text-info',
};

export interface StatusPillProps {
  tone?: PillTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function StatusPill({ tone = 'neutral', icon, children, className }: StatusPillProps) {
  return (
    <span
      className={cx(
        'inline-flex h-[20px] items-center gap-1 rounded-pill px-2 text-caption',
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
