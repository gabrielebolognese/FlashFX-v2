import {
  Material,
  ShadowEffect,
  GlowEffect,
  MaterialLayer,
} from '../types/material';

export class MaterialRenderer {
  private ctx: CanvasRenderingContext2D;
  private animationTime: number = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setAnimationTime(time: number) {
    this.animationTime = time;
  }

  renderMaterialLayers(
    layers: MaterialLayer[],
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number = 0
  ) {
    layers.forEach((layer) => {
      if (!layer.enabled) return;

      this.ctx.save();

      layer.shadows.forEach((shadow) => this.renderShadow(shadow, x, y, width, height, borderRadius));

      this.renderMaterial(layer.material, x, y, width, height, borderRadius);

      layer.glows.forEach((glow) => this.renderGlow(glow, x, y, width, height, borderRadius));

      this.ctx.restore();
    });
  }

  private renderMaterial(
    material: Material,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    switch (material.type) {
      case 'matte':
        this.renderMatte(material, x, y, width, height, borderRadius);
        break;
      case 'glossy':
        this.renderGlossy(material, x, y, width, height, borderRadius);
        break;
      case 'metallic':
        this.renderMetallic(material, x, y, width, height, borderRadius);
        break;
      case 'glass':
        this.renderGlass(material, x, y, width, height, borderRadius);
        break;
      case 'neon':
        this.renderNeon(material, x, y, width, height, borderRadius);
        break;
      case 'holographic':
        this.renderHolographic(material, x, y, width, height, borderRadius);
        break;
      case 'plastic':
        this.renderPlastic(material, x, y, width, height, borderRadius);
        break;
    }
  }

