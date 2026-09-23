/**
 * The evolution theater's particles, on one canvas: a slow starfield at rest, a spiral of sparks
 * pulled into the card while it charges, and a burst outward at the flash. Glows are pre-drawn
 * sprites blended additively, so a few hundred particles stay smooth on a phone.
 */

type Mode = 'idle' | 'charge';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  sprite: number;
  kind: 'star' | 'spark' | 'burst';
}

export interface Particles {
  setMode(mode: Mode): void;
  burst(): void;
  destroy(): void;
}

function glow(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, color);
  gradient.addColorStop(0.5, `${color}55`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** `color` is the lab's hex color; sparks mix it with gold and white. */
export function startParticles(canvas: HTMLCanvasElement, color: string): Particles {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setMode() {}, burst() {}, destroy() {} };
  const sprites = [glow(color), glow('#ffd873'), glow('#ffffff')];
  let w = 0;
  let h = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let mode: Mode = 'idle';
  let particles: Particle[] = [];
  let raf = 0;
  let last = performance.now();
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const center = () => ({ x: w / 2, y: h * 0.46 });

  const star = (): Particle => ({ x: rand(0, w), y: rand(0, h), vx: rand(-6, 6), vy: rand(-14, -4), life: 0, max: rand(3, 7), size: rand(1.5, 4), sprite: Math.random() < 0.6 ? 2 : 0, kind: 'star' });
  const spark = (): Particle => {
    const c = center();
    const angle = rand(0, Math.PI * 2);
    const radius = Math.max(w, h) * rand(0.45, 0.7);
    // Mostly sideways at first, so the sparks spiral in instead of falling straight to the middle.
    return { x: c.x + Math.cos(angle) * radius, y: c.y + Math.sin(angle) * radius, vx: -Math.sin(angle) * 140, vy: Math.cos(angle) * 140, life: 0, max: 6, size: rand(2, 6), sprite: Math.floor(rand(0, 3)), kind: 'spark' };
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const c = center();
    const want = mode === 'charge' ? 320 : 60;
    let alive = particles.filter((p) => p.kind !== 'burst').length;
    while (alive < want) {
      particles.push(mode === 'charge' ? spark() : star());
      alive++;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const next: Particle[] = [];
    for (const p of particles) {
      p.life += dt;
      if (p.kind === 'spark') {
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        // Pulled in harder as they close; the tangential push keeps them swirling.
        const pull = 900 + 60000 / d;
        p.vx = (p.vx + (dx / d) * pull * dt + (-dy / d) * 220 * dt) * 0.985;
        p.vy = (p.vy + (dy / d) * pull * dt + (dx / d) * 220 * dt) * 0.985;
        if (d < 14 || mode !== 'charge') continue;
      } else if (p.kind === 'burst') {
        p.vx *= 0.955;
        p.vy *= 0.955;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life > p.max || p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
      const fade = p.kind === 'star' ? Math.sin((p.life / p.max) * Math.PI) : p.kind === 'burst' ? 1 - p.life / p.max : Math.min(1, p.life * 3);
      ctx.globalAlpha = Math.max(0, fade) * (p.kind === 'star' ? 0.7 : 1);
      const s = p.size * (p.kind === 'burst' ? 3 : 2.4);
      ctx.drawImage(sprites[p.sprite], p.x - s, p.y - s, s * 2, s * 2);
      next.push(p);
    }
    particles = next;
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setMode(m) {
      mode = m;
    },
    burst() {
      const c = center();
      particles = particles.filter((p) => p.kind === 'star');
      for (let i = 0; i < 260; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(180, 1100);
        particles.push({ x: c.x, y: c.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, max: rand(0.8, 1.8), size: rand(1.5, 5), sprite: Math.floor(rand(0, 3)), kind: 'burst' });
      }
      mode = 'idle';
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
    },
  };
}
