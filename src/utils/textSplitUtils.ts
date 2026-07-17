import { DesignElement, TextSegment, TextAnimatorLayer, createIdentityTransform } from '../types/design';
import { getEasingFunction } from '../animation-engine/interpolation';
import { v4 as uuidv4 } from 'uuid';

export interface TextUnit {
  text: string;
  x: number;
  y: number;
  index: number;
}

export function measureText(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  letterSpacing: number = 0
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  return metrics.width + (text.length - 1) * letterSpacing;
}

export function splitTextIntoUnits(
  element: DesignElement,
  mode: 'line' | 'word' | 'character'
): TextUnit[] {
  const text = element.text || '';
  const fontSize = element.fontSize || 16;
  const fontFamily = element.fontFamily || 'Inter';
  const fontWeight = element.fontWeight || '400';
  const letterSpacing = element.letterSpacing || 0;
  const lineHeight = element.lineHeight || 1.2;
  const textAlign = element.textAlign || 'left';

  const units: TextUnit[] = [];
  let currentX = element.x;
  let currentY = element.y;

  if (mode === 'line') {
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const lineWidth = measureText(line, fontSize, fontFamily, fontWeight, letterSpacing);
      let lineX = element.x;

      if (textAlign === 'center') {
        lineX = element.x + (element.width - lineWidth) / 2;
      } else if (textAlign === 'right') {
        lineX = element.x + element.width - lineWidth;
      }

      units.push({
        text: line,
        x: lineX,
        y: element.y + index * fontSize * lineHeight,
        index
      });
    });
  } else if (mode === 'word') {
    const lines = text.split('\n');
    let wordIndex = 0;

    lines.forEach((line, lineIndex) => {
      const words = line.split(/(\s+)/);
      const lineY = element.y + lineIndex * fontSize * lineHeight;

      const totalLineWidth = measureText(line, fontSize, fontFamily, fontWeight, letterSpacing);
      let lineStartX = element.x;

      if (textAlign === 'center') {
        lineStartX = element.x + (element.width - totalLineWidth) / 2;
      } else if (textAlign === 'right') {
        lineStartX = element.x + element.width - totalLineWidth;
      }

      let currentLineX = lineStartX;

      words.forEach((word) => {
        if (word.trim().length > 0) {
          const wordWidth = measureText(word, fontSize, fontFamily, fontWeight, letterSpacing);
          units.push({
            text: word,
            x: currentLineX,
            y: lineY,
            index: wordIndex++
          });
          currentLineX += wordWidth;
        } else {
          const spaceWidth = measureText(word, fontSize, fontFamily, fontWeight, letterSpacing);
          currentLineX += spaceWidth;
        }
      });
    });
  } else if (mode === 'character') {
    const lines = text.split('\n');
    let charIndex = 0;

    lines.forEach((line, lineIndex) => {
      const lineY = element.y + lineIndex * fontSize * lineHeight;
      const totalLineWidth = measureText(line, fontSize, fontFamily, fontWeight, letterSpacing);
      let lineStartX = element.x;

      if (textAlign === 'center') {
        lineStartX = element.x + (element.width - totalLineWidth) / 2;
      } else if (textAlign === 'right') {
        lineStartX = element.x + element.width - totalLineWidth;
      }

      let currentLineX = lineStartX;

      for (const char of line) {
        const charWidth = measureText(char, fontSize, fontFamily, fontWeight, letterSpacing);
        units.push({
          text: char,
          x: currentLineX,
          y: lineY,
          index: charIndex++
        });
        currentLineX += charWidth;
      }
    });
  }

  return units;
}

export function createTextElementFromUnit(
  originalElement: DesignElement,
  unit: TextUnit,
  index: number
): DesignElement {
  const unitWidth = measureText(
    unit.text,
    originalElement.fontSize || 16,
    originalElement.fontFamily || 'Inter',
    originalElement.fontWeight || '400',
    originalElement.letterSpacing || 0
  );

  const newElement: DesignElement = {
    ...originalElement,
    id: uuidv4(),
    name: `${originalElement.name} [${index + 1}]`,
    text: unit.text,
    x: unit.x,
    y: unit.y,
    width: unitWidth,
    height: originalElement.fontSize || 16,
    textAnimationMode: 'whole',
    textAnimationStaggerDelay: undefined
  };

  return newElement;
}

