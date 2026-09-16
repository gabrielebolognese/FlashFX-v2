// Optical-flow WARP shader for retiming (B6b). A single-pass gradient (Lucas-Kanade-style) flow
// estimate + motion-compensated blend between two adjacent source frames: for each pixel it estimates
// a small local flow from the spatial+temporal luma gradients, then samples frameA forward along t·flow
// and frameB backward along (1−t)·flow and cross-fades by t. Identity at t=0 (all A) / t=1 (all B).
//
// This is a BASIC single-level estimate: great for small motion (typical slow-mo), and it degrades to
// a plain cross-dissolve for large motion (the flow is clamped) — no ghosting-free guarantee for big
// displacements (a pyramidal/iterative solver is a future upgrade). WebGPU only; the renderer builds
// the pipeline behind a guard and falls back to the crisp frame on any failure. Kept as a plain string
// module (no GPU calls) so it type-checks in CI; the shader itself is browser-verified.

/** Uniform: t (mix 0..1), strength (max flow in source texels), 2 pad → 16 bytes. */
export const FLOW_UNIFORM_SIZE = 16;

export const FLOW_WARP_SHADER = /* wgsl */ `
struct FlowU {
  t: f32,
  strength: f32,
  _p0: f32,
  _p1: f32,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var texA: texture_2d<f32>;
@group(0) @binding(2) var texB: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: FlowU;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(texA));
  let uv = pos.xy / dims;          // fragment-position → texcoord (identity mapping, like the blur pass)
  let px = 1.0 / dims;

  // Spatial + temporal luma gradients (Lucas-Kanade gradient constraint on a single pixel).
  let la = luma(textureSampleLevel(texA, samp, uv, 0.0).rgb);
  let lax = luma(textureSampleLevel(texA, samp, uv + vec2f(px.x, 0.0), 0.0).rgb);
  let lay = luma(textureSampleLevel(texA, samp, uv + vec2f(0.0, px.y), 0.0).rgb);
  let ix = lax - la;               // d(luma)/dx over one texel
  let iy = lay - la;
  let it = luma(textureSampleLevel(texB, samp, uv, 0.0).rgb) - la;
  let g2 = ix * ix + iy * iy + 1e-4;

  // Flow in texels, then to uv space; clamp magnitude so big/ambiguous motion can't smear wildly.
  var flow = vec2f(-it * ix / g2, -it * iy / g2) * px;
  let maxd = u.strength * px;
  flow = clamp(flow, vec2f(-maxd.x, -maxd.y), vec2f(maxd.x, maxd.y));

  let a = textureSampleLevel(texA, samp, uv + flow * u.t, 0.0);
  let b = textureSampleLevel(texB, samp, uv - flow * (1.0 - u.t), 0.0);
  return mix(a, b, u.t);
}
`;
