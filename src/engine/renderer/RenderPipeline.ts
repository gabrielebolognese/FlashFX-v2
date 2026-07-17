import type { RenderElement, RenderFrame } from '../core/types';
import { ShapeRenderer } from './ShapeRenderer';
import { TextRenderer } from './TextRenderer';
import { ImageRenderer } from './ImageRenderer';

export interface RenderTarget {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

export class RenderPipeline {
  private shapeRenderer: ShapeRenderer;
  private textRenderer: TextRenderer;
  private imageRenderer: ImageRenderer;

  private frontBuffer: RenderTarget | null = null;
  private backBuffer: RenderTarget | null = null;
  private presentTarget: HTMLCanvasElement | null = null;
  private presentCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    this.shapeRenderer = new ShapeRenderer();
    this.textRenderer = new TextRenderer();
    this.imageRenderer = new ImageRenderer();
  }

  getImageRenderer(): ImageRenderer {
    return this.imageRenderer;
  }

  getTextRenderer(): TextRenderer {
    return this.textRenderer;
  }

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.presentTarget = canvas;
    this.presentCtx = canvas.getContext('2d', { alpha: false })!;

    this.frontBuffer = this.createBuffer(canvas.width, canvas.height);
    this.backBuffer = this.createBuffer(canvas.width, canvas.height);
  }

  private createBuffer(width: number, height: number): RenderTarget {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    return { canvas, ctx, width, height };
  }

  createOffscreen(width: number, height: number): RenderTarget {
    return this.createBuffer(width, height);
  }

  async preloadAssets(elements: RenderElement[]): Promise<void> {
    await this.imageRenderer.preloadImages(elements);
  }

  renderFrame(frame: RenderFrame, target?: RenderTarget): void {
    const t = target || this.backBuffer;
    if (!t) return;

    if (t.canvas.width !== frame.canvasWidth || t.canvas.height !== frame.canvasHeight) {
      t.canvas.width = frame.canvasWidth;
      t.canvas.height = frame.canvasHeight;
      t.width = frame.canvasWidth;
      t.height = frame.canvasHeight;
    }

    const ctx = t.ctx;
    ctx.clearRect(0, 0, t.width, t.height);

    this.renderBackground(ctx, t.width, t.height, frame.background);

    for (let i = 0; i < frame.elements.length; i++) {
      this.renderElement(ctx, frame.elements[i]);
    }

    if (!target && this.presentCtx && this.presentTarget) {
      this.present(t);
    }
  }

  private present(source: RenderTarget): void {
    if (!this.presentCtx || !this.presentTarget) return;

    if (
      this.presentTarget.width !== source.width ||
      this.presentTarget.height !== source.height
    ) {
      this.presentTarget.width = source.width;
      this.presentTarget.height = source.height;
    }

    this.presentCtx.drawImage(source.canvas, 0, 0);

    const temp = this.frontBuffer;
    this.frontBuffer = this.backBuffer;
    this.backBuffer = temp;
  }

  renderFrameToBlob(
    frame: RenderFrame,
    format: 'png' | 'jpeg' = 'png',
    quality = 0.92
  ): Promise<Blob> {
    const offscreen = this.createOffscreen(frame.canvasWidth, frame.canvasHeight);
    this.renderFrame(frame, offscreen);

    return new Promise((resolve, reject) => {
      offscreen.canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        },
        `image/${format}`,
        quality
      );
    });
  }

  renderFrameToImageData(frame: RenderFrame): ImageData {
    const offscreen = this.createOffscreen(frame.canvasWidth, frame.canvasHeight);
    this.renderFrame(frame, offscreen);
    return offscreen.ctx.getImageData(0, 0, frame.canvasWidth, frame.canvasHeight);
  }

  private renderBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    background?: RenderFrame['background']
  ): void {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (!background?.enabled) return;

    if (background.layers?.length) {
      for (const layer of background.layers) {
        ctx.globalAlpha = (layer.opacity || 100) / 100;
        ctx.globalCompositeOperation = (layer.blendMode || 'normal') as GlobalCompositeOperation;

        if (layer.type === 'solid' && layer.colorStops?.[0]) {
          ctx.fillStyle = layer.colorStops[0].color;
          ctx.fillRect(0, 0, width, height);
        } else if (layer.type === 'linear-gradient' && layer.colorStops?.length) {
          const angle = ((layer.angle || 0) * Math.PI) / 180;
          const len = Math.sqrt(width * width + height * height);
          const cx = width / 2;
          const cy = height / 2;
          const gradient = ctx.createLinearGradient(
            cx - Math.cos(angle) * len / 2,
            cy - Math.sin(angle) * len / 2,
            cx + Math.cos(angle) * len / 2,
            cy + Math.sin(angle) * len / 2
          );
          for (const stop of layer.colorStops) {
            gradient.addColorStop(stop.position, stop.color);
          }
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
        } else if (layer.type === 'radial-gradient' && layer.colorStops?.length) {
          const gradient = ctx.createRadialGradient(
            width / 2, height / 2, 0,
            width / 2, height / 2, Math.max(width, height) / 2
          );
          for (const stop of layer.colorStops) {
            gradient.addColorStop(stop.position, stop.color);
          }
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }

    if (background.type === 'solid' && background.color) {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, width, height);
    } else if (background.type === 'gradient' && background.gradient) {
      this.renderGradientBg(ctx, width, height, background.gradient);
    }
  }

  private renderGradientBg(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    grad: NonNullable<NonNullable<RenderFrame['background']>['gradient']>
  ): void {
    if (!grad.stops?.length) return;

    let gradient: CanvasGradient;

    if (grad.type === 'radial') {
      gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) / 2
      );
    } else {
      const angle = ((grad.angle || 0) * Math.PI) / 180;
      const len = Math.sqrt(width * width + height * height);
      const cx = width / 2;
      const cy = height / 2;
      gradient = ctx.createLinearGradient(
        cx - Math.cos(angle) * len / 2,
        cy - Math.sin(angle) * len / 2,
        cx + Math.cos(angle) * len / 2,
        cy + Math.sin(angle) * len / 2
      );
    }

    for (const stop of grad.stops) {
      gradient.addColorStop(stop.position, stop.color);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  private renderElement(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    if (el.visible === false) return;

    ctx.save();

    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);

    if (el.rotation) {
      ctx.rotate((el.rotation * Math.PI) / 180);
    }

    const sx = el.scaleX ?? 1;
    const sy = el.scaleY ?? 1;
    if (sx !== 1 || sy !== 1) {
      ctx.scale(sx, sy);
    }

    ctx.translate(-cx, -cy);
    ctx.globalAlpha = el.opacity ?? 1;

    if (el.blendMode) {
      ctx.globalCompositeOperation = el.blendMode as GlobalCompositeOperation;
    }

    if (el.shadow && el.shadow.blur > 0) {
      ctx.shadowBlur = el.shadow.blur;
      ctx.shadowColor = el.shadow.color;
      ctx.shadowOffsetX = el.shadow.x;
      ctx.shadowOffsetY = el.shadow.y;
    }

    switch (el.type) {
      case 'rectangle':
        this.shapeRenderer.renderRectangle(ctx, el);
        break;
      case 'circle':
        this.shapeRenderer.renderCircle(ctx, el);
        break;
      case 'line':
        this.shapeRenderer.renderLine(ctx, el);
        break;
      case 'text':
        this.textRenderer.render(ctx, el);
        break;
      case 'image':
        this.imageRenderer.render(ctx, el);
        break;
      case 'group':
        this.renderGroup(ctx, el);
        break;
    }

    if (el.innerShadow?.enabled && el.innerShadow.blur > 0 && el.type !== 'line') {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      this.renderInnerShadow(ctx, el);
    }

    ctx.restore();
  }

  private buildShapeClipPath(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    const { x, y, width, height, borderRadius } = el;
    const br = borderRadius || 0;
    ctx.beginPath();
    if (br > 0 && el.type === 'rectangle') {
      const r = Math.min(br, width / 2, height / 2);
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    } else if (el.type === 'circle') {
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.rect(x, y, width, height);
    }
  }

  private buildShapeHoleCCW(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    const { x, y, width, height, borderRadius } = el;
    const br = borderRadius || 0;
    if (br > 0 && el.type === 'rectangle') {
      const r = Math.min(br, width / 2, height / 2);
      ctx.moveTo(x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.lineTo(x, y + height - r);
      ctx.quadraticCurveTo(x, y + height, x + r, y + height);
      ctx.lineTo(x + width - r, y + height);
      ctx.quadraticCurveTo(x + width, y + height, x + width, y + height - r);
      ctx.lineTo(x + width, y + r);
      ctx.quadraticCurveTo(x + width, y, x + width - r, y);
      ctx.lineTo(x + r, y);
      ctx.closePath();
    } else if (el.type === 'circle') {
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, Math.PI * 2, 0, true);
    } else {
      ctx.rect(x + width, y, -width, height);
    }
  }

  private renderInnerShadowPass(
    ctx: CanvasRenderingContext2D,
    el: RenderElement,
    blur: number,
    color: string,
    ox: number,
    oy: number
  ): void {
    const { x, y, width, height } = el;
    const pad = blur * 3 + Math.abs(ox) + Math.abs(oy) + 30;

    ctx.save();

    this.buildShapeClipPath(ctx, el);
    ctx.clip();

    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.shadowOffsetX = ox;
    ctx.shadowOffsetY = oy;

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.rect(x - pad, y - pad, width + pad * 2, height + pad * 2);
    this.buildShapeHoleCCW(ctx, el);
    ctx.fill('evenodd');

    ctx.restore();
  }

  private renderInnerShadow(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    const is = el.innerShadow;
    if (!is || !is.enabled || is.blur <= 0) return;

    const blur = is.blur;
    const color = is.color || '#000000';
    const ox = is.x || 0;
    const oy = is.y || 0;
    const borders = is.borders || { top: true, right: true, bottom: true, left: true };

    const activeBorders: Array<'top' | 'right' | 'bottom' | 'left'> = [];
    if (borders.top) activeBorders.push('top');
    if (borders.right) activeBorders.push('right');
    if (borders.bottom) activeBorders.push('bottom');
    if (borders.left) activeBorders.push('left');

    if (activeBorders.length === 0) return;

    if (activeBorders.length === 4) {
      this.renderInnerShadowPass(ctx, el, blur, color, ox, oy);
      return;
    }

    const extraOffset = blur * 3 + 20;
    for (const border of activeBorders) {
      let soX = ox;
      let soY = oy;
      switch (border) {
        case 'top':    soY = oy + extraOffset; break;
        case 'bottom': soY = oy - extraOffset; break;
        case 'left':   soX = ox + extraOffset; break;
        case 'right':  soX = ox - extraOffset; break;
      }
      this.renderInnerShadowPass(ctx, el, blur, color, soX, soY);
    }
  }

  private renderGroup(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    if (!el.children) return;
    for (let i = 0; i < el.children.length; i++) {
      this.renderElement(ctx, el.children[i]);
    }
  }

  clearCaches(): void {
    this.imageRenderer.clearCache();
    this.textRenderer.clearCache();
  }

  destroy(): void {
    this.clearCaches();
    this.frontBuffer = null;
    this.backBuffer = null;
    this.presentTarget = null;
    this.presentCtx = null;
  }
}