/**
 * Builds a flat array of TextSegment objects from a text element's content.
 *
 * The returned array contains all three hierarchy levels (line, word, char)
 * interleaved in document order. Each segment has:
 * - A stable deterministic ID derived from its position in the hierarchy
 * - Precomputed layout offsets relative to the element's top-left corner
 * - An identity transform (no visual effect until the animation system writes to it)
 * - An empty style override (inherits everything from element base style)
 *
 * This function is intentionally pure — it creates a new DOM canvas for
 * measurement and never mutates the element. The caller is responsible for
 * caching the result on TextObject._segmentCache.
 *
 * Guard: only call this when animationTargetLevel !== "object" or when
 * masking/stagger are active. For "object" mode skip segmentation entirely.
 */
export function buildTextSegments(element: DesignElement): TextSegment[] {
  const content = element.text || '';
  const fontSize = element.fontSize || 16;
  const fontFamily = element.fontFamily || 'Inter';
  const fontWeight = element.fontWeight || '400';
  const letterSpacing = element.letterSpacing || 0;
  const lineHeightFactor = element.lineHeight || 1.5;
  const textAlign = element.textAlign || 'left';
  const lineHeightPx = fontSize * lineHeightFactor;

  const segments: TextSegment[] = [];
  const rawLines = content.split('\n');

  rawLines.forEach((lineText, lineIndex) => {
    const lineWidth = measureText(lineText, fontSize, fontFamily, fontWeight, letterSpacing);

    let lineLayoutX = 0;
    if (textAlign === 'center') {
      lineLayoutX = (element.width - lineWidth) / 2;
    } else if (textAlign === 'right') {
      lineLayoutX = element.width - lineWidth;
    }

    const lineLayoutY = lineIndex * lineHeightPx;
    const lineId = `line-${lineIndex}`;

    segments.push({
      id: lineId,
      type: 'line',
      parentId: null,
      text: lineText,
      index: lineIndex,
      style: {},
      transform: createIdentityTransform(),
      visibility: 1,
      layoutX: lineLayoutX,
      layoutY: lineLayoutY,
      layoutWidth: lineWidth,
      layoutHeight: lineHeightPx,
    });

    const wordParts = lineText.split(/(\s+)/);
    let wordIndex = 0;
    let wordLayoutX = lineLayoutX;

    wordParts.forEach((part) => {
      const partWidth = measureText(part, fontSize, fontFamily, fontWeight, letterSpacing);

      if (part.trim().length === 0) {
        wordLayoutX += partWidth;
        return;
      }

      const wordId = `word-${lineIndex}-${wordIndex}`;

      segments.push({
        id: wordId,
        type: 'word',
        parentId: lineId,
        text: part,
        index: wordIndex,
        style: {},
        transform: createIdentityTransform(),
        visibility: 1,
        layoutX: wordLayoutX,
        layoutY: lineLayoutY,
        layoutWidth: partWidth,
        layoutHeight: lineHeightPx,
      });

      let charLayoutX = wordLayoutX;

      for (let charIdx = 0; charIdx < part.length; charIdx++) {
        const char = part[charIdx];
        const charWidth = measureText(char, fontSize, fontFamily, fontWeight, letterSpacing);

        segments.push({
          id: `char-${lineIndex}-${wordIndex}-${charIdx}`,
          type: 'char',
          parentId: wordId,
          text: char,
          index: charIdx,
          style: {},
          transform: createIdentityTransform(),
          visibility: 1,
          layoutX: charLayoutX,
          layoutY: lineLayoutY,
          layoutWidth: charWidth,
          layoutHeight: lineHeightPx,
        });

        charLayoutX += charWidth;
      }

      wordLayoutX += partWidth;
      wordIndex++;
    });
  });

  return segments;
}

// ─── Text Animator Contribution System ──────────────────────────────────────
// Computes the additive transform contribution of all TextAnimatorLayers for
// each segment at the current playhead time. Runs inside the render pipeline
// and is cached per-layer to avoid redundant stagger recomputation.

export interface TextSegmentContribution {
  opacity: number;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  skewY: number;
  blur: number;
  maskWidth: number;
  maskHeight: number;
}

export function identityContribution(): TextSegmentContribution {
  return { opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, blur: 0, maskWidth: 1, maskHeight: 1 };
}

