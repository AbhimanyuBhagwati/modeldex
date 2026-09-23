import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { R, TWIST, hash01, type GalaxyData, type GalaxyLayout } from '@/lib/galaxy';
import * as S from './shaders';

export interface Focus {
  lab: string | null;
  type: string | null;
  selected: string | null;
  hovered: string | null;
}

/** An HTML label pinned to a point in the galaxy, moved every frame. Hidden before `minDay`. */
export interface Label {
  el: HTMLElement;
  position: [number, number, number];
  minDay: number;
  /** Fades when another lab is in focus. */
  lab?: string;
  /** Rides just outside the edge of now at the end of this lab's arm, instead of sitting at `position`. */
  rim?: boolean;
}

export interface GalaxyScene {
  setDay(day: number): void;
  setFocus(focus: Focus): void;
  flyTo(to: { key?: string; lab?: string; home?: boolean }, ms?: number, easing?: 'inOut' | 'out'): void;
  /** Plays the Big Bang: a pulsing singularity, then the blast, then the galaxy forming. */
  bigBang(on: { bang?: () => void; formed?: () => void }): void;
  /** Ends the Big Bang at once, with the galaxy formed. */
  skipBang(): void;
  pick(clientX: number, clientY: number): string | null;
  setLabels(labels: Label[]): void;
  /** Called when the viewer grabs the camera. */
  onUserMove(cb: () => void): void;
  destroy(): void;
}

/** Seeded random, so the dust and background stars fall the same way every visit. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rand: () => number) => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());

function glowTexture(inner: string, outer: string, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.25, outer);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringTexture(dashed: boolean, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffe9a8';
  g.lineWidth = size * 0.035;
  g.shadowColor = '#ffd873';
  g.shadowBlur = size * 0.05;
  if (dashed) g.setLineDash([size * 0.09, size * 0.05]);
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Fast then slow: the camera is thrown back by the blast. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/** Big Bang timing, in ms: the singularity charges, then the universe expands into the galaxy. */
const CHARGE = 1700;
const EXPAND = 3800;
const SHOCK = 2000;

/**
 * Builds the galaxy on a canvas. Returns null when WebGL isn't available, so the page can say so.
 * `lite` trims particle counts and glow for small or low-power screens.
 */