  private renderMatte(
    material: Extract<Material, { type: 'matte' }>,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    this.ctx.fillStyle = material.color;
    this.ctx.globalAlpha = material.opacity;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  private renderGlossy(
    material: Extract<Material, { type: 'glossy' }>,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    this.ctx.fillStyle = material.color;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();

    const angleRad = (material.lightDirection * Math.PI) / 180;
    const gradientX1 = x + width * material.highlightPositionX;
    const gradientY1 = y + height * material.highlightPositionY;
    const gradientX2 = gradientX1 + Math.cos(angleRad) * width * 0.5;
    const gradientY2 = gradientY1 + Math.sin(angleRad) * height * 0.5;

    const gradient = this.ctx.createLinearGradient(gradientX1, gradientY1, gradientX2, gradientY2);
    const highlightAlpha = material.highlightStrength * material.glossSoftness;
    gradient.addColorStop(0, `rgba(255, 255, 255, ${highlightAlpha})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.fillStyle = gradient;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();
    this.ctx.restore();
  }

  private renderMetallic(
    material: Extract<Material, { type: 'metallic' }>,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    this.ctx.fillStyle = material.color;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();

    const angleRad = (material.lightDirection * Math.PI) / 180;
    const gradientX1 = x + width * material.highlightPositionX;
    const gradientY1 = y + height * material.highlightPositionY;
    const gradientX2 = gradientX1 + Math.cos(angleRad) * width * 0.5;
    const gradientY2 = gradientY1 + Math.sin(angleRad) * height * 0.5;

    const gradient = this.ctx.createLinearGradient(gradientX1, gradientY1, gradientX2, gradientY2);
    const highlightAlpha = material.reflectionIntensity * material.glossSoftness;

    const r = parseInt(material.reflectionColor.slice(1, 3), 16);
    const g = parseInt(material.reflectionColor.slice(3, 5), 16);
    const b = parseInt(material.reflectionColor.slice(5, 7), 16);

    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${highlightAlpha})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.fillStyle = gradient;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();
    this.ctx.restore();
  }

  private renderGlass(
    material: Extract<Material, { type: 'glass' }>,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    this.ctx.fillStyle = material.color;
    this.ctx.globalAlpha = material.opacity;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;

    const edgeGradient = this.ctx.createLinearGradient(x, y, x + width, y + height);
    edgeGradient.addColorStop(0, `rgba(255, 255, 255, ${material.edgeBrightness})`);
    edgeGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    edgeGradient.addColorStop(1, `rgba(255, 255, 255, ${material.edgeBrightness * 0.5})`);

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.strokeStyle = edgeGradient;
    this.ctx.lineWidth = 2;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private renderNeon(
    material: Extract<Material, { type: 'neon' }>,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    const flickerOffset = material.flickerAmount > 0
      ? Math.sin(this.animationTime * 10) * material.flickerAmount * 0.3
      : 0;

    this.ctx.save();
    this.ctx.shadowColor = material.color;
    this.ctx.shadowBlur = material.glowRadius;
    this.ctx.globalAlpha = Math.min(1, material.glowIntensity + flickerOffset);
    this.ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 3; i++) {
      this.ctx.fillStyle = material.color;
      this.drawRoundedRect(x, y, width, height, borderRadius);
      this.ctx.fill();
    }

    this.ctx.restore();

    const coreColor = material.color;
    const r = parseInt(coreColor.slice(1, 3), 16);
    const g = parseInt(coreColor.slice(3, 5), 16);
    const b = parseInt(coreColor.slice(5, 7), 16);

    const whiteMix = material.flickerAmount;
    const finalR = Math.round(r + (255 - r) * whiteMix);
    const finalG = Math.round(g + (255 - g) * whiteMix);
    const finalB = Math.round(b + (255 - b) * whiteMix);

    this.ctx.fillStyle = `rgb(${finalR}, ${finalG}, ${finalB})`;
    this.ctx.globalAlpha = material.coreBrightness;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  private renderHolographic(
    material: Extract<Material, { type: 'holographic' }>,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    this.ctx.fillStyle = material.baseColor;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();

    const hueShift = (this.animationTime * material.hueShiftSpeed * 50) % 360;
    const angleRad = ((material.gradientAngle + hueShift * 0.5) * Math.PI) / 180;

    const x1 = x + width * 0.5 + Math.cos(angleRad) * width * 0.5;
    const y1 = y + height * 0.5 + Math.sin(angleRad) * height * 0.5;
    const x2 = x + width * 0.5 - Math.cos(angleRad) * width * 0.5;
    const y2 = y + height * 0.5 - Math.sin(angleRad) * height * 0.5;

    const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);

    for (let i = 0; i <= 10; i++) {
      const stop = i / 10;
      const hue = (hueShift + i * 36) % 360;
      const sat = material.saturation * 100;
      gradient.addColorStop(stop, `hsla(${hue}, ${sat}%, 50%, ${material.shimmerIntensity})`);
    }

    this.ctx.save();
    this.ctx.globalAlpha = material.shimmerIntensity;
    this.ctx.fillStyle = gradient;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();
    this.ctx.restore();
  }

  private renderPlastic(
    material: Extract<Material, { type: 'plastic' }>,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    this.ctx.fillStyle = material.color;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();

    const angleRad = (material.lightAngle * Math.PI) / 180;
    const x1 = x + width * 0.3;
    const y1 = y + height * 0.3;
    const x2 = x1 + Math.cos(angleRad) * width * 0.4;
    const y2 = y1 + Math.sin(angleRad) * height * 0.4;

    const gradient = this.ctx.createRadialGradient(x1, y1, 0, x1, y1, width * 0.5);
    const alpha = material.glossStrength * material.softness * 0.3;
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'overlay';
    this.ctx.fillStyle = gradient;
    this.drawRoundedRect(x, y, width, height, borderRadius);
    this.ctx.fill();
    this.ctx.restore();
  }

  private renderShadow(
    shadow: ShadowEffect,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    switch (shadow.type) {
      case 'drop':
        this.ctx.save();
        this.ctx.shadowColor = shadow.color;
        this.ctx.shadowBlur = shadow.blur;
        this.ctx.shadowOffsetX = shadow.offsetX;
        this.ctx.shadowOffsetY = shadow.offsetY;
        this.ctx.globalAlpha = shadow.opacity;
        this.ctx.fillStyle = 'black';
        this.drawRoundedRect(x, y, width, height, borderRadius);
        this.ctx.fill();
        this.ctx.restore();
        break;
    }
  }

  private renderGlow(
    glow: GlowEffect,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius: number
  ) {
    switch (glow.type) {
      case 'outer':
        this.ctx.save();
        this.ctx.shadowColor = glow.color;
        this.ctx.shadowBlur = glow.radius;
        this.ctx.globalAlpha = glow.intensity;
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.fillStyle = glow.color;
        this.drawRoundedRect(x, y, width, height, borderRadius);
        this.ctx.fill();
        this.ctx.restore();
        break;
    }
  }

  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number) {
    if (radius === 0) {
      this.ctx.beginPath();
      this.ctx.rect(x, y, width, height);
      return;
    }

    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  private applyNoise(x: number, y: number, width: number, height: number, amount: number, borderRadius: number) {
    const imageData = this.ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * amount * 255;
      data[i] += noise;
      data[i + 1] += noise;
      data[i + 2] += noise;
    }

    this.ctx.putImageData(imageData, x, y);
  }
}
