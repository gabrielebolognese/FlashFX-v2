import type { FieldSampledConfig, FieldDefinition, GlyphFieldDef, PathFieldDef } from './types';
import computeShaderSource from './shaders/field_compute.wgsl?raw';
import renderShaderSource from './shaders/field_render.wgsl?raw';

const MAX_SAMPLES = 500_000;
const SAMPLE_STRIDE = 32; // 8 floats * 4 bytes
const WORKGROUP_SIZE = 64;
const UNIFORM_SIZE = 128; // padded to 128 bytes for alignment
const RENDER_UNIFORM_SIZE = 32;

export class FieldSamplingEngine {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private canvas: OffscreenCanvas;
  private config: FieldSampledConfig;

  private computePipeline!: GPUComputePipeline;
  private renderPipeline!: GPURenderPipeline;

  private particleBuffer!: GPUBuffer;
  private uniformBuffer!: GPUBuffer;
  private renderUniformBuffer!: GPUBuffer;
  private counterBuffer!: GPUBuffer;
  private counterReadBuffer!: GPUBuffer;
  private indirectBuffer!: GPUBuffer;
  private sdfTexture!: GPUTexture;
  private sdfSampler!: GPUSampler;

  private computeBindGroup!: GPUBindGroup;
  private renderBindGroup!: GPUBindGroup;

  private uniformData: Float32Array;
  private renderUniformData: Float32Array;
  private initialized = false;

  constructor(canvas: OffscreenCanvas, config: FieldSampledConfig) {
    this.canvas = canvas;
    this.config = config;
    this.uniformData = new Float32Array(UNIFORM_SIZE / 4);
    this.renderUniformData = new Float32Array(RENDER_UNIFORM_SIZE / 4);
  }

