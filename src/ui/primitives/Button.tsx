import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * The one button. `primary` is the single accent action per view; everything
 * else is neutral/ghost so the gold stays rare. Heights lock to the 3 control
 * sizes. See docs/PREMIUM-UI-SYSTEM.md.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'compact' | 'default' | 'comfortable';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-primary border border-hairline hover:bg-surface-3',
  ghost: 'bg-transparent text-secondary hover:bg-white/5 hover:text-primary',
  danger: 'bg-danger text-white hover:brightness-110',
};

const SIZE: Record<ButtonSize, string> = {
  compact: 'h-compact px-2 text-caption gap-1',
  default: 'h-default px-2.5 text-body gap-1.5',
  comfortable: 'h-comfortable px-3.5 text-body-strong gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (e.g. a lucide element). */
  icon?: ReactNode;
  /** Stretch to fill the container width. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'default', icon, block, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cx(
        'inline-flex select-none items-center justify-center rounded-md',
        'transition-colors duration-micro ease-out',
        'disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:shadow-focus',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
