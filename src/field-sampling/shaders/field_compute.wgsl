struct FieldUniforms {
  t: f32,
  noisePhase: f32,
  gridDensity: f32,
  samplerType: u32,  // 0=grid, 1=scanline, 2=offsetBundle
  canvasWidth: f32,
  canvasHeight: f32,
  threshold: f32,
  cellSize: f32,
  jitter: f32,
  lineSpacing: f32,
  dashMinLength: f32,
  dashMaxLength: f32,
  gapChance: f32,
  noiseBreakScale: f32,
  noiseBreak: u32,
  direction: u32,   // 0=horizontal, 1=vertical
  sizeMin: f32,
  sizeMax: f32,
  markShape: u32,   // 0=dot, 1=dash, 2=line
  copyCount: u32,
  offsetSpacing: f32,
  phaseOffset: f32,
  noiseScale: f32,
  noiseOctaves: u32,
  noiseLacunarity: f32,
  noisePersistence: f32,
  noiseThreshold: f32,
  noiseTimeSpeed: f32,
  noiseSeed: f32,
  _padding: f32,
};

struct Particle {
  x: f32,
  y: f32,
  value: f32,
  angle: f32,
  length: f32,
  size: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var sdfTexture: texture_2d<f32>;
@group(0) @binding(1) var sdfSampler: sampler;
@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(3) var<uniform> uniforms: FieldUniforms;
@group(0) @binding(4) var<storage, read_write> counter: atomic<u32>;

fn hash(p: vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

fn hash3(p: vec3<f32>) -> f32 {
  let h = dot(p, vec3<f32>(127.1, 311.7, 74.7));
  return fract(sin(h) * 43758.5453);
}

fn grad3(hash_val: f32) -> vec3<f32> {
  let h = u32(hash_val * 12.0) % 12u;
  let grad_table = array<vec3<f32>, 12>(
    vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(-1.0, 1.0, 0.0),
    vec3<f32>(1.0, -1.0, 0.0), vec3<f32>(-1.0, -1.0, 0.0),
    vec3<f32>(1.0, 0.0, 1.0), vec3<f32>(-1.0, 0.0, 1.0),
    vec3<f32>(1.0, 0.0, -1.0), vec3<f32>(-1.0, 0.0, -1.0),
    vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(0.0, -1.0, 1.0),
    vec3<f32>(0.0, 1.0, -1.0), vec3<f32>(0.0, -1.0, -1.0),
  );
  return grad_table[h];
}

fn simplexNoise3D(pos: vec3<f32>) -> f32 {
  let F3 = 1.0 / 3.0;
  let G3 = 1.0 / 6.0;

  let s = (pos.x + pos.y + pos.z) * F3;
  let i = floor(pos.x + s);
  let j = floor(pos.y + s);
  let k = floor(pos.z + s);

  let t_val = (i + j + k) * G3;
  let x0 = pos.x - (i - t_val);
  let y0 = pos.y - (j - t_val);
  let z0 = pos.z - (k - t_val);

  var i1: f32; var j1: f32; var k1: f32;
  var i2: f32; var j2: f32; var k2: f32;

  if (x0 >= y0) {
    if (y0 >= z0) { i1=1.0; j1=0.0; k1=0.0; i2=1.0; j2=1.0; k2=0.0; }
    else if (x0 >= z0) { i1=1.0; j1=0.0; k1=0.0; i2=1.0; j2=0.0; k2=1.0; }
    else { i1=0.0; j1=0.0; k1=1.0; i2=1.0; j2=0.0; k2=1.0; }
  } else {
    if (y0 < z0) { i1=0.0; j1=0.0; k1=1.0; i2=0.0; j2=1.0; k2=1.0; }
    else if (x0 < z0) { i1=0.0; j1=1.0; k1=0.0; i2=0.0; j2=1.0; k2=1.0; }
    else { i1=0.0; j1=1.0; k1=0.0; i2=1.0; j2=1.0; k2=0.0; }
  }

  let x1 = x0 - i1 + G3;
  let y1 = y0 - j1 + G3;
  let z1 = z0 - k1 + G3;
  let x2 = x0 - i2 + 2.0 * G3;
  let y2 = y0 - j2 + 2.0 * G3;
  let z2 = z0 - k2 + 2.0 * G3;
  let x3 = x0 - 1.0 + 3.0 * G3;
  let y3 = y0 - 1.0 + 3.0 * G3;
  let z3 = z0 - 1.0 + 3.0 * G3;

  var n0 = 0.0; var n1 = 0.0; var n2 = 0.0; var n3 = 0.0;

  var t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
  if (t0 >= 0.0) {
    t0 = t0 * t0;
    let g0 = grad3(hash3(vec3<f32>(i, j, k)));
    n0 = t0 * t0 * dot(g0, vec3<f32>(x0, y0, z0));
  }

  var t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
  if (t1 >= 0.0) {
    t1 = t1 * t1;
    let g1 = grad3(hash3(vec3<f32>(i+i1, j+j1, k+k1)));
    n1 = t1 * t1 * dot(g1, vec3<f32>(x1, y1, z1));
  }

  var t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
  if (t2 >= 0.0) {
    t2 = t2 * t2;
    let g2 = grad3(hash3(vec3<f32>(i+i2, j+j2, k+k2)));
    n2 = t2 * t2 * dot(g2, vec3<f32>(x2, y2, z2));
  }

  var t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
  if (t3 >= 0.0) {
    t3 = t3 * t3;
    let g3 = grad3(hash3(vec3<f32>(i+1.0, j+1.0, k+1.0)));
    n3 = t3 * t3 * dot(g3, vec3<f32>(x3, y3, z3));
  }

  return 32.0 * (n0 + n1 + n2 + n3);
}

fn sampleSDF(uv: vec2<f32>) -> f32 {
  return textureSampleLevel(sdfTexture, sdfSampler, uv, 0.0).r;
}

fn seededRandom(seed: f32) -> f32 {
  return fract(sin(seed * 12.9898 + 78.233) * 43758.5453);
}

fn computeGridSample(id: u32) {
  let cellSize = uniforms.cellSize;
  let cols = u32(ceil(uniforms.canvasWidth / cellSize));
  let rows = u32(ceil(uniforms.canvasHeight / cellSize));
  let maxSamples = cols * rows;

  if (id >= maxSamples) { return; }

  let col = id % cols;
  let row = id / cols;

  var x = f32(col) * cellSize + cellSize * 0.5;
  var y = f32(row) * cellSize + cellSize * 0.5;

  if (uniforms.jitter > 0.0) {
    let seedX = f32(col) * 7919.0 + f32(row) * 104729.0;
    let seedY = f32(col) * 104729.0 + f32(row) * 7919.0;
    x += (seededRandom(seedX) - 0.5) * cellSize * uniforms.jitter;
    y += (seededRandom(seedY) - 0.5) * cellSize * uniforms.jitter;
  }

  let uv = vec2<f32>(x / uniforms.canvasWidth, y / uniforms.canvasHeight);
  var value = sampleSDF(uv);

  // Apply noise modulation if active
  if (uniforms.noiseScale > 0.0) {
    let noisePos = vec3<f32>(
      x * uniforms.noiseScale,
      y * uniforms.noiseScale,
      uniforms.noisePhase * uniforms.noiseTimeSpeed
    );
    let nv = (simplexNoise3D(noisePos) + 1.0) * 0.5;
    value = value * nv;
  }

  if (value <= uniforms.threshold) { return; }

  let idx = atomicAdd(&counter, 1u);
  let size = uniforms.sizeMin + (uniforms.sizeMax - uniforms.sizeMin) * value;

  particles[idx] = Particle(x, y, value, 0.0, size, size, 0.0, 0.0);
}

fn computeScanlineSample(id: u32) {
  let isHorizontal = uniforms.direction == 0u;
  let lineSpacing = uniforms.lineSpacing;
  let lineCount = select(
    u32(ceil(uniforms.canvasWidth / lineSpacing)),
    u32(ceil(uniforms.canvasHeight / lineSpacing)),
    isHorizontal
  );
  let lineLen = select(uniforms.canvasHeight, uniforms.canvasWidth, isHorizontal);
  let segmentLen = uniforms.dashMaxLength;
  let segmentsPerLine = u32(ceil(lineLen / segmentLen));
  let totalSegments = lineCount * segmentsPerLine;

  if (id >= totalSegments) { return; }

  let line = id / segmentsPerLine;
  let seg = id % segmentsPerLine;

  let linePos = f32(line) * lineSpacing + lineSpacing * 0.5;
  let segStart = f32(seg) * segmentLen;
  let segMid = segStart + segmentLen * 0.5;

  let x = select(linePos, segMid, isHorizontal);
  let y = select(segMid, linePos, isHorizontal);

  let uv = vec2<f32>(x / uniforms.canvasWidth, y / uniforms.canvasHeight);
  var value = sampleSDF(uv);

  if (value <= uniforms.threshold) { return; }

  // Noise break
  if (uniforms.noiseBreak == 1u) {
    let breakNoise = seededRandom(segMid * uniforms.noiseBreakScale + f32(line) * 31.7 + uniforms.t * 0.1);
    if (breakNoise < uniforms.gapChance) { return; }
  }

  let angle = select(3.14159265 * 0.5, 0.0, isHorizontal);
  let dashLen = min(segmentLen, uniforms.dashMaxLength);

  let idx = atomicAdd(&counter, 1u);
  particles[idx] = Particle(x, y, value, angle, dashLen, uniforms.sizeMax, 0.0, 0.0);
}

fn computeOffsetBundleSample(id: u32) {
  let pathSegments = 80u;
  let totalSamples = uniforms.copyCount * pathSegments;

  if (id >= totalSamples) { return; }

  let copy = id / pathSegments;
  let seg = id % pathSegments;

  let halfCount = f32(uniforms.copyCount) * 0.5;
  let offsetFactor = (f32(copy) - halfCount) * uniforms.offsetSpacing;

  let tSeg = f32(seg) / f32(pathSegments);
  let amplitude = uniforms.canvasHeight * 0.3;
  let frequency = 2.0;
  let phaseShift = uniforms.t * 0.5 + f32(copy) * uniforms.phaseOffset * uniforms.t;

  let baseX = tSeg * uniforms.canvasWidth;
  let baseY = uniforms.canvasHeight * 0.5 + sin(tSeg * 3.14159265 * frequency + phaseShift) * amplitude;

  // Compute normal for offset
  let tNext = min(tSeg + 1.0 / f32(pathSegments), 1.0);
  let nextX = tNext * uniforms.canvasWidth;
  let nextY = uniforms.canvasHeight * 0.5 + sin(tNext * 3.14159265 * frequency + phaseShift) * amplitude;
  let dx = nextX - baseX;
  let dy = nextY - baseY;
  let len = max(sqrt(dx * dx + dy * dy), 0.001);
  let nx = -dy / len;
  let ny = dx / len;

  let x = baseX + nx * offsetFactor;
  let y = baseY + ny * offsetFactor;

  let uv = vec2<f32>(x / uniforms.canvasWidth, y / uniforms.canvasHeight);
  var value = sampleSDF(uv);

  if (value < 0.01) { value = 0.5; } // For offset bundle, keep all segments visible

  let angle = atan2(dy, dx);
  let segLen = len;

  // Opacity falloff (gaussian)
  let t_copy = f32(copy) / max(f32(uniforms.copyCount) - 1.0, 1.0);
  let centered = abs(t_copy - 0.5) * 2.0;
  let opacity = exp(-centered * centered * 3.0);

  if (opacity < 0.01) { return; }

  let idx = atomicAdd(&counter, 1u);
  particles[idx] = Particle(x, y, value * opacity, angle, segLen, uniforms.sizeMax, 0.0, 0.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let id = globalId.x;

  switch (uniforms.samplerType) {
    case 0u: { computeGridSample(id); }
    case 1u: { computeScanlineSample(id); }
    case 2u: { computeOffsetBundleSample(id); }
    default: {}
  }
}
