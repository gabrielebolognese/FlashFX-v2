struct RenderUniforms {
  canvasWidth: f32,
  canvasHeight: f32,
  colorR: f32,
  colorG: f32,
  colorB: f32,
  colorA: f32,
  strokeWidth: f32,
  markShape: u32,  // 0=dot, 1=dash, 2=line
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

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) localUV: vec2<f32>,
  @location(1) opacity: f32,
  @location(2) markInfo: vec3<f32>,  // length, size, shape
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;

@vertex
fn vsMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VSOutput {
  let particle = particles[instanceIndex];

  // Quad vertices: 0=TL, 1=TR, 2=BL, 3=BR (triangle strip)
  let quadPos = array<vec2<f32>, 4>(
    vec2<f32>(-0.5, -0.5),
    vec2<f32>(0.5, -0.5),
    vec2<f32>(-0.5, 0.5),
    vec2<f32>(0.5, 0.5),
  );

  let localPos = quadPos[vertexIndex];

  // Scale quad by mark size
  var scaleX: f32;
  var scaleY: f32;

  if (uniforms.markShape == 0u) {
    // Dot: uniform size
    scaleX = particle.size * 2.0;
    scaleY = particle.size * 2.0;
  } else {
    // Dash/line: length x strokeWidth
    scaleX = particle.length;
    scaleY = max(uniforms.strokeWidth, 1.0);
  }

  // Rotate by particle angle
  let cosA = cos(particle.angle);
  let sinA = sin(particle.angle);

  let scaled = vec2<f32>(localPos.x * scaleX, localPos.y * scaleY);
  let rotated = vec2<f32>(
    scaled.x * cosA - scaled.y * sinA,
    scaled.x * sinA + scaled.y * cosA,
  );

  // Translate to particle position and convert to clip space
  let worldPos = vec2<f32>(particle.x + rotated.x, particle.y + rotated.y);
  let clipPos = vec2<f32>(
    (worldPos.x / uniforms.canvasWidth) * 2.0 - 1.0,
    1.0 - (worldPos.y / uniforms.canvasHeight) * 2.0,
  );

  var output: VSOutput;
  output.position = vec4<f32>(clipPos, 0.0, 1.0);
  output.localUV = localPos + 0.5;  // 0..1
  output.opacity = particle.value;
  output.markInfo = vec3<f32>(particle.length, particle.size, f32(uniforms.markShape));
  return output;
}

@fragment
fn fsMain(input: VSOutput) -> @location(0) vec4<f32> {
  let shape = u32(input.markInfo.z);
  var alpha = input.opacity * uniforms.colorA;

  if (shape == 0u) {
    // Dot: circular SDF
    let dist = length(input.localUV - vec2<f32>(0.5, 0.5)) * 2.0;
    if (dist > 1.0) { discard; }
    // Smooth edge
    alpha *= 1.0 - smoothstep(0.8, 1.0, dist);
  } else {
    // Dash/line: rounded rectangle
    let uv = input.localUV;
    let aspect = input.markInfo.x / max(uniforms.strokeWidth, 1.0);
    let distX = abs(uv.x - 0.5) * 2.0;
    let distY = abs(uv.y - 0.5) * 2.0;

    // Simple rectangle with soft edges
    let edgeX = smoothstep(0.9, 1.0, distX);
    let edgeY = smoothstep(0.8, 1.0, distY);
    alpha *= (1.0 - edgeX) * (1.0 - edgeY);
  }

  if (alpha < 0.005) { discard; }

  return vec4<f32>(uniforms.colorR, uniforms.colorG, uniforms.colorB, alpha);
}
