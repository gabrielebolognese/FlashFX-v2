import type { ResolvedLottieIcon } from '../core/types';

interface LottieInstance {
  animData: any;
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  lastFrame: number;
  lastColor: string;
  width: number;
  height: number;
}

class LottieRendererEngine {
  private instances = new Map<string, LottieInstance>();
  private renderSize = 256;

  renderLottieFrame(
    layerId: string,
    lottie: ResolvedLottieIcon,
  ): OffscreenCanvas | null {
    let instance = this.instances.get(layerId);

    const w = Math.min(lottie.sourceWidth || this.renderSize, 512);
    const h = Math.min(lottie.sourceHeight || this.renderSize, 512);

    if (!instance) {
      let animData: any;
      try {
        animData = JSON.parse(lottie.jsonData);
      } catch {
        return null;
      }

      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      instance = {
        animData,
        canvas,
        ctx,
        lastFrame: -1,
        lastColor: '',
        width: w,
        height: h,
      };
      this.instances.set(layerId, instance);
    }

    if (instance.width !== w || instance.height !== h) {
      instance.canvas.width = w;
      instance.canvas.height = h;
      instance.width = w;
      instance.height = h;
      instance.lastFrame = -1;
    }

    const targetFrame = lottie.localFrame;
    if (instance.lastFrame === targetFrame && instance.lastColor === lottie.color) {
      return instance.canvas;
    }

    instance.lastFrame = targetFrame;
    instance.lastColor = lottie.color;

    const { ctx, canvas, animData } = instance;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.renderBodymovinFrame(ctx, animData, targetFrame, lottie.totalFrames, w, h, lottie.color);

    return canvas;
  }

  private renderBodymovinFrame(
    ctx: OffscreenCanvasRenderingContext2D,
    animData: any,
    frame: number,
    totalFrames: number,
    width: number,
    height: number,
    color: string,
  ) {
    const ip = animData.ip ?? 0;
    const op = animData.op ?? totalFrames;
    const animW = animData.w ?? width;
    const animH = animData.h ?? height;

    const lottieFrame = ip + (frame % Math.max(1, op - ip));

    const scaleX = width / animW;
    const scaleY = height / animH;

    ctx.save();
    ctx.scale(scaleX, scaleY);

    const layers = animData.layers;
    if (!layers || !Array.isArray(layers)) {
      ctx.restore();
      return;
    }

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      this.renderLayer(ctx, layer, lottieFrame, animW, animH, color);
    }

