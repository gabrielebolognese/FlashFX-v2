import React from 'react';
import { ClipMask } from '../types/design';

function generateStarPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number
): string {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function generateLineMaskPolygon(
  mask: ClipMask,
  elementWidth: number,
  elementHeight: number
): string {
  const angleDeg = mask.lineAngle ?? 0;
  const offset = mask.lineOffset ?? 0;
  const side = mask.lineSide ?? 'above';

  const angleRad = (angleDeg * Math.PI) / 180;

  const cx = elementWidth / 2;
  const cy = elementHeight / 2;

  const perpAngleRad = angleRad - Math.PI / 2;
  const diag = Math.sqrt(elementWidth * elementWidth + elementHeight * elementHeight);

  const offsetPx = offset * diag * 0.5;

  const px = cx + offsetPx * Math.cos(perpAngleRad);
  const py = cy + offsetPx * Math.sin(perpAngleRad);

  const halfLen = diag;
  const lx1 = px + halfLen * Math.cos(angleRad);
  const ly1 = py + halfLen * Math.sin(angleRad);
  const lx2 = px - halfLen * Math.cos(angleRad);
  const ly2 = py - halfLen * Math.sin(angleRad);

  const perpDirX = Math.cos(perpAngleRad);
  const perpDirY = Math.sin(perpAngleRad);

  const pushDist = diag * 2;
  let pushX: number;
  let pushY: number;

  if (side === 'above') {
    pushX = -perpDirX * pushDist;
    pushY = -perpDirY * pushDist;
  } else {
    pushX = perpDirX * pushDist;
    pushY = perpDirY * pushDist;
  }

  const p1x = lx1 + pushX;
  const p1y = ly1 + pushY;
  const p2x = lx2 + pushX;
  const p2y = ly2 + pushY;

  return `<polygon points="${lx1},${ly1} ${lx2},${ly2} ${p2x},${p2y} ${p1x},${p1y}" fill="white"/>`;
}

function generateMaskShapeSvg(
  mask: ClipMask,
  elementWidth: number,
  elementHeight: number
): string {
  if (mask.type === 'line') {
    return generateLineMaskPolygon(mask, elementWidth, elementHeight);
  }

  const expand = mask.expand || 0;
  const mx = mask.x - expand;
  const my = mask.y - expand;
  const mw = mask.width + expand * 2;
  const mh = mask.height + expand * 2;
  const cx = mx + mw / 2;
  const cy = my + mh / 2;
  const rotation = mask.rotation || 0;
  const transform = rotation !== 0 ? ` transform="rotate(${rotation} ${cx} ${cy})"` : '';

  switch (mask.type) {
    case 'rectangle': {
      const br = Math.min(mask.borderRadius || 0, mw / 2, mh / 2);
      return `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="${br}" ry="${br}"${transform} fill="white"/>`;
    }
    case 'circle': {
      const rx = mw / 2;
      const ry = mh / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${transform} fill="white"/>`;
    }
    case 'star': {
      const points = mask.starPoints || 5;
      const innerRatio = (mask.starInnerRadius || 50) / 100;
      const outerR = Math.min(mw, mh) / 2;
      const innerR = outerR * innerRatio;
      const path = generateStarPath(cx, cy, outerR, innerR, points);
      return `<path d="${path}"${transform} fill="white"/>`;
    }
    default:
      return `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" fill="white"/>`;
  }
}

export function generateClipMaskStyle(
  masks: ClipMask[],
  elementWidth: number,
  elementHeight: number
): React.CSSProperties | null {
  const enabledMasks = masks.filter(m => m.enabled);
  if (enabledMasks.length === 0) return null;

  const svgParts: string[] = [];
  const defs: string[] = [];

  enabledMasks.forEach((mask, index) => {
    const maskId = `m${index}`;
    const filterId = `f${index}`;
    const opacity = (mask.opacity ?? 100) / 100;
    const feather = mask.feather || 0;

    let filterAttr = '';
    if (feather > 0) {
      defs.push(`<filter id="${filterId}"><feGaussianBlur stdDeviation="${feather}"/></filter>`);
      filterAttr = ` filter="url(#${filterId})"`;
    }

    const fillColor = mask.inverted ? 'white' : 'black';
    const shapeColor = mask.inverted ? 'black' : 'white';

    const shape = generateMaskShapeSvg(
      { ...mask, ...( mask.inverted ? {} : {}) },
      elementWidth,
      elementHeight
    ).replace('fill="white"', `fill="${shapeColor}"`);

    const bgRect = mask.inverted
      ? `<rect width="${elementWidth}" height="${elementHeight}" fill="${fillColor}"/>`
      : '';

    defs.push(
      `<mask id="${maskId}">` +
      (mask.inverted ? bgRect : '') +
      `<g${filterAttr} opacity="${opacity}">` +
      (mask.inverted ? '' : `<rect width="${elementWidth}" height="${elementHeight}" fill="black"/>`) +
      shape +
      `</g>` +
      `</mask>`
    );

    svgParts.push(maskId);
  });

  let compositeContent = `<rect width="${elementWidth}" height="${elementHeight}" fill="white"`;
  enabledMasks.forEach((_, index) => {
    compositeContent += ` mask="url(#m${index})"`;
  });
  compositeContent += '/>';

  if (enabledMasks.length > 1) {
    let nested = `<rect width="${elementWidth}" height="${elementHeight}" fill="white" mask="url(#m0)"/>`;
    for (let i = 1; i < enabledMasks.length; i++) {
      const compId = `comp${i}`;
      defs.push(
        `<mask id="${compId}"><g mask="url(#m${i})">${nested}</g></mask>`
      );
      nested = `<rect width="${elementWidth}" height="${elementHeight}" fill="white" mask="url(#${compId})"/>`;
    }
    compositeContent = nested;
  } else {
    compositeContent = `<rect width="${elementWidth}" height="${elementHeight}" fill="white" mask="url(#m0)"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${elementWidth}" height="${elementHeight}">` +
    `<defs>${defs.join('')}</defs>` +
    compositeContent +
    `</svg>`;

  const encoded = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return {
    WebkitMaskImage: encoded,
    maskImage: encoded,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  } as React.CSSProperties;
}
