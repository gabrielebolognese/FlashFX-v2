import { Material } from '../types/material';

export class MaterialStyleGenerator {
  private animationTime: number = 0;

  setAnimationTime(time: number) {
    this.animationTime = time;
  }

  generateMaterialStyles(material: Material | undefined): React.CSSProperties {
    if (!material) return {};

    return this.getMaterialStyles(material);
  }

  private getMaterialStyles(material: Material): React.CSSProperties {
    switch (material.type) {
      case 'matte':
        return {
          background: material.color,
        };

      case 'glossy':
        const glossAngle = material.lightDirection;
        return {
          background: `linear-gradient(${glossAngle}deg,
            ${material.color} 0%,
            ${this.lightenColor(material.color, material.highlightStrength * 50)} ${50 * material.highlightPositionX}%,
            ${material.color} 100%)`,
        };

      case 'metallic':
        const bands = this.generateMetallicBands(material);
        return {
          background: `
            ${material.color},
            ${bands.join(', ')}
          `,
          backgroundBlendMode: 'overlay, overlay, overlay',
        };

      case 'glass':
        return {
          background: material.color,
          opacity: material.opacity,
          backdropFilter: `blur(${material.blurStrength}px)`,
          border: `2px solid rgba(255, 255, 255, ${material.edgeBrightness * 0.3})`,
        };

      case 'neon':
        const flickerOffset = material.flickerAmount > 0
          ? Math.sin(this.animationTime * 10) * material.flickerAmount * 0.3
          : 0;
        return {
          background: material.color,
          filter: `brightness(${material.coreBrightness + flickerOffset})`,
        };

      case 'holographic':
        const hueShift = (this.animationTime * material.hueShiftSpeed * 50) % 360;
        const holographicGradient = this.generateHolographicGradient(
          material,
          hueShift
        );
        return {
          background: holographicGradient,
          backgroundBlendMode: 'overlay',
        };

      case 'plastic':
        return {
          background: `radial-gradient(circle at 30% 30%,
            ${this.lightenColor(material.color, material.glossStrength * 30)} 0%,
            ${material.color} ${50 * material.softness}%)`,
        };

      default:
        return {};
    }
  }

  private generateMetallicBands(material: Extract<Material, { type: 'metallic' }>): string[] {
    const bands: string[] = [];
    const angle = material.bandAngle;

    for (let i = 0; i < 3; i++) {
      const position = 30 + i * 20;
      const intensity = material.reflectionIntensity * (1 - i * 0.2);
      bands.push(
        `linear-gradient(${angle}deg,
          transparent ${position - 5}%,
          rgba(255, 255, 255, ${intensity}) ${position}%,
          transparent ${position + 5}%)`
      );
    }

    return bands;
  }

  private generateHolographicGradient(
    material: Extract<Material, { type: 'holographic' }>,
    hueShift: number
  ): string {
    const colors: string[] = [];

    for (let i = 0; i <= 10; i++) {
      const stop = i * 10;
      const hue = (hueShift + i * 36) % 360;
      const sat = material.saturation * 100;
      const alpha = material.shimmerIntensity;
      colors.push(`hsla(${hue}, ${sat}%, 50%, ${alpha}) ${stop}%`);
    }

    return `linear-gradient(${material.gradientAngle}deg, ${colors.join(', ')})`;
  }

  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 255) + percent);
    const g = Math.min(255, ((num >> 8) & 255) + percent);
    const b = Math.min(255, (num & 255) + percent);

    return `rgb(${r}, ${g}, ${b})`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

export const materialStyleGenerator = new MaterialStyleGenerator();
