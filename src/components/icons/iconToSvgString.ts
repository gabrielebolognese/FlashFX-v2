import type { IconData } from './types';

interface IconToSvgOptions {
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  size?: number;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function elementsToSvgChildren(icon: IconData): string {
  return icon.elements
    .map((el) => {
      const attrs = Object.entries(el.attrs)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ');
      return `<${el.tag}${attrs ? ' ' + attrs : ''}/>`;
    })
    .join('');
}

export function iconToSvgString(icon: IconData, options: IconToSvgOptions = {}): string {
  const {
    strokeColor = 'currentColor',
    fillColor = 'none',
    strokeWidth = 2,
    size = 24,
  } = options;

  const children = elementsToSvgChildren(icon);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="${icon.viewBox}" fill="${fillColor}" stroke="${strokeColor}" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    `${children}` +
    `</svg>`
  );
}

export function iconToInnerSvg(icon: IconData): string {
  return elementsToSvgChildren(icon);
}
