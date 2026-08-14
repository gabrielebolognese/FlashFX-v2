import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * A styled container for the floating chrome — panels, menus/popovers, and the
 * dynamic island. `menu`/`island` carry the blurred material (allowed: they
 * float over STATIC content, never the live viewport); `panel` is solid.
 * Positioning stays the caller's job.
 */
export type SurfaceKind = 'panel' | 'menu' | 'island';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  kind?: SurfaceKind;
  children: ReactNode;
}

const KIND: Record<SurfaceKind, string> = {
  panel: 'rounded-lg border border-hairline bg-surface-2 shadow-top-highlight',
  menu: 'rounded-lg border border-hairline ffx-material-menu shadow-overlay',
  island: 'rounded-island border border-hairline ffx-material-island shadow-overlay',
};

export function Surface({ kind = 'panel', className, children, ...rest }: SurfaceProps) {
  return (
    <div className={cx(KIND[kind], className)} {...rest}>
      {children}
    </div>
  );
}
