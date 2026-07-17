import { DesignElement } from '../types/design';
import { BackgroundConfig } from '../types/background';
import { ElementAnimation } from '../animation-engine/types';
import { TimelineEngine } from '../engine/core/TimelineEngine';
import { animationsToEngineClips } from '../engine/ReactBridge';

export interface RenderConfig {
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  format: 'mp4' | 'png-sequence';
  quality: number;
}

export interface RenderProgress {
  status: 'idle' | 'preloading' | 'rendering' | 'encoding' | 'completed' | 'error';
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  estimatedTimeRemaining: number;
  message: string;
  startTime: number | null;
}

interface ImageCache {
  [key: string]: HTMLImageElement;
}

export class DeterministicRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageCache: ImageCache = {};
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private engine: TimelineEngine | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d')!;
  }

  prepareEngine(
    animations: Record<string, ElementAnimation>,
    fps: number,
    duration: number
  ): void {
    if (this.engine) {
      this.engine.destroy();
    }
    this.engine = new TimelineEngine({ fps, duration, loop: false });
    const clips = animationsToEngineClips(animations);
    this.engine.loadClipsFromAnimations(clips);
  }

  private getEngine(): TimelineEngine {
    if (!this.engine) {
      this.engine = new TimelineEngine({ fps: 30, duration: 60, loop: false });
    }
    return this.engine;
  }

  private async preloadImages(elements: DesignElement[]): Promise<void> {
    const imageElements = elements.filter(el => el.type === 'image' && el.imageData);

    const loadPromises = imageElements.map(async (el) => {
      if (this.imageCache[el.id]) return;

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = el.imageData!;
      });

      this.imageCache[el.id] = img;
    });

    await Promise.all(loadPromises);
  }

  computeAnimatedProperties(
    element: DesignElement,
    animation: ElementAnimation | undefined,
    time: number
  ): DesignElement {
    if (!animation || animation.muted) {
      return element;
    }

    const engine = this.getEngine();
    const resolved = engine.getStateAtTime(time);
    const props = resolved.get(element.id);
    if (!props) return element;

    const animatedProps: Partial<DesignElement> = {};
    for (const key of Object.keys(props)) {
      const val = props[key];
      if (val === undefined || key === '_pooled') continue;
      switch (key) {
        case 'x': animatedProps.x = val as number; break;
        case 'y': animatedProps.y = val as number; break;
        case 'width': animatedProps.width = val as number; break;
        case 'height': animatedProps.height = val as number; break;
        case 'rotation': animatedProps.rotation = val as number; break;
        case 'opacity': animatedProps.opacity = val as number; break;
        case 'fill': animatedProps.fill = val as string; break;
        case 'stroke': animatedProps.stroke = val as string; break;
        case 'strokeWidth': animatedProps.strokeWidth = val as number; break;
        case 'borderRadius': animatedProps.borderRadius = val as number; break;
        case 'shadowBlur':
          animatedProps.shadow = { ...element.shadow, blur: val as number };
          break;
        case 'shadowX':
          animatedProps.shadow = { ...(animatedProps.shadow || element.shadow), x: val as number };
          break;
        case 'shadowY':
          animatedProps.shadow = { ...(animatedProps.shadow || element.shadow), y: val as number };
          break;
        case 'fontSize': animatedProps.fontSize = val as number; break;
        case 'letterSpacing': animatedProps.letterSpacing = val as number; break;
      }
    }

    return { ...element, ...animatedProps };
  }

  private renderBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    background?: BackgroundConfig
  ): void {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (!background?.enabled || !background.layers?.length) return;

    for (const layer of background.layers) {
      ctx.globalAlpha = (layer.opacity || 100) / 100;
      ctx.globalCompositeOperation = layer.blendMode || 'normal';

      if (layer.type === 'solid' && layer.colorStops?.[0]) {
        ctx.fillStyle = layer.colorStops[0].color;
        ctx.fillRect(0, 0, width, height);
      } else if (layer.type === 'linear-gradient' && layer.colorStops?.length) {
        const angle = (layer.angle || 0) * Math.PI / 180;
        const centerX = width / 2;
        const centerY = height / 2;
        const length = Math.sqrt(width * width + height * height);

        const x1 = centerX - Math.cos(angle) * length / 2;
        const y1 = centerY - Math.sin(angle) * length / 2;
        const x2 = centerX + Math.cos(angle) * length / 2;
        const y2 = centerY + Math.sin(angle) * length / 2;

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        layer.colorStops.forEach(stop => {
          gradient.addColorStop(stop.position, stop.color);
        });

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      } else if (layer.type === 'radial-gradient' && layer.colorStops?.length) {
        const gradient = ctx.createRadialGradient(
          width / 2, height / 2, 0,
          width / 2, height / 2, Math.max(width, height) / 2
        );

        layer.colorStops.forEach(stop => {
          gradient.addColorStop(stop.position, stop.color);
        });

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private renderElement(ctx: CanvasRenderingContext2D, element: DesignElement): void {
    if (!element.visible) return;

    ctx.save();

    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;

    ctx.translate(centerX, centerY);
    ctx.rotate((element.rotation || 0) * Math.PI / 180);
    ctx.translate(-centerX, -centerY);

    ctx.globalAlpha = element.opacity ?? 1;

    if (element.blendMode) {
      ctx.globalCompositeOperation = element.blendMode as GlobalCompositeOperation;
    }

    if (element.shadow && element.shadow.blur > 0) {
      ctx.shadowBlur = element.shadow.blur;
      ctx.shadowColor = element.shadow.color;
      ctx.shadowOffsetX = element.shadow.x;
      ctx.shadowOffsetY = element.shadow.y;
    }

    switch (element.type) {
      case 'rectangle':
        this.renderRectangle(ctx, element);
        break;
      case 'circle':
        this.renderCircle(ctx, element);
        break;
      case 'text':
        this.renderText(ctx, element);
        break;
      case 'line':
        this.renderLine(ctx, element);
        break;
      case 'image':
        this.renderImage(ctx, element);
        break;
      case 'group':
        this.renderGroup(ctx, element);
        break;
    }

    ctx.restore();
  }

  private renderRectangle(ctx: CanvasRenderingContext2D, element: DesignElement): void {
    const { x, y, width, height, fill, stroke, strokeWidth, borderRadius } = element;
    const radius = borderRadius || 0;

    ctx.beginPath();
    if (radius > 0) {
      this.roundRect(ctx, x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }

    if (fill && fill !== 'transparent') {
      ctx.fillStyle = fill;
      ctx.fill();
    }

    if (stroke && stroke !== 'transparent' && strokeWidth && strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  private renderCircle(ctx: CanvasRenderingContext2D, element: DesignElement): void {
    const { x, y, width, height, fill, stroke, strokeWidth } = element;
    const radiusX = width / 2;
    const radiusY = height / 2;
    const centerX = x + radiusX;
    const centerY = y + radiusY;

    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);

    if (fill && fill !== 'transparent') {
      ctx.fillStyle = fill;
      ctx.fill();
    }

    if (stroke && stroke !== 'transparent' && strokeWidth && strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  private renderText(ctx: CanvasRenderingContext2D, element: DesignElement): void {
    const {
      x, y, width, height,
      text, fontSize, fontFamily, fontWeight, fontStyle,
      fill, textAlign, textVerticalAlign, lineHeight,
      letterSpacing
    } = element;

    if (!text) return;

    const size = fontSize || 16;
    const family = fontFamily || 'Inter, sans-serif';
    const weight = fontWeight || 400;
    const style = fontStyle || 'normal';

    ctx.font = `${style} ${weight} ${size}px ${family}`;
    ctx.fillStyle = fill || '#000000';
    ctx.textBaseline = 'top';

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

    const lines = text.split('\n');
    const lineHeightPx = size * (lineHeight || 1.5);

    let startY = y;
    if (textVerticalAlign === 'middle') {
      const totalHeight = lines.length * lineHeightPx;
      startY = y + (height - totalHeight) / 2;
    } else if (textVerticalAlign === 'bottom') {
      const totalHeight = lines.length * lineHeightPx;
      startY = y + height - totalHeight;
    }

    lines.forEach((line, index) => {
      if (letterSpacing && letterSpacing !== 0) {
        this.renderTextWithLetterSpacing(ctx, line, textX, startY + index * lineHeightPx, letterSpacing);
      } else {
        ctx.fillText(line, textX, startY + index * lineHeightPx);
      }
    });
  }

  private renderTextWithLetterSpacing(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    spacing: number
  ): void {
    let currentX = x;
    for (const char of text) {
      ctx.fillText(char, currentX, y);
      currentX += ctx.measureText(char).width + spacing;
    }
  }

  private renderLine(ctx: CanvasRenderingContext2D, element: DesignElement): void {
    const { x, y, points, stroke, strokeWidth } = element;

    if (!points || points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(x + points[0].x, y + points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(x + points[i].x, y + points[i].y);
    }

    if (stroke && stroke !== 'transparent' && strokeWidth && strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  private renderImage(ctx: CanvasRenderingContext2D, element: DesignElement): void {
    const { x, y, width, height, borderRadius } = element;
    const img = this.imageCache[element.id];

    if (!img) return;

    if (borderRadius && borderRadius > 0) {
      ctx.save();
      ctx.beginPath();
      this.roundRect(ctx, x, y, width, height, borderRadius);
      ctx.clip();
      ctx.drawImage(img, x, y, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, y, width, height);
    }
  }

  private renderGroup(ctx: CanvasRenderingContext2D, element: DesignElement): void {
    if (!element.children) return;

    for (const child of element.children) {
      this.renderElement(ctx, child);
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  renderFrame(
    elements: DesignElement[],
    animations: Record<string, ElementAnimation>,
    time: number,
    width: number,
    height: number,
    background?: BackgroundConfig
  ): ImageData {
    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx.clearRect(0, 0, width, height);

    this.renderBackground(this.ctx, width, height, background);

    const engine = this.getEngine();
    const resolved = engine.getStateAtTime(time);

    for (const element of elements) {
      const props = resolved.get(element.id);
      let animatedElement = element;
      if (props) {
        animatedElement = this.computeAnimatedProperties(element, animations[element.id], time);
      }
      this.renderElement(this.ctx, animatedElement);
    }

    return this.ctx.getImageData(0, 0, width, height);
  }

  async renderFrameToBlob(
    elements: DesignElement[],
    animations: Record<string, ElementAnimation>,
    time: number,
    width: number,
    height: number,
    background?: BackgroundConfig,
    format: 'png' | 'jpeg' = 'png',
    quality: number = 0.92
  ): Promise<Blob> {
    this.renderFrame(elements, animations, time, width, height, background);

    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        `image/${format}`,
        quality
      );
    });
  }

  async renderSequence(
    config: RenderConfig,
    elements: DesignElement[],
    animations: Record<string, ElementAnimation>,
    background?: BackgroundConfig,
    onProgress?: (progress: RenderProgress) => void
  ): Promise<Blob[]> {
    const totalFrames = Math.ceil(config.duration * config.frameRate);
    const frames: Blob[] = [];
    const startTime = Date.now();

    const updateProgress = (
      status: RenderProgress['status'],
      currentFrame: number,
      message: string
    ) => {
      if (!onProgress) return;

      const elapsed = (Date.now() - startTime) / 1000;
      const framesPerSecond = currentFrame > 0 ? currentFrame / elapsed : 0;
      const remainingFrames = totalFrames - currentFrame;
      const estimatedTimeRemaining = framesPerSecond > 0
        ? remainingFrames / framesPerSecond
        : 0;

      onProgress({
        status,
        currentFrame,
        totalFrames,
        percentage: Math.round((currentFrame / totalFrames) * 100),
        estimatedTimeRemaining,
        message,
        startTime,
      });
    };

    updateProgress('preloading', 0, 'Loading images...');
    await this.preloadImages(elements);

    this.prepareEngine(animations, config.frameRate, config.duration);

    updateProgress('rendering', 0, 'Starting render...');

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const time = frameIndex / config.frameRate;

      const frameBlob = await this.renderFrameToBlob(
        elements,
        animations,
        time,
        config.width,
        config.height,
        background,
        'png',
        config.quality
      );

      frames.push(frameBlob);

      updateProgress(
        'rendering',
        frameIndex + 1,
        `Rendering frame ${frameIndex + 1} of ${totalFrames}`
      );

      if (frameIndex % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    updateProgress('completed', totalFrames, 'Render complete!');

    return frames;
  }

  cleanup(): void {
    this.imageCache = {};
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
  }
}

export const deterministicRenderer = new DeterministicRenderer();
