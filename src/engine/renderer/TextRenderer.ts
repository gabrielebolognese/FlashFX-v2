import type { RenderElement } from '../core/types';

interface MeasureEntry {
  width: number;
  lines: string[];
  lineHeight: number;
  accessCount: number;
}

export class TextRenderer {
  private measureCache: Map<string, MeasureEntry> = new Map();
  private maxCacheSize = 256;

  render(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    if (!el.text) return;

    // Fast path: "object" level (default) — render as a single unified text node.
    // This is the only active path today; no overhead is added to existing elements.
    // Segmented rendering activates only when animationTargetLevel is set to a
    // sub-object level ("line", "word", or "char") by the animation system.
    const targetLevel = el.animationTargetLevel;
    if (!targetLevel || targetLevel === 'object') {
      this.renderBlock(ctx, el);
      return;
    }

    // Segmented path: render each unit independently so per-segment transforms
    // can be applied by the animation system. When all segment transforms are at
    // identity defaults the visual output is pixel-identical to renderBlock.
    this.renderSegmented(ctx, el, targetLevel);
  }

  private buildTextGradient(
    ctx: CanvasRenderingContext2D,
    el: RenderElement
  ): CanvasGradient | null {
    const colors = el.textGradientColors;
    if (!colors || colors.length < 2) return null;
    const sorted = [...colors].sort((a, b) => a.position - b.position);
    const { x, y, width, height } = el;
    let gradient: CanvasGradient;
    if (el.textGradientType === 'radial') {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const r = Math.max(width, height) / 2;
      gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    } else {
      const angle = ((el.textGradientAngle ?? 90) * Math.PI) / 180;
      const len = Math.sqrt(width * width + height * height);
      const cx = x + width / 2;
      const cy = y + height / 2;
      gradient = ctx.createLinearGradient(
        cx - Math.cos(angle) * len / 2,
        cy - Math.sin(angle) * len / 2,
        cx + Math.cos(angle) * len / 2,
        cy + Math.sin(angle) * len / 2
      );
    }
    for (const stop of sorted) {
      gradient.addColorStop(stop.position / 100, stop.color);
    }
    return gradient;
  }

  private renderBlock(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    const { x, y, width, height, text, fill } = el;
    if (!text) return;

    const fontSize = el.fontSize || 16;
    const fontFamily = el.fontFamily || 'Inter, sans-serif';
    const fontWeight = el.fontWeight || 400;
    const fontStyle = el.fontStyle || 'normal';
    const letterSpacing = el.letterSpacing || 0;
    const lineHeightFactor = el.lineHeight || 1.5;
    const textAlign = el.textAlign || 'left';
    const verticalAlign = el.textVerticalAlign || 'top';

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    const gradientFill = el.textGradientEnabled ? this.buildTextGradient(ctx, el) : null;
    ctx.fillStyle = gradientFill ?? fill ?? '#000000';
    ctx.textBaseline = 'top';

    const lineHeightPx = fontSize * lineHeightFactor;
    const lines = text.split('\n');

    let textX = x;
    if (textAlign === 'center') {
      ctx.textAlign = 'center';
      textX = x + width / 2;
    } else if (textAlign === 'right') {
      ctx.textAlign = 'right';
      textX = x + width;
    } else {
      ctx.textAlign = 'left';
    }

    const totalTextH = lines.length * lineHeightPx;
    let startY = y;
    if (verticalAlign === 'middle') {
      startY = y + (height - totalTextH) / 2;
    } else if (verticalAlign === 'bottom') {
      startY = y + height - totalTextH;
    }

    for (let i = 0; i < lines.length; i++) {
      const lineY = startY + i * lineHeightPx;
      if (letterSpacing !== 0) {
        this.renderWithSpacing(ctx, lines[i], textX, lineY, letterSpacing);
      } else {
        ctx.fillText(lines[i], textX, lineY);
      }
    }
  }