export function createGalaxyScene(canvas: HTMLCanvasElement, data: GalaxyData, layout: GalaxyLayout, opts: { reduced: boolean; lite: boolean }): GalaxyScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const pixel = Math.min(window.devicePixelRatio || 1, opts.lite ? 1.25 : 1.75);
  renderer.setPixelRatio(pixel);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 9000);
  // Far enough back to see the whole disk, tilted enough to read the arms.
  const HOME = { pos: new THREE.Vector3(0, 122, 204), target: new THREE.Vector3(0, -14, 0) };
  camera.position.set(0, 360, 24);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 6;
  controls.maxDistance = 620;
  controls.zoomToCursor = true;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.9;
  controls.autoRotate = !opts.reduced;
  controls.autoRotateSpeed = 0.2;

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const clock = { value: 0 };
  const day = { value: 0 };
  const bang = { value: 1 };
  /** 0 while the whole galaxy glows after the Big Bang, 1 once unwritten arms have faded to ghosts. */
  const ghost = { value: 1 };
  let ghostFrom = -Infinity;
  const flare = { value: 0 };
  let dayMovedAt = -Infinity;
  const scale = { value: 1 };
  const px = { value: pixel };
  const frontier = { value: layout.radiusAt(0) };
  const rand = random(20260923);
  const colors = new Map(data.labs.map((l) => [l.key, new THREE.Color(l.color)]));
  const white = new THREE.Color(1, 1, 1);

  // The sky: nebula clouds rendered once into a cube map.
  const skyScene = new THREE.Scene();
  skyScene.add(
    new THREE.Mesh(
      keep(new THREE.SphereGeometry(100, 64, 32)),
      keep(new THREE.ShaderMaterial({ vertexShader: S.SKY_VERTEX, fragmentShader: S.SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false })),
    ),
  );
  const cube = keep(new THREE.WebGLCubeRenderTarget(opts.lite ? 256 : 512));
  new THREE.CubeCamera(1, 1000, cube).update(renderer, skyScene);
  scene.background = cube.texture;

  // Faraway stars.
  {
    const n = opts.lite ? 3500 : 7500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const tints = [new THREE.Color('#ffffff'), new THREE.Color('#bcd4ff'), new THREE.Color('#ffe2b3'), new THREE.Color('#d7c4ff')];
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const r = 1800 + rand() * 1400;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r], i * 3);
      const c = tints[Math.floor(rand() * tints.length)];
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 0.6 + Math.pow(rand(), 3) * 2.4;
      seed[i] = rand();
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = keep(new THREE.ShaderMaterial({ vertexShader: S.FIELD_VERTEX, fragmentShader: S.FIELD_FRAGMENT, uniforms: { uClock: clock, uPixel: px }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(new THREE.Points(g, m));
  }

  // The galaxy's body.
  const disk = new THREE.Mesh(
    keep(new THREE.CircleGeometry(R * 1.25, 192)),
    keep(
      new THREE.ShaderMaterial({
        vertexShader: S.DISK_VERTEX,
        fragmentShader: S.DISK_FRAGMENT,
        uniforms: { uFrontier: frontier, uRadius: { value: R }, uClock: clock, uTwist: { value: TWIST }, uBang: bang },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    ),
  );
  // CircleGeometry lies in XY; +90° about X puts its y on the galaxy's z, so its spiral turns the same way as the arms.
  disk.rotation.x = Math.PI / 2;
  scene.add(disk);

  // Dust along every lab's arm, plus a warm bulge at the core.
  {
    const total = opts.lite ? 14000 : 30000;
    const bulge = opts.lite ? 2500 : 5000;
    const weights = data.labs.map((l) => Math.sqrt(l.count));
    const sum = weights.reduce((a, b) => a + b, 0);
    const counts = weights.map((w) => Math.round((w / sum) * total));
    const n = counts.reduce((a, b) => a + b, 0) + bulge;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const radius = new Float32Array(n);
    const seed = new Float32Array(n);
    let k = 0;
    const warm = [new THREE.Color('#ffd79a'), new THREE.Color('#fff1d6'), new THREE.Color('#ffb46b')];
    data.labs.forEach((lab, li) => {
      const c = colors.get(lab.key)!;
      for (let i = 0; i < counts[li]; i++, k++) {
        const r = R * Math.min(1.04, Math.sqrt(rand()) * 1.02 + 0.01);
        const [x, y, z] = layout.place(lab.key, r, gauss(rand) * 0.2, gauss(rand) * 0.7);
        pos.set([x + gauss(rand) * 0.8, y, z + gauss(rand) * 0.8], k * 3);
        const mixed = c.clone().lerp(white, 0.2 + rand() * 0.35);
        col.set([mixed.r, mixed.g, mixed.b], k * 3);
        size[k] = 0.35 + Math.pow(rand(), 2) * 1.2;
        radius[k] = r;
        seed[k] = rand();
      }
    });
    for (let i = 0; i < bulge; i++, k++) {
      const r = R * 0.16 * Math.sqrt(rand());
      const t = rand() * Math.PI * 2;
      pos.set([Math.cos(t) * r, gauss(rand) * R * 0.03 * (1 - r / (R * 0.2)), Math.sin(t) * r], k * 3);
      const c = warm[Math.floor(rand() * warm.length)];
      col.set([c.r, c.g, c.b], k * 3);
      size[k] = 0.4 + rand() * 0.9;
      radius[k] = 0;
      seed[k] = rand();
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = keep(
      new THREE.ShaderMaterial({
        vertexShader: S.DUST_VERTEX,
        fragmentShader: S.DUST_FRAGMENT,
        uniforms: { uFrontier: frontier, uScale: scale, uClock: clock, uBang: bang, uGhost: ghost },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(new THREE.Points(g, m));
  }

  // The stars: one per card.
  const n = data.stars.length;
  const index = new Map(data.stars.map((s, i) => [s.key, i]));
  const baseSize = new Float32Array(n);
  const dim = new Float32Array(n);
  const baseDim = new Float32Array(n);
  const stars = (() => {
    const col = new Float32Array(n * 3);
    const birth = new Float32Array(n);
    const seed = new Float32Array(n);
    const spikes = new Float32Array(n);
    data.stars.forEach((s, i) => {
      const c = (colors.get(s.lab) ?? white).clone().lerp(white, 0.1 + s.magnitude * 0.25);
      // Classics are older light: a little paler.
      if (s.classic) c.lerp(new THREE.Color('#cfe0ff'), 0.25);
      col.set([c.r, c.g, c.b], i * 3);
      baseSize[i] = 0.7 + s.magnitude * 3.4;
      birth[i] = s.day;
      seed[i] = hash01(s.key);
      spikes[i] = s.magnitude > 0.7 ? 1 : 0;
      baseDim[i] = dim[i] = s.retired ? 0.5 : 1;
    });
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(layout.positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(baseSize, 1));
    g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aDim', new THREE.BufferAttribute(dim, 1));
    g.setAttribute('aSpikes', new THREE.BufferAttribute(spikes, 1));
    const m = keep(
      new THREE.ShaderMaterial({
        vertexShader: S.STAR_VERTEX,
        fragmentShader: S.STAR_FRAGMENT,
        uniforms: { uDay: day, uScale: scale, uClock: clock, uFlare: flare, uBang: bang },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    return new THREE.Points(g, m);
  })();
  scene.add(stars);
  const at = (i: number) => new THREE.Vector3(layout.positions[i * 3], layout.positions[i * 3 + 1], layout.positions[i * 3 + 2]);

  // Constellations: each evolution line joined stage to stage.
  const lineOfVertex: number[] = [];
  const lines = (() => {
    const glow: number[] = [];
    const pos: number[] = [];
    const col: number[] = [];
    const birth: number[] = [];
    data.lines.forEach((line, li) => {
      const c = (colors.get(line.lab) ?? white).clone().lerp(white, 0.35);
      const ids = line.keys.map((k) => index.get(k)).filter((i): i is number => i != null);
      for (let j = 1; j < ids.length; j++) {
        const [a, b] = [ids[j - 1], ids[j]];
        const born = Math.max(data.stars[a].day, data.stars[b].day);
        for (const i of [a, b]) {
          pos.push(...at(i).toArray());
          col.push(c.r, c.g, c.b);
          birth.push(born);
          lineOfVertex.push(li);
          glow.push(0.3);
        }
      }
    });
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aBirth', new THREE.Float32BufferAttribute(birth, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
    const m = keep(new THREE.ShaderMaterial({ vertexShader: S.LINE_VERTEX, fragmentShader: S.LINE_FRAGMENT, uniforms: { uDay: day, uBang: bang }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    return new THREE.LineSegments(g, m);
  })();
  scene.add(lines);
  const lineIndex = new Map(data.lines.map((l, i) => [l.id, i]));

  // Year rings and the glowing edge of now.
  const ringMaterial = (color: string, opacity: number, inner: number, outer: number) =>
    keep(
      new THREE.ShaderMaterial({
        vertexShader: S.RING_VERTEX,
        fragmentShader: S.RING_FRAGMENT,
        uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uInner: { value: inner }, uOuter: { value: outer } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
  const yearRings = layout.years.map((y) => {
    const inner = y.radius - 0.5;
    const outer = y.radius + 0.5;
    const mesh = new THREE.Mesh(keep(new THREE.RingGeometry(inner, outer, 256)), ringMaterial('#f4cb68', 0.32, inner, outer));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = -0.2;
    scene.add(mesh);
    return { mesh, day: (Date.parse(`${y.year}-01-01T00:00:00Z`) - Date.parse('2022-01-01T00:00:00Z')) / 864e5 };
  });
  const edgeMaterial = ringMaterial('#9fd8ff', 0.9, 0.97, 1.03);
  const edge = new THREE.Mesh(keep(new THREE.RingGeometry(0.97, 1.03, 256)), edgeMaterial);
  edge.rotation.x = Math.PI / 2;
  scene.add(edge);

  // The core's light.
  const coreTex = keep(glowTexture('rgba(255,244,214,1)', 'rgba(255,190,110,0.45)'));
  const coreMat = keep(new THREE.SpriteMaterial({ map: coreTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  const core = new THREE.Sprite(coreMat);
  core.scale.setScalar(R * 0.36);
  scene.add(core);

  // The Big Bang's pieces: the singularity, a blast-wave sphere, and a shock ring racing across the plane.
  const singularityMat = keep(new THREE.SpriteMaterial({ map: keep(glowTexture('rgba(255,255,255,1)', 'rgba(255,226,170,0.9)')), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  const singularity = new THREE.Sprite(singularityMat);
  singularity.visible = false;
  scene.add(singularity);
  const shockMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: S.SHOCK_VERTEX,
      fragmentShader: S.SHOCK_FRAGMENT,
      uniforms: { uColor: { value: new THREE.Color('#ffe7b8') }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const shock = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 64, 32)), shockMat);
  shock.visible = false;
  scene.add(shock);
  const shockRingMat = ringMaterial('#fff1d0', 0, 0.9, 1.1);
  const shockRing = new THREE.Mesh(keep(new THREE.RingGeometry(0.9, 1.1, 256)), shockRingMat);
  shockRing.rotation.x = Math.PI / 2;
  shockRing.visible = false;
  scene.add(shockRing);

  // Hover and selection markers.
  const hoverMat = keep(new THREE.SpriteMaterial({ map: keep(ringTexture(false)), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  const selectMat = keep(new THREE.SpriteMaterial({ map: keep(ringTexture(true)), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  const hoverMark = new THREE.Sprite(hoverMat);
  const selectMark = new THREE.Sprite(selectMat);
  hoverMark.visible = selectMark.visible = false;
  scene.add(hoverMark, selectMark);

  // Glow.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), opts.lite ? 0.55 : 0.75, 0.5, 0.16);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixel);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    scale.value = (h * pixel) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // Camera flights.
  let flight: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; start: number; ms: number; easing: (t: number) => number } | null = null;
  const flyTo: GalaxyScene['flyTo'] = (to, ms = 1500, easing = 'inOut') => {
    let target: THREE.Vector3;
    let position: THREE.Vector3;
    if (to.key != null && index.has(to.key)) {
      target = at(index.get(to.key)!);
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (dir.y < 0.35) dir.y = 0.35;
      position = target.clone().add(dir.normalize().multiplyScalar(38));
    } else if (to.lab) {
      target = new THREE.Vector3(...layout.place(to.lab, R * 0.62, 0));
      position = target.clone().add(target.clone().setY(0).normalize().multiplyScalar(48)).add(new THREE.Vector3(0, 78, 0));
    } else {
      target = HOME.target.clone();
      position = HOME.pos.clone();
    }
    if (opts.reduced || ms <= 0) {
      camera.position.copy(position);
      controls.target.copy(target);
      flight = null;
      return;
    }
    flight = { from: [camera.position.clone(), controls.target.clone()], to: [position, target], start: performance.now(), ms, easing: easing === 'out' ? easeOut : ease };
  };
  const moved: (() => void)[] = [];
  controls.addEventListener('start', () => {
    flight = null;
    controls.autoRotate = false;
    moved.forEach((cb) => cb());
  });

  // Labels. Lab names ride just outside the edge of now, but never closer in than the ghost arms.
  const labelRadius = (edgeRadius: number) => Math.min(R * 1.06, Math.max(R * 0.64, edgeRadius + 7));
  let labels: (Label & { v: THREE.Vector3 })[] = [];
  let focusLab: string | null = null;
  const projected = new THREE.Vector3();
  const placeLabels = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const l of labels) {
      projected.copy(l.v).project(camera);
      const visible = bang.value >= 1 && projected.z < 1 && day.value >= l.minDay && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
      if (!visible) {
        l.el.style.opacity = '0';
        continue;
      }
      const dist = camera.position.distanceTo(l.v);
      const fade = Math.min(1, Math.max(0.25, 1.25 - dist / 420));
      const focused = !focusLab || !l.lab || l.lab === focusLab;
      l.el.style.opacity = String(fade * (focused ? 1 : 0.18));
      l.el.style.transform = `translate3d(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px, 0) translate(-50%, -50%)`;
    }
  };

  // The edge of now glows while the galaxy is growing and settles once it reaches today.
  let edgeGlow = 0.5;

  let bangRun: { start: number; on: { bang?: () => void; formed?: () => void }; blasted: boolean } | null = null;
  const showRings = (on: boolean) => {
    for (const y of yearRings) y.mesh.visible = on && day.value >= y.day;
    edge.visible = on;
  };
  const endBang = (linger = true) => {
    bangRun = null;
    bang.value = 1;
    // Let the formed galaxy hold a beat before the future dims to ghosts.
    ghostFrom = linger ? performance.now() + 700 : -Infinity;
    ghost.value = linger ? 0 : 1;
    singularity.visible = shock.visible = shockRing.visible = false;
    coreMat.opacity = 0.55;
    controls.autoRotate = !opts.reduced;
    controls.enabled = true;
    showRings(true);
  };
  const stepBang = (now: number) => {
    if (!bangRun) return;
    const t = now - bangRun.start;
    if (t < CHARGE) {
      // The singularity gathers itself: brighter, faster, bigger.
      const k = t / CHARGE;
      singularity.visible = true;
      singularity.scale.setScalar(1.2 + 5 * k * k + Math.sin(t * (0.012 + k * 0.03)) * 0.9 * k);
      singularityMat.opacity = 0.35 + 0.65 * k;
      bang.value = 0;
      ghost.value = 0;
      coreMat.opacity = 0;
      return;
    }
    if (!bangRun.blasted) {
      bangRun.blasted = true;
      shock.visible = shockRing.visible = true;
      flyTo({ home: true }, EXPAND + 1400, 'out');
      bangRun.on.bang?.();
    }
    const k = Math.min(1, (t - CHARGE) / EXPAND);
    bang.value = Math.max(0.001, k);
    coreMat.opacity = 0.55 * Math.min(1, k * 1.6);
    singularity.scale.setScalar(Math.max(0, 6 * (1 - k * 5)));
    singularity.visible = k < 0.2;
    const s = Math.min(1, (t - CHARGE) / SHOCK);
    shock.scale.setScalar(2 + s * R * 3.2);
    shockMat.uniforms.uOpacity.value = Math.pow(1 - s, 1.6) * 1.4;
    shockRing.scale.setScalar(1 + s * R * 1.6);
    shockRingMat.uniforms.uOpacity.value = Math.pow(1 - s, 1.2) * 1.2;
    if (s >= 1) shock.visible = shockRing.visible = false;
    if (k >= 1) {
      const formed = bangRun.on.formed;
      endBang();
      formed?.();
    }
  };

  // The loop.
  let raf = 0;
  const started = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    clock.value = (now - started) / 1000;
    flare.value = Math.max(0, 1 - (now - dayMovedAt) / 1600);
    if (flight) {
      const t = Math.min(1, (now - flight.start) / flight.ms);
      const e = flight.easing(t);
      camera.position.lerpVectors(flight.from[0], flight.to[0], e);
      controls.target.lerpVectors(flight.from[1], flight.to[1], e);
      if (t >= 1) flight = null;
    }
    stepBang(now);
    if (!bangRun && ghost.value < 1) ghost.value = Math.min(1, Math.max(0, (now - ghostFrom) / 3000));
    controls.update();
    selectMat.rotation = clock.value * 0.6;
    edgeMaterial.uniforms.uOpacity.value = edgeGlow * (0.75 + 0.25 * Math.sin(clock.value * 2.2));
    placeLabels();
    composer.render();
  };
  raf = requestAnimationFrame(frame);

  const markerScale = (i: number) => baseSize[i] * 1.5 + 1.4;

  return {
    setDay(d) {
      if (d !== day.value) dayMovedAt = performance.now();
      day.value = d;
      const r = layout.radiusAt(d);
      frontier.value = r;
      edge.scale.setScalar(Math.max(0.5, r));
      for (const l of labels) if (l.rim && l.lab) l.v.set(...layout.place(l.lab, labelRadius(r), 0, 0));
      edgeGlow = r >= R * 0.995 ? 0.14 : 0.5;
      showRings(bang.value >= 1);
    },
    setFocus(f) {
      focusLab = f.lab;
      const any = f.lab != null || f.type != null;
      for (let i = 0; i < n; i++) {
        const s = data.stars[i];
        const match = (!f.lab || s.lab === f.lab) && (!f.type || s.type === f.type);
        dim[i] = baseDim[i] * (match || !any ? 1 : 0.1);
      }
      stars.geometry.attributes.aDim.needsUpdate = true;
      const active = new Set<number>();
      for (const key of [f.selected, f.hovered]) {
        const line = key != null ? data.stars[index.get(key) ?? -1]?.line : null;
        if (line && lineIndex.has(line)) active.add(lineIndex.get(line)!);
      }
      const g = lines.geometry.attributes.aGlow as THREE.BufferAttribute;
      lineOfVertex.forEach((li, v) => {
        const lab = data.lines[li].lab;
        g.setX(v, active.has(li) ? 1 : f.lab ? (lab === f.lab ? 0.55 : 0.05) : any ? 0.1 : 0.3);
      });
      g.needsUpdate = true;
      for (const [mark, key] of [
        [hoverMark, f.hovered],
        [selectMark, f.selected],
      ] as const) {
        const i = key != null ? index.get(key) : undefined;
        mark.visible = i != null && data.stars[i].day <= day.value;
        if (i != null) {
          mark.position.copy(at(i));
          mark.scale.setScalar(markerScale(i) * (mark === selectMark ? 1.35 : 1));
        }
      }
    },
    flyTo,
    bigBang(on) {
      flight = null;
      controls.autoRotate = false;
      controls.enabled = false;
      camera.position.set(0, 10, 30);
      controls.target.set(0, 0, 0);
      bang.value = 0;
      showRings(false);
      if (opts.reduced) {
        endBang(false);
        on.formed?.();
        return;
      }
      bangRun = { start: performance.now(), on, blasted: false };
    },
    skipBang() {
      if (!bangRun && bang.value >= 1) return;
      endBang(false);
      flyTo({ home: true }, 900);
    },
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      let best: string | null = null;
      let bestScore = Infinity;
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        if (data.stars[i].day > day.value || dim[i] < 0.2) continue;
        v.set(layout.positions[i * 3], layout.positions[i * 3 + 1], layout.positions[i * 3 + 2]);
        const depth = v.distanceTo(camera.position);
        v.project(camera);
        if (v.z > 1) continue;
        const sx = rect.left + ((v.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - v.y) / 2) * rect.height;
        const radius = Math.max(10, (baseSize[i] * scale.value) / depth / pixel / 2);
        const d = Math.hypot(sx - clientX, sy - clientY);
        if (d < radius && d / radius < bestScore) {
          bestScore = d / radius;
          best = data.stars[i].key;
        }
      }
      return best;
    },
    setLabels(next) {
      labels = next.map((l) => ({ ...l, v: new THREE.Vector3(...(l.rim && l.lab ? layout.place(l.lab, labelRadius(frontier.value), 0, 0) : l.position)) }));
      placeLabels();
    },
    onUserMove(cb) {
      moved.push(cb);
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      composer.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
