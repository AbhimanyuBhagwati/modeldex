/**
 * One canvas for the evolution's starfield, inward energy trails, and reveal burst.
 * Glow sprites are pre-rendered; the scene stays below 210 particles at any point.
 */
export type ParticleMode = 'idle' | 'charge' | 'transform' | 'collapse' | 'reveal';

interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  speed: number;
  life: number;
  max: number;
  size: number;
  sprite: number;
  kind: 'star' | 'orbit' | 'burst';
}

export interface Particles {
  setMode(mode: ParticleMode): void;
  burst(): void;
  destroy(): void;
}

const TAU = Math.PI * 2;
const STAR_COUNT = 32;
const MAX_PARTICLES = 210;
const random = (min: number, max: number) => min + Math.random() * (max - min);

function glow(color: string, glint = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.08, '#ffffff');
  gradient.addColorStop(0.2, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  if (glint) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(32, 5);
    ctx.quadraticCurveTo(34, 29, 52, 32);
    ctx.quadraticCurveTo(34, 34, 32, 59);
    ctx.quadraticCurveTo(30, 34, 12, 32);
    ctx.quadraticCurveTo(30, 29, 32, 5);
    ctx.fill();
  }
  return canvas;
}

/** `color` is the lab's color. Gold and white punctuate the colored energy. */
export function startParticles(canvas: HTMLCanvasElement, color: string): Particles {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setMode() {}, burst() {}, destroy() {} };

  const sprites = [glow(color), glow('#ffe2a0'), glow('#ffffff'), glow('#ffe2a0', true)];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let mode: ParticleMode = 'idle';
  let particles: Particle[] = [];
  let elapsed = 0;
  let sceneTime = 0;
  let orbitAngle = 0;
  let emission = 0;
  let burstTime = -1;
  let raf = 0;
  let last = 0;
  let inView = true;
  let destroyed = false;

  const makeParticle = (kind: Particle['kind']): Particle => ({
    kind, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, radius: 0, angle: 0, speed: 0,
    life: 0, max: 1, size: 1, sprite: 0,
  });

  const star = (): Particle => {
    const p = makeParticle('star');
    p.x = random(0, width);
    p.y = random(0, height);
    p.px = p.x;
    p.py = p.y;
    p.vx = random(-2, 2);
    p.vy = random(-7, -2);
    p.max = random(3, 8);
    p.life = random(0, p.max * 0.8);
    p.size = random(1, 2.4);
    p.sprite = Math.random() > 0.86 ? 3 : 2;
    return p;
  };

  const orbit = (): Particle => {
    const p = makeParticle('orbit');
    const fieldRadius = Math.min(width * 0.52, height * 0.57);
    p.radius = fieldRadius * random(0.78, 1.18);
    p.angle = random(0, TAU);
    p.speed = random(1.3, 2.8);
    p.x = width / 2 + Math.cos(p.angle) * p.radius;
    p.y = height / 2 + Math.sin(p.angle) * p.radius * 0.78;
    p.px = p.x;
    p.py = p.y;
    p.max = 3.5;
    p.size = random(1.4, 3.2);
    p.sprite = Math.random() < 0.74 ? 0 : 1;
    return p;
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const previousWidth = width;
    const previousHeight = height;
    width = rect.width;
    height = rect.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Keep the field attached to the arena when the phone rotates or layout changes.
    if (previousWidth && previousHeight) {
      for (const p of particles) {
        p.x *= width / previousWidth;
        p.y *= height / previousHeight;
        p.px = p.x;
        p.py = p.y;
        p.radius *= Math.min(width / previousWidth, height / previousHeight);
      }
    }
  };

  const drawOrbits = () => {
    if (mode !== 'charge' && mode !== 'transform' && mode !== 'collapse') return;
    const strength = mode === 'charge' ? Math.min(1, elapsed / 0.8) * 0.45 : 0.8;
    const contraction = mode === 'collapse' ? Math.max(0.025, (1 - elapsed / 0.6) ** 3) : 1;
    const radius = Math.min(width * 0.4, height * 0.42) * contraction;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3 + sceneTime * 0.14);
      ctx.strokeStyle = i === 1 ? '#ffe2a0' : color;
      ctx.globalAlpha = strength * (mode === 'collapse' ? contraction : 1) * 0.36;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * (0.46 + i * 0.08), 0, 0, TAU);
      ctx.stroke();
      // A brighter arc moves around each faint orbit, like energy finding a path.
      ctx.globalAlpha = strength * 0.7;
      const angle = orbitAngle + i * 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * (0.46 + i * 0.08), 0, angle, angle + 0.62);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  const frame = (now: number) => {
    raf = 0;
    if (destroyed || !inView || document.hidden || motion.matches) return;
    const dt = last ? Math.min(0.04, (now - last) / 1000) : 0;
    last = now;
    elapsed += dt;
    sceneTime += dt;
    orbitAngle += dt * (mode === 'transform' ? 2.4 : 1.1);
    if (burstTime >= 0) burstTime += dt;

    const starCount = particles.reduce((count, p) => count + Number(p.kind === 'star'), 0);
    for (let i = starCount; i < STAR_COUNT; i++) particles.push(star());
    if (mode === 'charge' || mode === 'transform') {
      const rate = mode === 'charge' ? 32 + Math.min(1, elapsed / 1.5) * 65 : 120;
      emission += dt * rate;
      while (emission >= 1 && particles.length < MAX_PARTICLES) {
        particles.push(orbit());
        emission--;
      }
      emission = Math.min(emission, 1);
    }

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    drawOrbits();
    let alive = 0;
    for (const p of particles) {
      p.life += dt;
      p.px = p.x;
      p.py = p.y;
      if (p.kind === 'orbit') {
        const acceleration = mode === 'transform' ? 1.7 + Math.min(1, elapsed / 1.7) : 1;
        // Exponential convergence is stable across 60 Hz and high-refresh displays.
        const pull = mode === 'collapse' ? 8 + elapsed * 12 : mode === 'transform' ? 0.92 : 0.34;
        p.radius *= Math.exp(-pull * dt);
        p.angle += p.speed * acceleration * dt;
        p.x = width / 2 + Math.cos(p.angle) * p.radius;
        p.y = height / 2 + Math.sin(p.angle) * p.radius * 0.78;
        if (p.radius < 6) continue;
      } else {
        if (p.kind === 'burst') {
          const drag = Math.exp(-2.5 * dt);
          p.vx *= drag;
          p.vy *= drag;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.life >= p.max || p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50) continue;
      const fade = p.kind === 'star'
        ? Math.sin((p.life / p.max) * Math.PI) * 0.46
        : p.kind === 'burst'
          ? (1 - p.life / p.max) ** 1.5
          : Math.min(1, p.life * 4) * Math.min(1, (p.max - p.life) * 2);
      if (p.kind !== 'star') {
        ctx.strokeStyle = p.sprite === 0 ? color : '#ffe2a0';
        ctx.globalAlpha = fade * (p.kind === 'burst' ? 0.7 : 0.48);
        ctx.lineWidth = p.kind === 'burst' ? 1.1 : 0.75;
        ctx.beginPath();
        // A fixed temporal trail length avoids shorter streaks on 120 Hz screens.
        const trail = dt > 0 ? Math.min(5, 0.038 / dt) : 1;
        ctx.moveTo(p.x - (p.x - p.px) * trail, p.y - (p.y - p.py) * trail);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalAlpha = fade;
      const size = p.size * (p.kind === 'star' ? 2 : 3);
      ctx.drawImage(sprites[p.sprite], p.x - size, p.y - size, size * 2, size * 2);
      particles[alive++] = p;
    }
    particles.length = alive;

    if (burstTime >= 0 && burstTime < 0.9) {
      const progress = burstTime / 0.9;
      const radius = Math.min(width, height) * (0.08 + (1 - (1 - progress) ** 3) * 0.63);
      ctx.strokeStyle = '#ffe2a0';
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = (1 - progress) ** 2 * 0.72;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 0.6;
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius * 0.82, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };

  const syncPlayback = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (!destroyed && inView && !document.hidden && !motion.matches) raf = requestAnimationFrame(frame);
  };

  const onMotionChange = () => {
    if (motion.matches) {
      particles = [];
      burstTime = -1;
      ctx.clearRect(0, 0, width, height);
    }
    syncPlayback();
  };

  const resizeObserver = new ResizeObserver(resize);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncPlayback();
  });
  resizeObserver.observe(canvas);
  intersectionObserver.observe(canvas);
  document.addEventListener('visibilitychange', syncPlayback);
  motion.addEventListener('change', onMotionChange);
  resize();
  syncPlayback();

  return {
    setMode(next) {
      if (destroyed) return;
      mode = next;
      elapsed = 0;
      emission = 0;
      if (next === 'idle') {
        // Skipping or resetting must clear all transient energy immediately.
        particles = particles.filter((p) => p.kind === 'star');
        burstTime = -1;
        ctx.clearRect(0, 0, width, height);
      }
    },
    burst() {
      if (destroyed || motion.matches) return;
      mode = 'reveal';
      elapsed = 0;
      burstTime = 0;
      particles = particles.filter((p) => p.kind === 'star');
      const count = Math.min(154, MAX_PARTICLES - particles.length);
      for (let i = 0; i < count; i++) {
        const p = makeParticle('burst');
        // Even angular coverage with gentle variation makes a legible starburst.
        const angle = (i / count) * TAU + random(-0.025, 0.025);
        const speed = Math.min(width, height) * random(0.8, 2.2);
        p.x = p.px = width / 2 + Math.cos(angle) * 10;
        p.y = p.py = height / 2 + Math.sin(angle) * 10;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.max = random(0.7, 1.7);
        p.size = random(1.4, 3);
        p.sprite = i % 9 === 0 ? 3 : i % 3;
        particles.push(p);
      }
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      motion.removeEventListener('change', onMotionChange);
      particles = [];
      ctx.clearRect(0, 0, width, height);
    },
  };
}
