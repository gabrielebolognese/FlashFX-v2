import { memo, createElement, type SVGProps } from 'react';
import type { IconData } from './types';

interface SvgIconProps {
  icon: IconData;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function attrsToReact(attrs: Record<string, string>): SVGProps<SVGElement> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    out[kebabToCamel(k)] = v;
  }
  return out as SVGProps<SVGElement>;
}

export const SvgIcon = memo(function SvgIcon({
  icon,
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  className,
}: SvgIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label={icon.name}
    >
      {icon.elements.map((el, i) =>
        createElement(el.tag, { key: i, ...attrsToReact(el.attrs) })
      )}
    </svg>
  );
});