    ctx.restore();
  }

  private renderLayer(
    ctx: OffscreenCanvasRenderingContext2D,
    layer: any,
    frame: number,
    _w: number,
    _h: number,
    color: string,
  ) {
    const layerIp = layer.ip ?? 0;
    const layerOp = layer.op ?? Infinity;
    if (frame < layerIp || frame >= layerOp) return;

    const localFrame = frame - (layer.st ?? 0);

    ctx.save();

    const ks = layer.ks;
    if (ks) {
      const pos = this.getAnimatedValue(ks.p, localFrame);
      const scale = this.getAnimatedValue(ks.s, localFrame);
      const rotation = this.getAnimatedNumber(ks.r, localFrame);
      const anchor = this.getAnimatedValue(ks.a, localFrame);
      const opacity = this.getAnimatedNumber(ks.o, localFrame);

      if (pos) ctx.translate(pos[0] ?? 0, pos[1] ?? 0);
      if (anchor) ctx.translate(-(anchor[0] ?? 0), -(anchor[1] ?? 0));
      if (rotation) ctx.rotate((rotation * Math.PI) / 180);
      if (scale) ctx.scale((scale[0] ?? 100) / 100, (scale[1] ?? 100) / 100);
      if (opacity !== null && opacity !== undefined) {
        ctx.globalAlpha *= Math.max(0, Math.min(1, (opacity ?? 100) / 100));
      }
    }

    if (layer.ty === 4 && layer.shapes) {
      this.renderShapes(ctx, layer.shapes, localFrame, color);
    }

    ctx.restore();
  }

  private renderShapes(
    ctx: OffscreenCanvasRenderingContext2D,
    shapes: any[],
    frame: number,
    color: string,
  ) {
    let fillColor = color;
    let strokeColor = color;
    let strokeWidth = 2;
    let pathData: { vertices: number[][]; inTangents: number[][]; outTangents: number[][]; closed: boolean }[] = [];
    let opacity = 1;

    const items = [...shapes];

    for (const shape of items) {
      if (shape.ty === 'gr' && shape.it) {
        ctx.save();
        const grKs = shape.it.find((it: any) => it.ty === 'tr');
        if (grKs) {
          const pos = this.getAnimatedValue(grKs.p, frame);
          const scale = this.getAnimatedValue(grKs.s, frame);
          const rot = this.getAnimatedNumber(grKs.r, frame);
          const anchor = this.getAnimatedValue(grKs.a, frame);
          const op = this.getAnimatedNumber(grKs.o, frame);
          if (pos) ctx.translate(pos[0] ?? 0, pos[1] ?? 0);
          if (anchor) ctx.translate(-(anchor[0] ?? 0), -(anchor[1] ?? 0));
          if (rot) ctx.rotate((rot * Math.PI) / 180);
          if (scale) ctx.scale((scale[0] ?? 100) / 100, (scale[1] ?? 100) / 100);
          if (op !== null && op !== undefined) opacity = (op ?? 100) / 100;
        }
        this.renderShapes(ctx, shape.it.filter((it: any) => it.ty !== 'tr'), frame, color);
        ctx.restore();
        continue;
      }

      if (shape.ty === 'fl') {
        fillColor = color;
        const op = this.getAnimatedNumber(shape.o, frame);
        if (op !== null && op !== undefined) opacity = (op ?? 100) / 100;
      } else if (shape.ty === 'st') {
        strokeColor = color;
        const w = this.getAnimatedNumber(shape.w, frame);
        if (w !== null) strokeWidth = w;
      } else if (shape.ty === 'sh') {
        const ks = shape.ks;
        const data = this.getAnimatedPath(ks, frame);
        if (data) pathData.push(data);
      } else if (shape.ty === 'el') {
        const pos = this.getAnimatedValue(shape.p, frame) || [0, 0];
        const size = this.getAnimatedValue(shape.s, frame) || [100, 100];
        ctx.beginPath();
        ctx.ellipse(pos[0], pos[1], size[0] / 2, size[1] / 2, 0, 0, Math.PI * 2);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = fillColor;
        ctx.fill();
        if (strokeWidth > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.stroke();
        }
      } else if (shape.ty === 'rc') {
        const pos = this.getAnimatedValue(shape.p, frame) || [0, 0];
        const size = this.getAnimatedValue(shape.s, frame) || [100, 100];
        const r = this.getAnimatedNumber(shape.r, frame) ?? 0;
        const x = pos[0] - size[0] / 2;
        const y = pos[1] - size[1] / 2;
        ctx.beginPath();
        if (r > 0) {
          ctx.roundRect(x, y, size[0], size[1], r);
        } else {
          ctx.rect(x, y, size[0], size[1]);
        }
        ctx.globalAlpha = opacity;
        ctx.fillStyle = fillColor;
        ctx.fill();
        if (strokeWidth > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.stroke();
        }
      } else if (shape.ty === 'sr') {
        const pos = this.getAnimatedValue(shape.p, frame) || [0, 0];
        const or = this.getAnimatedNumber(shape.or, frame) ?? 50;
        const ir = this.getAnimatedNumber(shape.ir, frame) ?? 25;
        const pts = this.getAnimatedNumber(shape.pt, frame) ?? 5;
        this.drawStar(ctx, pos[0], pos[1], pts, or, ir);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = fillColor;
        ctx.fill();
        if (strokeWidth > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.stroke();
        }
      }
    }

    if (pathData.length > 0) {
      ctx.beginPath();
      for (const path of pathData) {
        this.tracePath(ctx, path);
      }
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fillColor;
      ctx.fill();
      if (strokeWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
      }
    }
  }

  private tracePath(
    ctx: OffscreenCanvasRenderingContext2D,
    path: { vertices: number[][]; inTangents: number[][]; outTangents: number[][]; closed: boolean },
  ) {
    const { vertices, inTangents, outTangents, closed } = path;
    if (vertices.length === 0) return;

    ctx.moveTo(vertices[0][0], vertices[0][1]);

    for (let i = 1; i < vertices.length; i++) {
      const prev = vertices[i - 1];
      const curr = vertices[i];
      const cp1x = prev[0] + (outTangents[i - 1]?.[0] ?? 0);
      const cp1y = prev[1] + (outTangents[i - 1]?.[1] ?? 0);
      const cp2x = curr[0] + (inTangents[i]?.[0] ?? 0);
      const cp2y = curr[1] + (inTangents[i]?.[1] ?? 0);

      if (cp1x === prev[0] && cp1y === prev[1] && cp2x === curr[0] && cp2y === curr[1]) {
        ctx.lineTo(curr[0], curr[1]);
      } else {
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, curr[0], curr[1]);
      }
    }

    if (closed && vertices.length > 1) {
      const last = vertices[vertices.length - 1];
      const first = vertices[0];
      const cp1x = last[0] + (outTangents[vertices.length - 1]?.[0] ?? 0);
      const cp1y = last[1] + (outTangents[vertices.length - 1]?.[1] ?? 0);
      const cp2x = first[0] + (inTangents[0]?.[0] ?? 0);
      const cp2y = first[1] + (inTangents[0]?.[1] ?? 0);

      if (cp1x === last[0] && cp1y === last[1] && cp2x === first[0] && cp2y === first[1]) {
        ctx.lineTo(first[0], first[1]);
      } else {
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, first[0], first[1]);
      }
      ctx.closePath();
    }
  }

  private drawStar(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, pts: number, or: number, ir: number) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const angle = (i * Math.PI) / pts - Math.PI / 2;
      const r = i % 2 === 0 ? or : ir;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private getAnimatedPath(ks: any, frame: number): { vertices: number[][]; inTangents: number[][]; outTangents: number[][]; closed: boolean } | null {
    if (!ks) return null;
    let data: any;

    if (ks.a === 1 && ks.k) {
      data = this.interpolateKeyframedShape(ks.k, frame);
    } else if (ks.k) {
      data = ks.k;
    } else {
      return null;
    }

    if (!data || !data.v) return null;

    return {
      vertices: data.v || [],
      inTangents: data.i || [],
      outTangents: data.o || [],
      closed: data.c ?? true,
    };
  }

  private interpolateKeyframedShape(keyframes: any[], frame: number): any {
    if (!keyframes || keyframes.length === 0) return null;

    for (let i = 0; i < keyframes.length; i++) {
      const kf = keyframes[i];
      const nextKf = keyframes[i + 1];

      if (!nextKf) return kf.s?.[0] ?? kf.e?.[0] ?? kf;
      if (frame < kf.t) return kf.s?.[0] ?? kf;
      if (frame >= kf.t && frame < nextKf.t) {
        const t = (frame - kf.t) / (nextKf.t - kf.t);
        const startShape = kf.s?.[0];
        const endShape = kf.e?.[0] ?? nextKf.s?.[0];
        if (!startShape || !endShape) return startShape || endShape;
        return this.lerpShape(startShape, endShape, t);
      }
    }

    const last = keyframes[keyframes.length - 1];
    return last.s?.[0] ?? last.e?.[0] ?? last;
  }

  private lerpShape(a: any, b: any, t: number): any {
    if (!a.v || !b.v) return t < 0.5 ? a : b;
    const len = Math.min(a.v.length, b.v.length);
    const v: number[][] = [];
    const i_arr: number[][] = [];
    const o_arr: number[][] = [];

    for (let j = 0; j < len; j++) {
      v.push([
        (a.v[j]?.[0] ?? 0) + ((b.v[j]?.[0] ?? 0) - (a.v[j]?.[0] ?? 0)) * t,
        (a.v[j]?.[1] ?? 0) + ((b.v[j]?.[1] ?? 0) - (a.v[j]?.[1] ?? 0)) * t,
      ]);
      i_arr.push([
        (a.i[j]?.[0] ?? 0) + ((b.i[j]?.[0] ?? 0) - (a.i[j]?.[0] ?? 0)) * t,
        (a.i[j]?.[1] ?? 0) + ((b.i[j]?.[1] ?? 0) - (a.i[j]?.[1] ?? 0)) * t,
      ]);
      o_arr.push([
        (a.o[j]?.[0] ?? 0) + ((b.o[j]?.[0] ?? 0) - (a.o[j]?.[0] ?? 0)) * t,
        (a.o[j]?.[1] ?? 0) + ((b.o[j]?.[1] ?? 0) - (a.o[j]?.[1] ?? 0)) * t,
      ]);
    }

    return { v, i: i_arr, o: o_arr, c: a.c ?? b.c ?? true };
  }

  private getAnimatedValue(prop: any, frame: number): number[] | null {
    if (!prop) return null;
    if (prop.a === 1 && prop.k) {
      return this.interpolateKeyframed(prop.k, frame);
    }
    if (Array.isArray(prop.k)) return prop.k;
    if (typeof prop.k === 'number') return [prop.k];
    return null;
  }

  private getAnimatedNumber(prop: any, frame: number): number | null {
    if (!prop) return null;
    if (prop.a === 1 && prop.k) {
      const val = this.interpolateKeyframed(prop.k, frame);
      return val ? val[0] : null;
    }
    if (typeof prop.k === 'number') return prop.k;
    if (Array.isArray(prop.k) && prop.k.length > 0 && typeof prop.k[0] === 'number') return prop.k[0];
    return null;
  }

  private interpolateKeyframed(keyframes: any[], frame: number): number[] | null {
    if (!keyframes || keyframes.length === 0) return null;

    for (let i = 0; i < keyframes.length; i++) {
      const kf = keyframes[i];
      const nextKf = keyframes[i + 1];

      if (!nextKf) {
        const val = kf.s ?? kf.e ?? (typeof kf === 'number' ? [kf] : null);
        return Array.isArray(val) ? val : null;
      }

      if (frame < kf.t) {
        return Array.isArray(kf.s) ? kf.s : null;
      }

      if (frame >= kf.t && frame < nextKf.t) {
        const t = (frame - kf.t) / (nextKf.t - kf.t);
        const startVal = kf.s;
        const endVal = kf.e ?? nextKf.s;
        if (!startVal || !endVal) return startVal || endVal;
        if (!Array.isArray(startVal) || !Array.isArray(endVal)) return startVal;

        return startVal.map((s: number, idx: number) => {
          const e = endVal[idx] ?? s;
          return s + (e - s) * t;
        });
      }
    }

    const last = keyframes[keyframes.length - 1];
    return Array.isArray(last.s) ? last.s : Array.isArray(last.e) ? last.e : null;
  }

  destroyInstance(layerId: string) {
    this.instances.delete(layerId);
  }

  clear() {
    this.instances.clear();
  }
}

export const lottieRendererEngine = new LottieRendererEngine();