  async initialize(): Promise<void> {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU not available');
    this.device = await adapter.requestDevice();

    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format,
      alphaMode: 'premultiplied',
    });

    this.particleBuffer = this.device.createBuffer({
      size: MAX_SAMPLES * SAMPLE_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    });

    this.uniformBuffer = this.device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.renderUniformBuffer = this.device.createBuffer({
      size: RENDER_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.counterBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    this.counterReadBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.indirectBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });

    this.sdfSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    await this.buildSDFTexture();

    const computeModule = this.device.createShaderModule({ code: computeShaderSource });
    const renderModule = this.device.createShaderModule({ code: renderShaderSource });

    const computeBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    const renderBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [computeBindGroupLayout] }),
      compute: { module: computeModule, entryPoint: 'main' },
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),
      vertex: {
        module: renderModule,
        entryPoint: 'vsMain',
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fsMain',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip', stripIndexFormat: 'uint32' },
    });

    this.computeBindGroup = this.device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sdfTexture.createView() },
        { binding: 1, resource: this.sdfSampler },
        { binding: 2, resource: { buffer: this.particleBuffer } },
        { binding: 3, resource: { buffer: this.uniformBuffer } },
        { binding: 4, resource: { buffer: this.counterBuffer } },
      ],
    });

    this.renderBindGroup = this.device.createBindGroup({
      layout: renderBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.renderUniformBuffer } },
      ],
    });

    this.initialized = true;
  }

  async updateConfig(delta: Partial<FieldSampledConfig>): Promise<void> {
    if (delta.field) {
      this.config.field = delta.field;
      await this.rebuildSDF();
    }
    if (delta.sampler) this.config.sampler = { ...this.config.sampler, ...delta.sampler };
    if (delta.mark) this.config.mark = { ...this.config.mark, ...delta.mark };
    if (delta.animation) this.config.animation = { ...this.config.animation, ...delta.animation };
    if (delta.canvasWidth !== undefined) this.config.canvasWidth = delta.canvasWidth;
    if (delta.canvasHeight !== undefined) this.config.canvasHeight = delta.canvasHeight;
  }

  renderFrame(frameNumber: number, t: number): void {
    if (!this.initialized) return;

    const w = this.config.canvasWidth || this.canvas.width;
    const h = this.config.canvasHeight || this.canvas.height;

    this.writeUniforms(t, w, h);
    this.writeRenderUniforms(w, h);

    // Reset counter
    this.device.queue.writeBuffer(this.counterBuffer, 0, new Uint32Array([0]));

    const encoder = this.device.createCommandEncoder();

    // Compute pass: generate sample points
    const dispatchCount = Math.ceil(this.estimateMaxSamples() / WORKGROUP_SIZE);
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(dispatchCount);
    computePass.end();

    // Render pass: instanced draw
    const textureView = this.context.getCurrentTexture().createView();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }],
    });
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    // Draw max possible instances; GPU discards empty ones via vertex discard
    renderPass.draw(4, Math.min(this.estimateMaxSamples(), MAX_SAMPLES));
    renderPass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  buildCommandBuffer(frameNumber: number, t: number): GPUCommandBuffer {
    if (!this.initialized) {
      const encoder = this.device.createCommandEncoder();
      return encoder.finish();
    }

    const w = this.config.canvasWidth || this.canvas.width;
    const h = this.config.canvasHeight || this.canvas.height;

    this.writeUniforms(t, w, h);
    this.writeRenderUniforms(w, h);
    this.device.queue.writeBuffer(this.counterBuffer, 0, new Uint32Array([0]));

    const encoder = this.device.createCommandEncoder();

    const dispatchCount = Math.ceil(this.estimateMaxSamples() / WORKGROUP_SIZE);
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(dispatchCount);
    computePass.end();

    const textureView = this.context.getCurrentTexture().createView();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }],
    });
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    renderPass.draw(4, Math.min(this.estimateMaxSamples(), MAX_SAMPLES));
    renderPass.end();

    return encoder.finish();
  }

  destroy(): void {
    this.particleBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.renderUniformBuffer?.destroy();
    this.counterBuffer?.destroy();
    this.counterReadBuffer?.destroy();
    this.indirectBuffer?.destroy();
    this.sdfTexture?.destroy();
    this.initialized = false;
  }

  private writeUniforms(t: number, w: number, h: number): void {
    const d = this.uniformData;
    const sampler = this.config.sampler;
    const anim = this.config.animation;

    d[0] = t;
    d[1] = t * (anim.noiseEvolution || 0.5);
    d[2] = 0; // gridDensity (unused, reserved)
    // samplerType as uint32 view
    const u32View = new Uint32Array(d.buffer);
    u32View[3] = sampler.type === 'grid' ? 0 : sampler.type === 'scanline' ? 1 : 2;
    d[4] = w;
    d[5] = h;
    d[6] = sampler.type === 'grid' ? (sampler as any).threshold : sampler.type === 'scanline' ? (sampler as any).threshold : 0.01;
    d[7] = sampler.type === 'grid' ? (sampler as any).cellSize : 8;
    d[8] = sampler.type === 'grid' ? (sampler as any).jitter : 0;
    d[9] = sampler.type === 'scanline' ? (sampler as any).lineSpacing : 4;
    d[10] = sampler.type === 'scanline' ? (sampler as any).dashMinLength : 2;
    d[11] = sampler.type === 'scanline' ? (sampler as any).dashMaxLength : 40;
    d[12] = sampler.type === 'scanline' ? (sampler as any).gapChance : 0.15;
    d[13] = sampler.type === 'scanline' ? (sampler as any).noiseBreakScale : 0.05;
    u32View[14] = sampler.type === 'scanline' && (sampler as any).noiseBreak ? 1 : 0;
    u32View[15] = sampler.type === 'scanline' && (sampler as any).direction === 'vertical' ? 1 : 0;
    d[16] = this.config.mark.sizeMin;
    d[17] = this.config.mark.sizeMax;
    u32View[18] = this.config.mark.shape === 'dot' ? 0 : this.config.mark.shape === 'dash' ? 1 : 2;
    u32View[19] = sampler.type === 'offsetBundle' ? (sampler as any).copyCount : 1;
    d[20] = sampler.type === 'offsetBundle' ? (sampler as any).offsetSpacing : 3;
    d[21] = sampler.type === 'offsetBundle' ? (sampler as any).phaseOffset : 0.02;
    // Noise field params
    const field = this.config.field;
    if (field.type === 'noise') {
      d[22] = field.scale;
      u32View[23] = field.octaves;
      d[24] = field.lacunarity;
      d[25] = field.persistence;
      d[26] = field.threshold;
      d[27] = field.timeSpeed;
      d[28] = field.seed;
    } else {
      d[22] = 0; // noiseScale=0 means no noise modulation for non-noise fields
      u32View[23] = 0;
      d[24] = 0; d[25] = 0; d[26] = 0; d[27] = 0; d[28] = 0;
    }
    d[29] = 0; // padding

    this.device.queue.writeBuffer(this.uniformBuffer, 0, d);
  }

  private writeRenderUniforms(w: number, h: number): void {
    const d = this.renderUniformData;
    const mark = this.config.mark;
    d[0] = w;
    d[1] = h;
    d[2] = mark.color[0];
    d[3] = mark.color[1];
    d[4] = mark.color[2];
    d[5] = mark.color[3];
    d[6] = mark.strokeWidth;
    const u32View = new Uint32Array(d.buffer);
    u32View[7] = mark.shape === 'dot' ? 0 : mark.shape === 'dash' ? 1 : 2;
    this.device.queue.writeBuffer(this.renderUniformBuffer, 0, d);
  }

  private estimateMaxSamples(): number {
    const sampler = this.config.sampler;
    const w = this.config.canvasWidth || 600;
    const h = this.config.canvasHeight || 800;

    switch (sampler.type) {
      case 'grid': {
        const cols = Math.ceil(w / (sampler as any).cellSize);
        const rows = Math.ceil(h / (sampler as any).cellSize);
        return Math.min(cols * rows, MAX_SAMPLES);
      }
      case 'scanline': {
        const ls = (sampler as any).lineSpacing || 4;
        const dm = (sampler as any).dashMaxLength || 40;
        const lines = Math.ceil(h / ls);
        const segsPerLine = Math.ceil(w / dm);
        return Math.min(lines * segsPerLine, MAX_SAMPLES);
      }
      case 'offsetBundle': {
        const copies = (sampler as any).copyCount || 30;
        return Math.min(copies * 80, MAX_SAMPLES);
      }
    }
  }

  private async buildSDFTexture(): Promise<void> {
    const w = this.config.canvasWidth || 600;
    const h = this.config.canvasHeight || 800;

    // Use a smaller SDF resolution for performance (1/4 res is sufficient)
    const sdfW = Math.min(w, 512);
    const sdfH = Math.min(h, 512);

    this.sdfTexture = this.device.createTexture({
      size: [sdfW, sdfH],
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const pixels = this.rasterizeFieldToPixels(sdfW, sdfH);

    this.device.queue.writeTexture(
      { texture: this.sdfTexture },
      pixels,
      { bytesPerRow: sdfW },
      { width: sdfW, height: sdfH },
    );
  }

  private async rebuildSDF(): Promise<void> {
    this.sdfTexture?.destroy();
    await this.buildSDFTexture();

    // Recreate compute bind group with new texture view
    const computeBindGroupLayout = this.computePipeline.getBindGroupLayout(0);
    this.computeBindGroup = this.device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sdfTexture.createView() },
        { binding: 1, resource: this.sdfSampler },
        { binding: 2, resource: { buffer: this.particleBuffer } },
        { binding: 3, resource: { buffer: this.uniformBuffer } },
        { binding: 4, resource: { buffer: this.counterBuffer } },
      ],
    });
  }

  private rasterizeFieldToPixels(w: number, h: number): Uint8Array {
    const field = this.config.field;
    const offscreen = new OffscreenCanvas(w, h);
    const ctx = offscreen.getContext('2d')!;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    switch (field.type) {
      case 'glyph':
        this.drawGlyph(ctx, field, w, h);
        break;
      case 'noise':
        this.drawNoiseField(ctx, w, h);
        break;
      case 'path':
        this.drawPath(ctx, field, w, h);
        break;
      case 'composite':
        // For composite: just draw the first field as primary
        if (field.fields.length > 0 && field.fields[0].type === 'glyph') {
          this.drawGlyph(ctx, field.fields[0] as GlyphFieldDef, w, h);
        }
        break;
    }

    const imageData = ctx.getImageData(0, 0, w, h);
    const output = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      output[i] = imageData.data[i * 4]; // Just red channel
    }
    return output;
  }

  private drawGlyph(ctx: OffscreenCanvasRenderingContext2D, field: GlyphFieldDef, w: number, h: number): void {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const scaledSize = field.fontSize * (w / (this.config.canvasWidth || 600));
    ctx.font = `${field.fontWeight} ${scaledSize}px "${field.fontFamily}"`;
    ctx.fillText(field.text, w / 2, h / 2);
  }

  private drawNoiseField(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): void {
    // For noise fields, fill with white (noise is computed GPU-side)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }

  private drawPath(ctx: OffscreenCanvasRenderingContext2D, field: PathFieldDef, w: number, h: number): void {
    if (field.points.length < 2) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const scaleX = w / (this.config.canvasWidth || 600);
    const scaleY = h / (this.config.canvasHeight || 800);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(field.points[0][0] * scaleX, field.points[0][1] * scaleY);
    for (let i = 1; i < field.points.length; i++) {
      ctx.lineTo(field.points[i][0] * scaleX, field.points[i][1] * scaleY);
    }
    if (field.closed) ctx.closePath();
    ctx.stroke();
  }
}