  /**
   * Renders text as individually drawn segments positioned at their precomputed
   * layout coordinates. When all segment transforms are at identity defaults this
   * produces output that is pixel-identical to renderBlock.
   *
   * This path is inactive by default (animationTargetLevel defaults to "object").
   * It activates only when the animation system sets animationTargetLevel to
   * "line", "word", or "char" on a specific text element.
   */
  private renderSegmented(
    ctx: CanvasRenderingContext2D,
    el: RenderElement,
    level: 'line' | 'word' | 'char'
  ): void {
    const { x, y, width, height, text, fill } = el;
    if (!text) return;

    const fontSize = el.fontSize || 16;
    const fontFamily = el.fontFamily || 'Inter, sans-serif';
    const fontWeight = el.fontWeight || 400;
    const fontStyle = el.fontStyle || 'normal';
    const letterSpacing = el.letterSpacing || 0;
    const lineHeightFactor = el.lineHeight || 1.5;
    const textAlign = el.textAlign || 'left';
    const verticalAlign = el.textVerticalAlign || 'top';
    const lineHeightPx = fontSize * lineHeightFactor;

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    const segGradientFill = el.textGradientEnabled ? this.buildTextGradient(ctx, el) : null;
    ctx.fillStyle = segGradientFill ?? fill ?? '#000000';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const rawLines = text.split('\n');
    const totalTextH = rawLines.length * lineHeightPx;

    let baseY = y;
    if (verticalAlign === 'middle') baseY = y + (height - totalTextH) / 2;
    else if (verticalAlign === 'bottom') baseY = y + height - totalTextH;

    for (let li = 0; li < rawLines.length; li++) {
      const lineText = rawLines[li];
      const lineCanvasY = baseY + li * lineHeightPx;
      const lineWidth = this.measureSegmentWidth(ctx, lineText, letterSpacing);

      let lineStartX = x;
      if (textAlign === 'center') lineStartX = x + (width - lineWidth) / 2;
      else if (textAlign === 'right') lineStartX = x + width - lineWidth;

      if (level === 'line') {
        if (letterSpacing !== 0) {
          this.renderWithSpacing(ctx, lineText, lineStartX, lineCanvasY, letterSpacing);
        } else {
          ctx.fillText(lineText, lineStartX, lineCanvasY);
        }
        continue;
      }

      const wordParts = lineText.split(/(\s+)/);
      let curX = lineStartX;

      for (const part of wordParts) {
        if (part.length === 0) continue;
        const partWidth = this.measureSegmentWidth(ctx, part, letterSpacing);

        if (part.trim().length === 0) {
          curX += partWidth;
          continue;
        }

        if (level === 'word') {
          if (letterSpacing !== 0) {
            this.renderWithSpacing(ctx, part, curX, lineCanvasY, letterSpacing);
          } else {
            ctx.fillText(part, curX, lineCanvasY);
          }
          curX += partWidth;
          continue;
        }

        // char level
        for (const char of part) {
          ctx.fillText(char, curX, lineCanvasY);
          curX += ctx.measureText(char).width + letterSpacing;
        }
      }
    }
  }

  /** Measures the pixel width of a text string accounting for letter-spacing. */
  private measureSegmentWidth(
    ctx: CanvasRenderingContext2D,
    text: string,
    letterSpacing: number
  ): number {
    if (letterSpacing === 0) return ctx.measureText(text).width;
    let w = 0;
    for (const char of text) w += ctx.measureText(char).width + letterSpacing;
    return text.length > 0 ? w - letterSpacing : 0;
  }

  private renderWithSpacing(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    spacing: number
  ): void {
    let currentX = x;
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], currentX, y);
      currentX += ctx.measureText(text[i]).width + spacing;
    }
  }

  measureText(
    ctx: CanvasRenderingContext2D,
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: string | number,
    maxWidth: number
  ): { width: number; height: number; lines: string[] } {
    const cacheKey = `${text}|${fontSize}|${fontFamily}|${fontWeight}|${maxWidth}`;
    const cached = this.measureCache.get(cacheKey);
    if (cached) {
      cached.accessCount++;
      return { width: cached.width, height: cached.lines.length * cached.lineHeight, lines: cached.lines };
    }

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const lines = text.split('\n');
    let maxLine = 0;

    for (const line of lines) {
      const m = ctx.measureText(line);
      if (m.width > maxLine) maxLine = m.width;
    }

    const lineHeight = fontSize * 1.5;
    const entry: MeasureEntry = {
      width: Math.min(maxLine, maxWidth),
      lines,
      lineHeight,
      accessCount: 1,
    };

    if (this.measureCache.size >= this.maxCacheSize) {
      let minKey = '';
      let minCount = Infinity;
      for (const [k, v] of this.measureCache) {
        if (v.accessCount < minCount) {
          minCount = v.accessCount;
          minKey = k;
        }
      }
      if (minKey) this.measureCache.delete(minKey);
    }

    this.measureCache.set(cacheKey, entry);
    return { width: entry.width, height: lines.length * lineHeight, lines };
  }

  clearCache(): void {
    this.measureCache.clear();
  }
}
