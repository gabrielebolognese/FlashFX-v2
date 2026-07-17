import { ImageFilters } from '../types/design';
import { normalizeFilterValue } from './imageFilters';

export class WebGLFilterProcessor {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement;
  private programs: Map<string, WebGLProgram> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();
  private framebuffers: WebGLFramebuffer[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    try {
      this.gl = this.canvas.getContext('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });

      if (!this.gl) {
        console.warn('WebGL2 not supported, falling back to Canvas 2D');
      }
    } catch (e) {
      console.error('Failed to initialize WebGL:', e);
    }
  }

  public isSupported(): boolean {
    return this.gl !== null;
  }

  public applyFilters(
    imageData: string,
    filters: ImageFilters,
    width: number,
    height: number
  ): Promise<string> {
    if (!this.gl) {
      return this.fallbackToCanvas2D(imageData, filters, width, height);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          this.canvas.width = width;
          this.canvas.height = height;

          const result = this.processFilters(img, filters);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageData;
    });
  }

  private processFilters(image: HTMLImageElement, filters: ImageFilters): string {
    if (!this.gl) throw new Error('WebGL not initialized');

    const gl = this.gl;

    // Upload image to texture
    const inputTexture = this.createTexture(image);
    if (!inputTexture) throw new Error('Failed to create texture');

    // Create frame buffers for multi-pass rendering
    let fb1 = gl.createFramebuffer();
    let fb2 = gl.createFramebuffer();
    if (!fb1 || !fb2) throw new Error('Failed to create framebuffers');

    this.framebuffers.push(fb1, fb2);

    // Create output texture
    const texture1 = this.createEmptyTexture(image.width, image.height);
    const texture2 = this.createEmptyTexture(image.width, image.height);

    if (!texture1 || !texture2) throw new Error('Failed to create output textures');

    // Set up vertex buffer
    this.setupQuad();

    // Apply filters in sequence
    let currentInput = inputTexture;
    let currentOutput = texture1;
    let currentFB = fb1;
    let flip = false;

    // Chroma Key (applied first on original pixel colors)
    if (filters.chromaKeyEnabled) {
      this.applyChromaKey(currentInput, currentOutput, currentFB, filters);
      flip = !flip;
      [currentInput, currentOutput] = [currentOutput, currentInput];
      [currentFB, fb1, fb2] = flip ? [fb2, fb2, fb1] : [fb1, fb1, fb2];
    }

    // Basic adjustments
    if (this.hasBasicAdjustments(filters)) {
      this.applyBasicAdjustments(currentInput, currentOutput, currentFB, filters);
      flip = !flip;
      [currentInput, currentOutput] = [currentOutput, currentInput];
      [currentFB, fb1, fb2] = flip ? [fb2, fb2, fb1] : [fb1, fb1, fb2];
    }

    // Color adjustments
    if (this.hasColorAdjustments(filters)) {
      this.applyColorAdjustments(currentInput, currentOutput, currentFB, filters);
      flip = !flip;
      [currentInput, currentOutput] = [currentOutput, currentInput];
      [currentFB, fb1, fb2] = flip ? [fb2, fb2, fb1] : [fb1, fb1, fb2];
    }

    // Blur effects
    if (filters.gaussianBlur > 0) {
      this.applyGaussianBlur(currentInput, currentOutput, currentFB, filters.gaussianBlur, image.width, image.height);
      flip = !flip;
      [currentInput, currentOutput] = [currentOutput, currentInput];
      [currentFB, fb1, fb2] = flip ? [fb2, fb2, fb1] : [fb1, fb1, fb2];
    }

    // Draw final result to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.drawTexture(currentInput);

    // Clean up
    this.cleanup();

    // Return canvas as data URL
    return this.canvas.toDataURL('image/png');
  }

  private hasBasicAdjustments(filters: ImageFilters): boolean {
    return (
      filters.brightness !== 0 ||
      filters.contrast !== 0 ||
      filters.exposure !== 0 ||
      filters.gamma !== 1.0 ||
      filters.saturation !== 0 ||
      filters.vibrance !== 0
    );
  }

