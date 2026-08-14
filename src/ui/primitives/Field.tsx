import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * A labelled control row. `inline` is the dense inspector rhythm (label left,
 * control right); the default stacks an overline label above the control.
 */
export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
  inline?: boolean;
}

export function Field({ label, hint, htmlFor, className, children, inline }: FieldProps) {
  if (inline) {
    return (
      <div className={cx('flex min-h-[28px] items-center gap-2', className)}>
        {label && (
          <label htmlFor={htmlFor} className="w-24 flex-shrink-0 text-caption text-secondary">
            {label}
          </label>
        )}
        <div className="min-w-0 flex-1">{children}</div>
        {hint && <span className="flex-shrink-0 text-caption text-tertiary">{hint}</span>}
      </div>
    );
  }
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-overline uppercase text-tertiary">
          {label}
        </label>
      )}
      {children}
      {hint && <span className="text-caption text-tertiary">{hint}</span>}
    </div>
  );
}
