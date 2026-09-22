import { useId } from 'react';

const W = 250;
const H = 350;
const CX = W / 2;
const CY = H / 2;
const TAU = Math.PI * 2;
const f = (n: number) => Math.round(n * 10) / 10;

/** Spiral blades of the vortex, computed once: the same back sits behind every card. */
const BLADES = Array.from({ length: 18 }, (_, i) => {
  const a0 = (i / 18) * TAU;
  const width = (TAU / 18) * 0.46;
  const edge = (offset: number) => {
    const pts: string[] = [];
    for (let r = 26; r <= 250; r += 16) {
      const a = a0 + offset + (r - 26) * 0.0115;
      pts.push(`${f(CX + Math.cos(a) * r)} ${f(CY + Math.sin(a) * r)}`);
    }
    return pts;
  };
  const d = `M${edge(0).join('L')}L${edge(width).reverse().join('L')}Z`;
  return { d, strong: i % 2 === 0 };
});

const star = (x: number, y: number, R: number) => {
  const k = R * 0.16;
  return `M${x} ${y - R}Q${x + k} ${y - k} ${x + R} ${y}Q${x + k} ${y + k} ${x} ${y + R}Q${x - k} ${y + k} ${x - R} ${y}Q${x - k} ${y - k} ${x} ${y - R}Z`;
};

/**
 * The back of every card: an AI core orb with orbits on a blue vortex.
 * Drawn in one SVG so it scales with the card and needs no image files.
 */
export function CardBack() {
  const id = useId().replace(/:/g, '');
  const g = (name: string) => `${id}-${name}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g('frame')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a4fb8" />
          <stop offset="0.5" stopColor="#1c2766" />
          <stop offset="1" stopColor="#0d1238" />
        </linearGradient>
        <radialGradient id={g('panel')} cx="50%" cy="50%" r="65%">
          <stop offset="0" stopColor="#4a6cf0" />
          <stop offset="0.45" stopColor="#2437a0" />
          <stop offset="1" stopColor="#0b1033" />
        </radialGradient>
        <radialGradient id={g('orb')} cx="36%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.28" stopColor="#ffe28e" />
          <stop offset="0.62" stopColor="#f5c542" />
          <stop offset="1" stopColor="#9c6a08" />
        </radialGradient>
        <radialGradient id={g('halo')} cx="50%" cy="50%" r="50%">
          <stop offset="0.55" stopColor="#ffe28e" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe28e" stopOpacity="0" />
        </radialGradient>
        <clipPath id={g('clip')}>
          <rect x="11" y="11" width={W - 22} height={H - 22} rx="8" />
        </clipPath>
      </defs>

      <rect width={W} height={H} rx="13" fill={`url(#${g('frame')})`} />
      <rect x="6" y="6" width={W - 12} height={H - 12} rx="10" fill="none" stroke="#f5c542" strokeOpacity="0.55" strokeWidth="1" />
      <rect x="11" y="11" width={W - 22} height={H - 22} rx="8" fill={`url(#${g('panel')})`} />

      <g clipPath={`url(#${g('clip')})`}>
        {BLADES.map((b, i) => (
          <path key={i} d={b.d} fill="#ffffff" fillOpacity={b.strong ? 0.075 : 0.035} />
        ))}
        {[70, 102, 136].map((r) => (
          <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="#c9d4ff" strokeOpacity="0.16" strokeWidth="0.8" />
        ))}
      </g>

      <circle cx={CX} cy={CY} r="74" fill={`url(#${g('halo')})`} />
      <g fill="none" stroke="#ffe9a8" strokeLinecap="round">
        <ellipse cx={CX} cy={CY} rx="78" ry="20" transform={`rotate(-24 ${CX} ${CY})`} strokeWidth="1.6" strokeOpacity="0.85" />
        <ellipse cx={CX} cy={CY} rx="78" ry="20" transform={`rotate(24 ${CX} ${CY})`} strokeWidth="1.2" strokeOpacity="0.55" />
      </g>
      <circle cx={CX} cy={CY} r="44" fill={`url(#${g('orb')})`} stroke="#7a5206" strokeOpacity="0.5" strokeWidth="1" />
      <ellipse cx={CX - 14} cy={CY - 17} rx="15" ry="9" fill="#ffffff" fillOpacity="0.45" transform={`rotate(-28 ${CX - 14} ${CY - 17})`} />
      <path d={star(CX, CY, 20)} fill="#ffffff" />
      <path d={star(CX, CY, 20)} fill="none" stroke="#b8860b" strokeOpacity="0.45" strokeWidth="0.8" />
      <circle cx={CX + 70} cy={CY - 30} r="3.4" fill="#fff6d6" />
      <circle cx={CX - 66} cy={CY + 36} r="2.6" fill="#fff6d6" fillOpacity="0.85" />

      <text
        x={CX}
        y="62"
        textAnchor="middle"
        fill="#f5c542"
        style={{ font: '900 25px var(--f-sans)', fontStretch: '125%', letterSpacing: '0.02em' }}
      >
        MODELDEX
      </text>
      <text x={CX} y="78" textAnchor="middle" fill="#c9d4ff" fillOpacity="0.75" style={{ font: '500 7px var(--f-mono)', letterSpacing: '0.24em' }}>
        AI TRADING CARD
      </text>
      <text x={CX} y="302" textAnchor="middle" fill="#c9d4ff" fillOpacity="0.7" style={{ font: '500 6.6px var(--f-mono)', letterSpacing: '0.2em' }}>
        EVERY MODEL · DEALT AS A CARD
      </text>
      <path d={star(CX, 318, 4)} fill="#f5c542" />
    </svg>
  );
}
