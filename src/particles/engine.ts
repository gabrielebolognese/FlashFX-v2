import type { EmitterConfig, Particle, ParticleSnapshot, ColorStop } from './types';

/**
 * Either 2D canvas context. The particle renderer draws into an OffscreenCanvas
 * (engine/particleRenderer.ts) while on-screen/preview callers pass a plain
 * canvas context; the two interfaces share no base type in lib.dom, but every
 * member used below (state, transform, path, fill, gradient ops) exists on both.
 */
export type Particle2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleRange(min: number, max: number, rng: () => number): number {
  return lerp(min, max, rng());
}

function sampleCurve(curve: number[], t: number): number {
  if (curve.length === 0) return 1;
  if (curve.length === 1) return curve[0];
  const idx = t * (curve.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, curve.length - 1);
  const frac = idx - lo;
  return lerp(curve[lo], curve[hi], frac);
}

function sampleColor(stops: ColorStop[], t: number): [number, number, number, number] {
  if (stops.length === 0) return [1, 1, 1, 1];
  if (stops.length === 1) return [...stops[0].color] as [number, number, number, number];
  if (t <= stops[0].t) return [...stops[0].color] as [number, number, number, number];
  if (t >= stops[stops.length - 1].t) return [...stops[stops.length - 1].color] as [number, number, number, number];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      const frac = (t - stops[i].t) / (stops[i + 1].t - stops[i].t);
      return [
        lerp(stops[i].color[0], stops[i + 1].color[0], frac),
        lerp(stops[i].color[1], stops[i + 1].color[1], frac),
        lerp(stops[i].color[2], stops[i + 1].color[2], frac),
        lerp(stops[i].color[3], stops[i + 1].color[3], frac),
      ];
    }
  }
  return [...stops[stops.length - 1].color] as [number, number, number, number];
}

function simplexNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const hash = (i: number, j: number) => {
    let h = ((i * 374761393 + j * 668265263) ^ (i * 1274126177)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296 * 2 - 1;
  };
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

export class ParticleEngine {
  private particles: Particle[] = [];
  private spawnAccum = 0;
  private totalSpawned = 0;
  private config: EmitterConfig;
  private rng: () => number;
  private baseSeed: number;
  private currentFrame = 0;
  private frameRate: number;

  private keyframes: Map<number, ParticleSnapshot> = new Map();
  private readonly KEYFRAME_INTERVAL = 15;

  constructor(config: EmitterConfig, seed: number, frameRate: number) {
    this.config = config;
    this.baseSeed = seed;
    this.frameRate = frameRate;
    this.rng = mulberry32(seed);
    this.particles = new Array(config.maxParticles);
    for (let i = 0; i < config.maxParticles; i++) {
      this.particles[i] = { x: 0, y: 0, vx: 0, vy: 0, size: 0, rotation: 0, spin: 0, age: 0, lifetime: 0, seed: 0, alive: false };
    }
  }

  updateConfig(config: EmitterConfig) {
    this.config = config;
    this.keyframes.clear();
  }

  reset() {
    this.rng = mulberry32(this.baseSeed);
    this.spawnAccum = 0;
    this.totalSpawned = 0;
    this.currentFrame = 0;
    for (const p of this.particles) p.alive = false;
    this.keyframes.clear();
  }

  seekToFrame(targetFrame: number) {
    if (targetFrame === this.currentFrame) return;

    if (targetFrame < this.currentFrame) {
      const nearestKf = Math.floor(targetFrame / this.KEYFRAME_INTERVAL) * this.KEYFRAME_INTERVAL;
      const snapshot = this.keyframes.get(nearestKf);
      if (snapshot && nearestKf <= targetFrame) {
        this.restoreSnapshot(snapshot, nearestKf);
      } else {
        this.reset();
      }
    } else {
      const nearestKf = Math.floor(targetFrame / this.KEYFRAME_INTERVAL) * this.KEYFRAME_INTERVAL;
      if (nearestKf > this.currentFrame) {
        const snapshot = this.keyframes.get(nearestKf);
        if (snapshot) {
          this.restoreSnapshot(snapshot, nearestKf);
        }
      }
    }

    while (this.currentFrame < targetFrame) {
      this.stepFrame();
    }
  }

  private saveKeyframe() {
    const snap: ParticleSnapshot = {
      particles: this.particles.map(p => ({ ...p })),
      nextSpawnAccum: this.spawnAccum,
      totalSpawned: this.totalSpawned,
    };
    this.keyframes.set(this.currentFrame, snap);
  }

  private restoreSnapshot(snap: ParticleSnapshot, frame: number) {
    for (let i = 0; i < this.particles.length; i++) {
      if (i < snap.particles.length) {
        Object.assign(this.particles[i], snap.particles[i]);
      } else {
        this.particles[i].alive = false;
      }
    }
    this.spawnAccum = snap.nextSpawnAccum;
    this.totalSpawned = snap.totalSpawned;
    this.currentFrame = frame;
    this.rng = mulberry32(this.baseSeed + frame * 7919);
  }

  stepFrame() {
    const dt = 1 / this.frameRate;
    const cfg = this.config;

    if (this.currentFrame % this.KEYFRAME_INTERVAL === 0) {
      this.saveKeyframe();
    }

    // Spawn
    if (cfg.burstCount > 0) {
      const burstFrame = 0;
      if (this.currentFrame === burstFrame || (cfg.burstRepeat && cfg.burstInterval > 0 && this.currentFrame % Math.round(cfg.burstInterval * this.frameRate) === 0)) {
        let count = cfg.burstCount;
        for (let i = 0; i < this.particles.length && count > 0; i++) {
          if (!this.particles[i].alive) {
            this.spawnParticle(this.particles[i]);
            count--;
          }
        }
      }
    }

    if (cfg.spawnRate > 0) {
      this.spawnAccum += cfg.spawnRate * dt;
      while (this.spawnAccum >= 1) {
        this.spawnAccum -= 1;
        const idx = this.findDeadParticle();
        if (idx >= 0) {
          this.spawnParticle(this.particles[idx]);
        }
      }
    }

    // Simulate
    const time = this.currentFrame * dt;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.lifetime) {
        p.alive = false;
        continue;
      }

      // Gravity
      p.vx += cfg.gravity[0] * dt;
      p.vy += cfg.gravity[1] * dt;

      // Drag
      p.vx *= (1 - cfg.drag * dt);
      p.vy *= (1 - cfg.drag * dt);

      // Turbulence
      if (cfg.turbulenceStrength > 0) {
        const scale = cfg.turbulenceScale || 0.01;
        const nx = simplexNoise2D(p.x * scale + time * 0.5, p.y * scale);
        const ny = simplexNoise2D(p.x * scale, p.y * scale + time * 0.5 + 100);
        p.vx += nx * cfg.turbulenceStrength * dt;
        p.vy += ny * cfg.turbulenceStrength * dt;
      }

      // Integrate
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
    }

    this.currentFrame++;
  }

  private spawnParticle(p: Particle) {
    const cfg = this.config;
    const rng = this.rng;

    // Position based on emitter shape
    switch (cfg.emitterShape) {
      case 'point':
        p.x = 0; p.y = 0;
        break;
      case 'circle': {
        const angle = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * cfg.emitterRadius;
        p.x = Math.cos(angle) * r;
        p.y = Math.sin(angle) * r;
        break;
      }
      case 'ring': {
        const angle = rng() * Math.PI * 2;
        p.x = Math.cos(angle) * cfg.emitterRadius;
        p.y = Math.sin(angle) * cfg.emitterRadius;
        break;
      }
      case 'rectangle':
        p.x = (rng() - 0.5) * cfg.emitterWidth;
        p.y = (rng() - 0.5) * cfg.emitterHeight;
        break;
    }

    // Velocity
    const speed = sampleRange(cfg.initialSpeed.min, cfg.initialSpeed.max, rng);
    const angleDeg = sampleRange(cfg.initialAngle.min, cfg.initialAngle.max, rng);
    const angleRad = angleDeg * Math.PI / 180;
    p.vx = Math.cos(angleRad) * speed;
    p.vy = Math.sin(angleRad) * speed;

    p.size = sampleRange(cfg.initialSize.min, cfg.initialSize.max, rng);
    p.rotation = sampleRange(cfg.initialRotation.min, cfg.initialRotation.max, rng);
    p.spin = sampleRange(cfg.spinSpeed.min, cfg.spinSpeed.max, rng);
    p.lifetime = sampleRange(cfg.lifetime.min, cfg.lifetime.max, rng);
    p.age = 0;
    p.seed = (this.totalSpawned++) & 0xFFFF;
    p.alive = true;
  }

  private findDeadParticle(): number {
    for (let i = 0; i < this.particles.length; i++) {
      if (!this.particles[i].alive) return i;
    }
    return -1;
  }

  render(ctx: Particle2DContext, width: number, height: number, offsetX: number, offsetY: number) {
    const cfg = this.config;
    ctx.clearRect(0, 0, width, height);
    ctx.save();

    if (cfg.blendMode === 'additive') {
      ctx.globalCompositeOperation = 'lighter';
    } else if (cfg.blendMode === 'screen') {
      ctx.globalCompositeOperation = 'screen';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const p of this.particles) {
      if (!p.alive) continue;
      const t = p.age / p.lifetime;
      const size = p.size * sampleCurve(cfg.sizeOverLife, t);
      const opacity = sampleCurve(cfg.opacityOverLife, t);
      if (size <= 0 || opacity <= 0) continue;

      const color = sampleColor(cfg.colorOverLife, t);
      const px = offsetX + p.x;
      const py = offsetY + p.y;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = opacity * color[3];

      const r = Math.round(color[0] * 255);
      const g = Math.round(color[1] * 255);
      const b = Math.round(color[2] * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      const hs = size / 2;
      switch (cfg.spriteShape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, hs, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'square':
          ctx.fillRect(-hs, -hs, size, size);
          break;
        case 'star':
          drawStar(ctx, hs);
          break;
        case 'spark':
          drawSpark(ctx, hs, p.vx, p.vy);
          break;
        case 'smoke':
          drawSmoke(ctx, hs, r, g, b, opacity * color[3]);
          break;
      }

      ctx.restore();
    }

    ctx.restore();
  }

  getAliveCount(): number {
    let c = 0;
    for (const p of this.particles) if (p.alive) c++;
    return c;
  }
}

function drawStar(ctx: Particle2DContext, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 72 - 90) * Math.PI / 180;
    const innerAngle = ((i * 72) + 36 - 90) * Math.PI / 180;
    const ox = Math.cos(angle) * r;
    const oy = Math.sin(angle) * r;
    const ix = Math.cos(innerAngle) * r * 0.4;
    const iy = Math.sin(innerAngle) * r * 0.4;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSpark(ctx: Particle2DContext, r: number, vx: number, vy: number) {
  const speed = Math.sqrt(vx * vx + vy * vy);
  const stretch = Math.min(speed * 0.02, 3);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * (1 + stretch), r * 0.3, Math.atan2(vy, vx), 0, Math.PI * 2);
  ctx.fill();
}

function drawSmoke(ctx: Particle2DContext, r: number, red: number, green: number, blue: number, alpha: number) {
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, `rgba(${red},${green},${blue},${alpha})`);
  grad.addColorStop(0.6, `rgba(${red},${green},${blue},${alpha * 0.4})`);
  grad.addColorStop(1, `rgba(${red},${green},${blue},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}