const _staggerCache = new Map<string, number[]>();

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 16777619)) >>> 0;
  }
  return h;
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function getStaggerOffsets(
  layerId: string,
  stagger: number,
  direction: TextAnimatorLayer['direction'],
  count: number,
  seed: number
): number[] {
  const key = `${layerId}:${stagger}:${direction}:${count}:${seed}`;
  const cached = _staggerCache.get(key);
  if (cached) return cached;

  const offsets = new Array<number>(count);
  if (direction === 'forward') {
    for (let i = 0; i < count; i++) offsets[i] = i * stagger;
  } else if (direction === 'reverse') {
    for (let i = 0; i < count; i++) offsets[i] = (count - 1 - i) * stagger;
  } else if (direction === 'center') {
    const center = Math.floor(count / 2);
    for (let i = 0; i < count; i++) offsets[i] = Math.abs(i - center) * stagger;
  } else {
    const indices = Array.from({ length: count }, (_, i) => i);
    const rng = seededRandom(seed);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const orderMap = new Array<number>(count);
    indices.forEach((segIdx, order) => { orderMap[segIdx] = order; });
    for (let i = 0; i < count; i++) offsets[i] = orderMap[i] * stagger;
  }

  _staggerCache.set(key, offsets);
  return offsets;
}

/**
 * Computes the additive TextAnimator contribution for every segment at `currentTime`.
 * Returns a Map from segment ID → TextSegmentContribution.
 * Only segments present in the `segments` array will have entries.
 * Segments not targeted by any layer get identity contributions.
 */
export function computeTextAnimatorContributions(
  segments: TextSegment[],
  layers: TextAnimatorLayer[],
  currentTime: number,
  elementId: string,
  elementText: string
): Map<string, TextSegmentContribution> {
  const result = new Map<string, TextSegmentContribution>();
  for (const seg of segments) {
    result.set(seg.id, identityContribution());
  }

  const levelMap: Record<TextAnimatorLayer['targetType'], TextSegment['type']> = {
    characters: 'char',
    words: 'word',
    lines: 'line',
  };

  for (const layer of layers) {
    const segType = levelMap[layer.targetType];
    const targetSegs = segments.filter(s => s.type === segType);
    const count = targetSegs.length;
    if (count === 0) continue;

    const seed = simpleHash(elementId + layer.id + elementText);
    const staggerOffsets = getStaggerOffsets(layer.id, layer.stagger, layer.direction, count, seed);

    for (let i = 0; i < count; i++) {
      const seg = targetSegs[i];
      const effectiveStart = layer.startTime + staggerOffsets[i];
      const rawProgress = layer.duration > 0
        ? (currentTime - effectiveStart) / layer.duration
        : currentTime >= effectiveStart ? 1 : 0;
      const progress = Math.max(0, Math.min(1, rawProgress));
      const easedProgress = getEasingFunction(layer.easing)(progress);

      const c = result.get(seg.id)!;

      switch (layer.property) {
        case 'opacity':
          c.opacity *= layer.amount + (1 - layer.amount) * easedProgress;
          break;
        case 'position': {
          const offset = layer.amount * (1 - easedProgress);
          if (layer.axis === 'x') c.translateX += offset;
          else c.translateY += offset;
          break;
        }
        case 'scale': {
          const factor = layer.amount + (1 - layer.amount) * easedProgress;
          if (layer.axis === 'x') { c.scaleX *= factor; }
          else if (layer.axis === 'y') { c.scaleY *= factor; }
          else { c.scaleX *= factor; c.scaleY *= factor; }
          break;
        }
        case 'rotation':
          c.rotation += layer.amount * (1 - easedProgress);
          break;
        case 'skew': {
          const offset = layer.amount * (1 - easedProgress);
          if (layer.axis === 'x') c.skewX += offset;
          else c.skewY += offset;
          break;
        }
        case 'blur':
          c.blur += Math.max(0, layer.amount * (1 - easedProgress));
          break;
        case 'maskWidth':
          c.maskWidth = Math.min(c.maskWidth, layer.amount + (1 - layer.amount) * easedProgress);
          break;
        case 'maskHeight':
          c.maskHeight = Math.min(c.maskHeight, layer.amount + (1 - layer.amount) * easedProgress);
          break;
      }
    }
  }

  return result;
}
