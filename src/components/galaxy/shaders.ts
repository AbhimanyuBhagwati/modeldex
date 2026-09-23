/**
 * GLSL for the AI Galaxy. Everything is drawn in code: no textures or images to load.
 */

/**
 * 3D simplex noise. Description: array and textureless GLSL 2D/3D/4D simplex noise functions.
 * Author: Ian McEwan, Ashima Arts. Maintained by Stefan Gustavson.
 * License: Copyright (C) 2011 Ashima Arts. All rights reserved. Distributed under the MIT License.
 * https://github.com/ashima/webgl-noise and https://github.com/stegu/webgl-noise
 */
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { f += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return f;
}
float fbm3(vec3 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { f += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return f;
}
`;

/** Model stars: a white-hot core, a halo in the lab's color, spikes on the brightest, a flare at birth. */
export const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aBirth;
attribute float aSeed;
attribute float aDim;
attribute float aSpikes;
uniform float uDay;
uniform float uScale;
uniform float uClock;
uniform float uFlare;
varying vec3 vColor;
varying float vAlpha;
varying float vFlash;
varying float vSpikes;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float age = uDay - aBirth;
  if (age < 0.0) { gl_PointSize = 0.0; vAlpha = 0.0; return; }
  // New stars flare for a few weeks of timeline, but only while time is moving, so the edge sparkles and then settles.
  float flash = exp(-age / 16.0) * uFlare;
  float twinkle = 0.88 + 0.12 * sin(uClock * (1.1 + aSeed * 2.3) + aSeed * 61.0);
  float size = aSize * twinkle * (1.0 + flash * 2.4);
  gl_PointSize = clamp(size * uScale / -mv.z, 2.0, 220.0);
  vColor = aColor;
  vAlpha = aDim;
  vFlash = flash;
  vSpikes = aSpikes;
}
`;

export const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vFlash;
varying float vSpikes;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0 || vAlpha <= 0.0) discard;
  float core = exp(-r2 * 30.0);
  float halo = exp(-r2 * 5.0) * 0.6;
  float spikes = vSpikes * (exp(-abs(p.x) * 42.0) + exp(-abs(p.y) * 42.0)) * (1.0 - sqrt(r2)) * 0.9;
  vec3 color = vColor * (halo + spikes * 0.8) + vec3(1.0, 0.97, 0.9) * (core * (1.1 + vFlash * 1.6) + spikes * 0.35);
  float alpha = (core + halo + spikes) * vAlpha;
  gl_FragColor = vec4(color * vAlpha * (1.0 + vFlash), alpha);
}
`;

/** Dust along the arms. It only exists inside the edge of now, so the galaxy grows with time. */
export const DUST_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aRadius;
attribute float aSeed;
uniform float uFrontier;
uniform float uScale;
uniform float uClock;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float inside = 1.0 - smoothstep(uFrontier - 3.0, uFrontier + 1.0, aRadius);
  gl_PointSize = clamp(aSize * uScale / -mv.z, 0.0, 26.0) * inside;
  vColor = aColor;
  vAlpha = inside * (0.55 + 0.45 * sin(uClock * 0.4 + aSeed * 30.0));
}
`;

export const DUST_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 4.0) * vAlpha * 0.36;
  gl_FragColor = vec4(vColor * a, a);
}
`;

/** The galaxy's body: a glowing disk with spiral structure, gold at the core, violet and blue at the rim. */
export const DISK_VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const DISK_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uFrontier;
uniform float uRadius;
uniform float uClock;
uniform float uTwist;
varying vec2 vPos;
void main() {
  float r = length(vPos) / uRadius;
  float angle = atan(vPos.y, vPos.x);
  float swirl = angle + uTwist * r;
  float arms = pow(0.5 + 0.5 * sin(4.0 * swirl + fbm3(vec3(vPos * 0.035, uClock * 0.02)) * 2.2), 2.5);
  float clouds = 0.55 + 0.45 * fbm3(vec3(vPos * 0.06, 3.1 + uClock * 0.015));
  float edge = smoothstep(uFrontier / uRadius + 0.06, uFrontier / uRadius - 0.1, r);
  float core = exp(-r * r * 26.0);
  float body = exp(-r * r * 2.6) * (0.35 + arms * 0.9) * clouds * edge;
  vec3 gold = vec3(1.0, 0.7, 0.38);
  vec3 violet = vec3(0.38, 0.28, 0.95);
  vec3 blue = vec3(0.12, 0.45, 1.0);
  vec3 color = mix(mix(gold, violet, smoothstep(0.04, 0.45, r)), blue, smoothstep(0.45, 1.0, r));
  // Kept dim: the stars and dust carry the arms; this is only the glow between them.
  float intensity = core * 0.5 + body * 0.12;
  gl_FragColor = vec4(color * intensity, intensity);
}
`;

/** The sky: nebula clouds, rendered once into a cube map at startup, so they cost nothing per frame. */
export const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAGMENT = /* glsl */ `
${NOISE}
varying vec3 vDir;
void main() {
  vec3 d = vDir * 2.2;
  float n = fbm(d);
  float m = fbm(d * 1.7 + 7.3);
  float clouds = smoothstep(0.05, 0.75, n) * 0.55 + smoothstep(0.2, 0.9, m) * 0.35;
  vec3 deep = vec3(0.012, 0.014, 0.035);
  vec3 purple = vec3(0.16, 0.06, 0.26);
  vec3 teal = vec3(0.03, 0.16, 0.2);
  vec3 color = deep + purple * clouds * smoothstep(-0.2, 0.6, vDir.y + n * 0.5) + teal * smoothstep(0.3, 0.9, m) * 0.6;
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Faraway stars: fixed pixel size, gentle twinkle. */
export const FIELD_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
uniform float uClock;
uniform float uPixel;
varying vec3 vColor;
varying float vAlpha;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixel;
  vColor = aColor;
  vAlpha = 0.45 + 0.55 * (0.5 + 0.5 * sin(uClock * (0.6 + aSeed) + aSeed * 90.0));
}
`;

export const FIELD_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 6.0) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

/** Constellation lines: faint until their line is in focus, and drawn only once both stars exist. */
export const LINE_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aBirth;
attribute float aGlow;
uniform float uDay;
varying vec3 vColor;
varying float vAlpha;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vColor = aColor;
  vAlpha = uDay >= aBirth ? aGlow : 0.0;
}
`;

export const LINE_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.0) discard;
  gl_FragColor = vec4(vColor * vAlpha, vAlpha);
}
`;

/** A flat ring with a soft glow: the year rings and the edge of now. */
export const RING_VERTEX = /* glsl */ `
uniform float uInner;
uniform float uOuter;
varying float vAcross;
void main() {
  // 0 at the inner edge, 1 at the outer. RingGeometry's own uvs are planar, not radial.
  vAcross = (length(position.xy) - uInner) / (uOuter - uInner);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RING_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAcross;
void main() {
  float glow = exp(-pow((vAcross - 0.5) * 3.4, 2.0));
  float a = glow * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}
`;
