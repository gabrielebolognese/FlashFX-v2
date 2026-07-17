/**
 * GPUCompositor — WebGL2 video frame compositor.
 *
 * Renders video clips as textured quads onto a dedicated WebGL2 canvas
 * that overlays the artboard. Clips are composited in z-order (bottom to top).
 *
 * Each VideoFrame is uploaded to a WebGL texture, rendered, then closed
 * immediately after upload to prevent GPU memory leaks.
 *
 * Export support: captureFrame() reads the framebuffer back as RGBA pixel data.
 * This method is intended for use by a future VideoEncoder export pipeline.
 */

import type { VideoTransform } from './types';

const VERT_SRC = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_uv;

uniform mat4 u_transform;

out vec2 v_uv;

void main() {
  gl_Position = u_transform * vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_opacity;

in vec2 v_uv;
out vec4 out_color;

void main() {
  vec4 texColor = texture(u_texture, v_uv);
  // Premultiplied alpha output
  out_color = vec4(texColor.rgb * texColor.a * u_opacity, texColor.a * u_opacity);
}
`;

export interface RenderClipCommand {
  frame: VideoFrame;
  transform: VideoTransform;
  opacity: number;
  assetWidth: number;
  assetHeight: number;
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

// Column-major 4×4 identity
function identity(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

// Build a transform matrix that maps artboard-space clip rect to NDC
function buildTransformMatrix(
  transform: VideoTransform,
  assetWidth: number,
  assetHeight: number,
  canvasWidth: number,
  canvasHeight: number
): Float32Array {
  const w = assetWidth * transform.scaleX;
  const h = assetHeight * transform.scaleY;

  // Normalize to NDC: x in [-1,1], y in [-1,1] (y flipped)
  const scaleX = w / canvasWidth;
  const scaleY = h / canvasHeight;
  const transX = (transform.x / canvasWidth) * 2 - 1 + scaleX;
  const transY = -((transform.y / canvasHeight) * 2 - 1) - scaleY;
  const cosR = Math.cos(transform.rotation);
  const sinR = Math.sin(transform.rotation);

  // Scale then rotate then translate (column-major)
  return new Float32Array([
    scaleX * cosR,  scaleX * sinR, 0, 0,
    -scaleY * sinR, scaleY * cosR, 0, 0,
    0,              0,             1, 0,
    transX,         transY,        0, 1,
  ]);
}

export class GPUCompositor {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private texture: WebGLTexture;

  private uTransform: WebGLUniformLocation;
  private uOpacity: WebGLUniformLocation;

  private canvasWidth: number;
  private canvasHeight: number;

  constructor(canvas: HTMLCanvasElement, canvasWidth: number, canvasHeight: number) {
    this.canvas = canvas;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    this.program = createProgram(gl, VERT_SRC, FRAG_SRC);

    // Unit quad: positions [-1,-1] to [1,1], UVs [0,0] to [1,1]
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    const uvs = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0,
    ]);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    const uvLoc  = gl.getAttribLocation(this.program, 'a_uv');

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    this.texture = gl.createTexture()!;

    this.uTransform = gl.getUniformLocation(this.program, 'u_transform')!;
    this.uOpacity   = gl.getUniformLocation(this.program, 'u_opacity')!;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.gl.viewport(0, 0, canvasWidth, canvasHeight);
  }

  render(clips: RenderClipCommand[]): void {
    const { gl } = this;

    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (clips.length === 0) return;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    for (const cmd of clips) {
      const { frame, transform, opacity, assetWidth, assetHeight } = cmd;

      // Upload VideoFrame to texture, then close it immediately
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame as unknown as ImageData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Frame is closed after texture upload — GPU now owns the pixel data
      frame.close();

      const matrix = buildTransformMatrix(
        transform,
        assetWidth,
        assetHeight,
        this.canvasWidth,
        this.canvasHeight
      );

      gl.uniformMatrix4fv(this.uTransform, false, matrix);
      gl.uniform1f(this.uOpacity, opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  clear(): void {
    const { gl } = this;
    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Reads the current framebuffer as RGBA pixel data.
   * Intended for use by a future VideoEncoder export pipeline.
   * Called once per frame during offline export — not during live playback.
   */
  captureFrame(): Uint8ClampedArray {
    const { gl } = this;
    const pixels = new Uint8ClampedArray(this.canvasWidth * this.canvasHeight * 4);
    gl.readPixels(0, 0, this.canvasWidth, this.canvasHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }

  useIdentityTransform(): void {
    this.gl.uniformMatrix4fv(this.uTransform, false, identity());
  }

  destroy(): void {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
  }
}