  private hasColorAdjustments(filters: ImageFilters): boolean {
    return (
      filters.hue !== 0 ||
      filters.lightness !== 0 ||
      filters.temperature !== 0 ||
      filters.tint !== 0 ||
      filters.sepia > 0 ||
      filters.grayscale > 0 ||
      filters.invert
    );
  }

  private applyBasicAdjustments(
    input: WebGLTexture,
    output: WebGLTexture,
    framebuffer: WebGLFramebuffer,
    filters: ImageFilters
  ): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.getOrCreateProgram('basic', this.basicAdjustmentShader());
    if (!program) return;

    gl.useProgram(program);

    // Bind output framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);

    // Set uniforms
    const brightnessLoc = gl.getUniformLocation(program, 'u_brightness');
    const contrastLoc = gl.getUniformLocation(program, 'u_contrast');
    const exposureLoc = gl.getUniformLocation(program, 'u_exposure');
    const gammaLoc = gl.getUniformLocation(program, 'u_gamma');
    const saturationLoc = gl.getUniformLocation(program, 'u_saturation');
    const vibranceLoc = gl.getUniformLocation(program, 'u_vibrance');

    gl.uniform1f(brightnessLoc, normalizeFilterValue(filters.brightness, -100, 100, -0.5, 0.5));
    gl.uniform1f(contrastLoc, normalizeFilterValue(filters.contrast, -100, 100, 0.5, 1.5));
    gl.uniform1f(exposureLoc, normalizeFilterValue(filters.exposure, -100, 100, 0.5, 2.0));
    gl.uniform1f(gammaLoc, filters.gamma);
    gl.uniform1f(saturationLoc, normalizeFilterValue(filters.saturation, -100, 100, 0, 2));
    gl.uniform1f(vibranceLoc, normalizeFilterValue(filters.vibrance, -100, 100, -0.5, 0.5));

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private applyColorAdjustments(
    input: WebGLTexture,
    output: WebGLTexture,
    framebuffer: WebGLFramebuffer,
    filters: ImageFilters
  ): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.getOrCreateProgram('color', this.colorAdjustmentShader());
    if (!program) return;

    gl.useProgram(program);

    // Bind output framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);

    // Set uniforms
    gl.uniform1f(gl.getUniformLocation(program, 'u_hue'), filters.hue / 360.0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_lightness'), normalizeFilterValue(filters.lightness, -100, 100, -0.5, 0.5));
    gl.uniform1f(gl.getUniformLocation(program, 'u_temperature'), normalizeFilterValue(filters.temperature, -100, 100, -0.3, 0.3));
    gl.uniform1f(gl.getUniformLocation(program, 'u_tint'), normalizeFilterValue(filters.tint, -100, 100, -0.3, 0.3));
    gl.uniform1f(gl.getUniformLocation(program, 'u_sepia'), filters.sepia / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_grayscale'), filters.grayscale / 100.0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_invert'), filters.invert ? 1 : 0);

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private applyGaussianBlur(
    input: WebGLTexture,
    output: WebGLTexture,
    framebuffer: WebGLFramebuffer,
    amount: number,
    width: number,
    height: number
  ): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.getOrCreateProgram('blur', this.blurShader());
    if (!program) return;

    gl.useProgram(program);

    // Bind output framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);

