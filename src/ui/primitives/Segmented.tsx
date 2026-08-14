import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * Segmented control / preset picker. The active cell is a NEUTRAL surface step
 * (not gold) — selection colour is reserved for real selection. Replaces the
 * ad-hoc "row of toggle buttons" every modal hand-rolls.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'compact' | 'default';
  block?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
  block,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cx(
        'inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-1 p-1',
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 rounded-sm transition-colors duration-micro ease-out',
              size === 'compact' ? 'h-[22px] px-2 text-caption' : 'h-[26px] px-2.5 text-body',
              block && 'flex-1',
              active
                ? 'bg-surface-4 text-primary shadow-top-highlight'
                : 'text-secondary hover:bg-white/5 hover:text-primary',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
