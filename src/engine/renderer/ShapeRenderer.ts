import type { RenderElement } from '../core/types';

export class ShapeRenderer {
  renderRectangle(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    const { x, y, width, height, fill, stroke, strokeWidth, borderRadius } = el;
    const radius = borderRadius || el.cornerRadius || 0;

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

    if (stroke && stroke !== 'transparent' && strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  renderCircle(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    const { x, y, width, height, fill, stroke, strokeWidth } = el;
    const rx = width / 2;
    const ry = height / 2;
    const cx = x + rx;
    const cy = y + ry;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    if (fill && fill !== 'transparent') {
      ctx.fillStyle = fill;
      ctx.fill();
    }

    if (stroke && stroke !== 'transparent' && strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  renderLine(ctx: CanvasRenderingContext2D, el: RenderElement): void {
    const { x, y, points, stroke, strokeWidth } = el;
    if (!points || points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(x + points[0].x, y + points[0].y);

    for (let i = 1; i < points.length; i++) {
      const pt = points[i];
      if (pt.smooth && i < points.length - 1) {
        const next = points[i + 1];
        const cpX = x + pt.x;
        const cpY = y + pt.y;
        const endX = x + (pt.x + (next?.x ?? pt.x)) / 2;
        const endY = y + (pt.y + (next?.y ?? pt.y)) / 2;
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      } else {
        ctx.lineTo(x + pt.x, y + pt.y);
      }
    }

    if (stroke && stroke !== 'transparent' && strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    if (el.arrowEnd && points.length >= 2) {
      this.renderArrow(ctx, el, points[points.length - 2], points[points.length - 1]);
    }
    if (el.arrowStart && points.length >= 2) {
      this.renderArrow(ctx, el, points[1], points[0]);
    }
  }

  private renderArrow(
    ctx: CanvasRenderingContext2D,
    el: RenderElement,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): void {
    const { x, y, stroke, strokeWidth } = el;
    const headLen = Math.max(10, (strokeWidth || 2) * 4);
    const angle = Math.atan2(
      (y + to.y) - (y + from.y),
      (x + to.x) - (x + from.x)
    );

    const tipX = x + to.x;
    const tipY = y + to.y;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - headLen * Math.cos(angle - Math.PI / 6),
      tipY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - headLen * Math.cos(angle + Math.PI / 6),
      tipY - headLen * Math.sin(angle + Math.PI / 6)
    );

    ctx.strokeStyle = stroke || '#000';
    ctx.lineWidth = strokeWidth || 2;
    ctx.stroke();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }
}