    // Set uniforms
    const radius = (amount / 100) * 20; // Max radius of 20 pixels
    gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), radius);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private applyChromaKey(
    input: WebGLTexture,
    output: WebGLTexture,
    framebuffer: WebGLFramebuffer,
    filters: ImageFilters
  ): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.getOrCreateProgram('chromaKey', this.chromaKeyShader());
    if (!program) return;

    gl.useProgram(program);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);

    const hex = filters.chromaKeyColor.replace('#', '');
    const kr = parseInt(hex.slice(0, 2), 16) / 255;
    const kg = parseInt(hex.slice(2, 4), 16) / 255;
    const kb = parseInt(hex.slice(4, 6), 16) / 255;

    gl.uniform3f(gl.getUniformLocation(program, 'u_keyColor'), kr, kg, kb);
    gl.uniform1f(gl.getUniformLocation(program, 'u_similarity'), filters.chromaKeySimilarity / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_smoothness'), filters.chromaKeyEdgeSmoothness / 100.0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_spill'), filters.chromaKeySpillReduction / 100.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private chromaKeyShader(): { vertex: string; fragment: string } {
    const vertex = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragment = `#version 300 es
      precision highp float;

      in vec2 v_texCoord;
      out vec4 outColor;

      uniform sampler2D u_texture;
      uniform vec3 u_keyColor;
      uniform float u_similarity;
      uniform float u_smoothness;
      uniform float u_spill;

      vec3 rgbToYcbcr(vec3 rgb) {
        float y  =  0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        float cb = -0.168736 * rgb.r - 0.331264 * rgb.g + 0.5 * rgb.b + 0.5;
        float cr =  0.5 * rgb.r - 0.418688 * rgb.g - 0.081312 * rgb.b + 0.5;
        return vec3(y, cb, cr);
      }

      void main() {
        vec4 color = texture(u_texture, v_texCoord);

        vec3 ycbcrPixel = rgbToYcbcr(color.rgb);
        vec3 ycbcrKey   = rgbToYcbcr(u_keyColor);

        // Chroma distance uses only Cb/Cr — ignores luminance
        float dcb = ycbcrPixel.y - ycbcrKey.y;
        float dcr = ycbcrPixel.z - ycbcrKey.z;
        float chromaDist = sqrt(dcb * dcb + dcr * dcr);

        // Similarity defines the hard removal zone
        // Smoothness defines the feather zone around the edge
        float hardEdge = u_similarity * 0.5;
        float softEdge = hardEdge + u_smoothness * 0.15;

        float alpha = smoothstep(hardEdge, softEdge, chromaDist);

        // Spill suppression: remove key color tint from semi-transparent pixels
        if (u_spill > 0.0 && alpha < 1.0) {
          float spillFactor = (1.0 - alpha) * u_spill;
          vec3 keyYcbcr = ycbcrKey;
          // Desaturate toward key chroma proportionally
          float y = ycbcrPixel.x;
          float cb = mix(ycbcrPixel.y, 0.5, spillFactor);
          float cr = mix(ycbcrPixel.z, 0.5, spillFactor);
          // Convert back to RGB
          float r = y + 1.402 * (cr - 0.5);
          float g = y - 0.344136 * (cb - 0.5) - 0.714136 * (cr - 0.5);
          float b = y + 1.772 * (cb - 0.5);
          color.rgb = clamp(vec3(r, g, b), 0.0, 1.0);
        }

        outColor = vec4(color.rgb, color.a * alpha);
      }
    `;

    return { vertex, fragment };
  }

  private basicAdjustmentShader(): { vertex: string; fragment: string } {
    const vertex = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragment = `#version 300 es
      precision highp float;

      in vec2 v_texCoord;
      out vec4 outColor;

      uniform sampler2D u_texture;
      uniform float u_brightness;
      uniform float u_contrast;
      uniform float u_exposure;
      uniform float u_gamma;
      uniform float u_saturation;
      uniform float u_vibrance;

      vec3 adjustSaturation(vec3 color, float saturation) {
        float gray = dot(color, vec3(0.299, 0.587, 0.114));
        return mix(vec3(gray), color, saturation);
      }

      void main() {
        vec4 color = texture(u_texture, v_texCoord);

        // Brightness
        color.rgb += u_brightness;

        // Contrast
        color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

        // Exposure
        color.rgb *= u_exposure;

        // Gamma
        color.rgb = pow(color.rgb, vec3(1.0 / u_gamma));

        // Saturation
        color.rgb = adjustSaturation(color.rgb, u_saturation);

        // Vibrance (affects less saturated colors more)
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        float sat = max(max(color.r, color.g), color.b) - min(min(color.r, color.g), color.b);
        float vibranceMask = 1.0 - sat;
        color.rgb = mix(color.rgb, adjustSaturation(color.rgb, 1.0 + u_vibrance), vibranceMask);

        outColor = clamp(color, 0.0, 1.0);
      }
    `;

    return { vertex, fragment };
  }

  private colorAdjustmentShader(): { vertex: string; fragment: string } {
    const vertex = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragment = `#version 300 es
      precision highp float;

      in vec2 v_texCoord;
      out vec4 outColor;

      uniform sampler2D u_texture;
      uniform float u_hue;
      uniform float u_lightness;
      uniform float u_temperature;
      uniform float u_tint;
      uniform float u_sepia;
      uniform float u_grayscale;
      uniform int u_invert;

      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        vec4 color = texture(u_texture, v_texCoord);

        // Hue shift
        if (u_hue != 0.0) {
          vec3 hsv = rgb2hsv(color.rgb);
          hsv.x = fract(hsv.x + u_hue);
          color.rgb = hsv2rgb(hsv);
        }

        // Lightness
        color.rgb += u_lightness;

        // Temperature (add warmth/coolness)
        color.r += u_temperature;
        color.b -= u_temperature;

        // Tint (add green/magenta)
        color.g += u_tint;

        // Grayscale
        if (u_grayscale > 0.0) {
          float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
          color.rgb = mix(color.rgb, vec3(gray), u_grayscale);
        }

        // Sepia
        if (u_sepia > 0.0) {
          vec3 sepia = vec3(
            dot(color.rgb, vec3(0.393, 0.769, 0.189)),
            dot(color.rgb, vec3(0.349, 0.686, 0.168)),
            dot(color.rgb, vec3(0.272, 0.534, 0.131))
          );
          color.rgb = mix(color.rgb, sepia, u_sepia);
        }

        // Invert
        if (u_invert == 1) {
          color.rgb = 1.0 - color.rgb;
        }

        outColor = clamp(color, 0.0, 1.0);
      }
    `;

    return { vertex, fragment };
  }

  private blurShader(): { vertex: string; fragment: string } {
    const vertex = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragment = `#version 300 es
      precision highp float;

      in vec2 v_texCoord;
      out vec4 outColor;

      uniform sampler2D u_texture;
      uniform float u_radius;
      uniform vec2 u_resolution;

      void main() {
        vec4 sum = vec4(0.0);
        vec2 pixelSize = 1.0 / u_resolution;

        float total = 0.0;
        for (float x = -u_radius; x <= u_radius; x += 1.0) {
          for (float y = -u_radius; y <= u_radius; y += 1.0) {
            vec2 offset = vec2(x, y) * pixelSize;
            float weight = 1.0 / (1.0 + length(vec2(x, y)));
            sum += texture(u_texture, v_texCoord + offset) * weight;
            total += weight;
          }
        }

        outColor = sum / total;
      }
    `;

    return { vertex, fragment };
  }

  private createTexture(image: HTMLImageElement): WebGLTexture | null {
    if (!this.gl) return null;
    const gl = this.gl;

    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  private createEmptyTexture(width: number, height: number): WebGLTexture | null {
    if (!this.gl) return null;
    const gl = this.gl;

    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  private setupQuad(): void {
    if (!this.gl) return;
    const gl = this.gl;

    // IMPORTANT: The Y texture coordinates are flipped (1-y) relative to the naive mapping.
    // WebGL renders with Y=0 at the bottom of the canvas, but when toDataURL() reads the
    // canvas pixels it reads top-to-bottom (HTML convention), causing a vertical flip.
    // By inverting the texture Y coordinates here we pre-compensate for that flip so the
    // final exported image URL has the correct upright orientation.
    // Previously the quad used un-flipped tex-Y coords (y=0 at bottom), which caused every
    // filter pass to output a vertically-mirrored image. Do NOT revert this to the old mapping.
    const positions = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
      -1,  1, 0, 0,
       1, -1, 1, 1,
       1,  1, 1, 0,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  }

  private drawTexture(texture: WebGLTexture): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.getOrCreateProgram('passthrough', this.passthroughShader());
    if (!program) return;

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private passthroughShader(): { vertex: string; fragment: string } {
    const vertex = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragment = `#version 300 es
      precision highp float;

      in vec2 v_texCoord;
      out vec4 outColor;

      uniform sampler2D u_texture;

      void main() {
        outColor = texture(u_texture, v_texCoord);
      }
    `;

    return { vertex, fragment };
  }

  private getOrCreateProgram(name: string, shaders: { vertex: string; fragment: string }): WebGLProgram | null {
    if (this.programs.has(name)) {
      return this.programs.get(name) || null;
    }

    const program = this.createProgram(shaders.vertex, shaders.fragment);
    if (program) {
      this.programs.set(name, program);
    }

    return program;
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null;
    const gl = this.gl;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // Bind attribute locations
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.bindAttribLocation(program, 1, 'a_texCoord');

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const gl = this.gl;

    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private cleanup(): void {
    // Textures and framebuffers will be cleaned up by the browser
    // We keep programs cached for reuse
  }

  private async fallbackToCanvas2D(
    imageData: string,
    filters: ImageFilters,
    width: number,
    height: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get 2D context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Apply basic Canvas 2D filters
        let filterString = '';

        if (filters.brightness !== 0) {
          filterString += `brightness(${100 + filters.brightness}%) `;
        }
        if (filters.contrast !== 0) {
          filterString += `contrast(${100 + filters.contrast}%) `;
        }
        if (filters.saturation !== 0) {
          filterString += `saturate(${100 + filters.saturation}%) `;
        }
        if (filters.hue !== 0) {
          filterString += `hue-rotate(${filters.hue}deg) `;
        }
        if (filters.gaussianBlur > 0) {
          filterString += `blur(${(filters.gaussianBlur / 100) * 20}px) `;
        }
        if (filters.grayscale > 0) {
          filterString += `grayscale(${filters.grayscale}%) `;
        }
        if (filters.sepia > 0) {
          filterString += `sepia(${filters.sepia}%) `;
        }
        if (filters.invert) {
          filterString += 'invert(100%) ';
        }

        if (filterString) {
          ctx.filter = filterString.trim();
          ctx.drawImage(img, 0, 0, width, height);
        }

        if (filters.chromaKeyEnabled) {
          const hex = filters.chromaKeyColor.replace('#', '');
          const kr = parseInt(hex.slice(0, 2), 16);
          const kg = parseInt(hex.slice(2, 4), 16);
          const kb = parseInt(hex.slice(4, 6), 16);

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          const similarity = filters.chromaKeySimilarity / 100;
          const smoothness = filters.chromaKeyEdgeSmoothness / 100;
          const spill = filters.chromaKeySpillReduction / 100;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;

            const py = 0.299 * r + 0.587 * g + 0.114 * b;
            const pcb = -0.168736 * r - 0.331264 * g + 0.5 * b + 0.5;
            const pcr = 0.5 * r - 0.418688 * g - 0.081312 * b + 0.5;

            const ky = 0.299 * (kr / 255) + 0.587 * (kg / 255) + 0.114 * (kb / 255);
            const kcb = -0.168736 * (kr / 255) - 0.331264 * (kg / 255) + 0.5 * (kb / 255) + 0.5;
            const kcr = 0.5 * (kr / 255) - 0.418688 * (kg / 255) - 0.081312 * (kb / 255) + 0.5;

            const dist = Math.sqrt((pcb - kcb) ** 2 + (pcr - kcr) ** 2);
            const hard = similarity * 0.5;
            const soft = hard + smoothness * 0.15;
            const alpha = Math.min(1, Math.max(0, (dist - hard) / Math.max(0.0001, soft - hard)));

            if (alpha < 1 && spill > 0) {
              const spillFactor = (1 - alpha) * spill;
              const newCb = pcb + (0.5 - pcb) * spillFactor;
              const newCr = pcr + (0.5 - pcr) * spillFactor;
              data[i]     = Math.round(Math.min(255, Math.max(0, (py + 1.402 * (newCr - 0.5)) * 255)));
              data[i + 1] = Math.round(Math.min(255, Math.max(0, (py - 0.344136 * (newCb - 0.5) - 0.714136 * (newCr - 0.5)) * 255)));
              data[i + 2] = Math.round(Math.min(255, Math.max(0, (py + 1.772 * (newCb - 0.5)) * 255)));
            }

            data[i + 3] = Math.round(data[i + 3] * alpha);
          }
          ctx.putImageData(imgData, 0, 0);
        }

        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageData;
    });
  }
}

// Singleton instance
let filterProcessor: WebGLFilterProcessor | null = null;

export function getFilterProcessor(): WebGLFilterProcessor {
  if (!filterProcessor) {
    filterProcessor = new WebGLFilterProcessor();
  }
  return filterProcessor;
}
