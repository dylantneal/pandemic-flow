"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type SimParticle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  size: number;
  opacity: number;
  rot: number;
  rotSpeed: number;
};

type ParticlePreset = {
  count: number;
  seed: number;
  sizeMin: number;
  sizeMax: number;
  opacityMin: number;
  opacityMax: number;
};

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildSimParticles(
  preset: ParticlePreset,
  width: number,
  height: number,
): SimParticle[] {
  const rand = seededRandom(preset.seed);
  const items: SimParticle[] = [];

  for (let i = 0; i < preset.count; i++) {
    const t = rand();
    const size = preset.sizeMin + t * (preset.sizeMax - preset.sizeMin);
    const radius = size * COLLISION_RADIUS_SCALE;
    const margin = radius + 4;
    const speed = 28 + rand() * 38;
    const angle = rand() * Math.PI * 2;

    items.push({
      id: i,
      x: margin + rand() * Math.max(width - margin * 2, 1),
      y: margin + rand() * Math.max(height - margin * 2, 1),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      size,
      opacity: preset.opacityMin + rand() * (preset.opacityMax - preset.opacityMin),
      rot: rand() * 360,
      rotSpeed: (rand() > 0.5 ? 1 : -1) * (12 + rand() * 28),
    });
  }

  return items;
}

const HOME_PRESET: ParticlePreset = {
  count: 42,
  seed: 42,
  sizeMin: 24,
  sizeMax: 62,
  opacityMin: 0.16,
  opacityMax: 0.4,
};

const ABOUT_PRESET: ParticlePreset = {
  count: 28,
  seed: 91,
  sizeMin: 20,
  sizeMax: 48,
  opacityMin: 0.12,
  opacityMax: 0.32,
};

const PRESETS = {
  home: HOME_PRESET,
  about: ABOUT_PRESET,
} as const;

const RESTITUTION = 0.92;
const COLLISION_PASSES = 4;
/** SVG body + spikes reach ~36% of icon size from center (viewBox 100, envelope r=30). */
const COLLISION_RADIUS_SCALE = 0.36;

function resolveWall(p: SimParticle, width: number, height: number) {
  if (p.x - p.radius < 0) {
    p.x = p.radius;
    p.vx = Math.abs(p.vx) * RESTITUTION;
  } else if (p.x + p.radius > width) {
    p.x = width - p.radius;
    p.vx = -Math.abs(p.vx) * RESTITUTION;
  }

  if (p.y - p.radius < 0) {
    p.y = p.radius;
    p.vy = Math.abs(p.vy) * RESTITUTION;
  } else if (p.y + p.radius > height) {
    p.y = height - p.radius;
    p.vy = -Math.abs(p.vy) * RESTITUTION;
  }
}

function resolvePair(a: SimParticle, b: SimParticle) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const minDist = a.radius + b.radius;

  if (distSq >= minDist * minDist || distSq === 0) return;

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;

  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;

  const relVx = a.vx - b.vx;
  const relVy = a.vy - b.vy;
  const relDot = relVx * nx + relVy * ny;

  if (relDot <= 0) return;

  const impulse = relDot * RESTITUTION;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}

function stepSimulation(
  particles: SimParticle[],
  width: number,
  height: number,
  dt: number,
) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot = (p.rot + p.rotSpeed * dt) % 360;
    resolveWall(p, width, height);
  }

  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        resolvePair(particles[i], particles[j]);
      }
    }
  }
}

const SPIKE_ANGLES = [0, 26, 52, 78, 104, 130, 156, 182, 208, 234, 260, 286, 312, 338];

function CoronavirusIcon({ id, size }: { id: number; size: number }) {
  const uid = `v${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
      <defs>
        {/* Sphere main shading — light source upper-left */}
        <radialGradient id={`${uid}-env`} cx="32%" cy="26%" r="56%">
          <stop offset="0%"   stopColor="oklch(0.86 0.09 54)" />
          <stop offset="22%"  stopColor="oklch(0.70 0.12 50)" />
          <stop offset="55%"  stopColor="oklch(0.50 0.11 46)" />
          <stop offset="85%"  stopColor="oklch(0.33 0.08 40)" />
          <stop offset="100%" stopColor="oklch(0.22 0.05 36)" />
        </radialGradient>

        {/* Shadow overlay — darkens the lower-right half */}
        <radialGradient id={`${uid}-shade`} cx="74%" cy="73%" r="50%">
          <stop offset="0%"   stopColor="rgba(0,0,0,0.55)" />
          <stop offset="65%"  stopColor="rgba(0,0,0,0.15)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>

        {/* Specular highlight — primary 3-D cue */}
        <radialGradient id={`${uid}-spec`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(255,232,200,0.85)" />
          <stop offset="45%"  stopColor="rgba(255,215,168,0.28)" />
          <stop offset="100%" stopColor="rgba(255,200,140,0)" />
        </radialGradient>

        {/* Rim light — orange bounce from below */}
        <radialGradient id={`${uid}-rim`} cx="50%" cy="94%" r="42%">
          <stop offset="0%"   stopColor="rgba(240,105,20,0.34)" />
          <stop offset="100%" stopColor="rgba(210,65,0,0)" />
        </radialGradient>

        {/* Spike gradient */}
        <radialGradient id={`${uid}-spike`} cx="40%" cy="22%" r="72%">
          <stop offset="0%"   stopColor="oklch(0.86 0.20 47)" />
          <stop offset="50%"  stopColor="oklch(0.65 0.17 43)" />
          <stop offset="100%" stopColor="oklch(0.43 0.11 37)" />
        </radialGradient>

        {/* Glow halo */}
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ff6a1a" stopOpacity="0.55" />
          <stop offset="60%"  stopColor="#e84d00" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#c43a00" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient glow halo */}
      <circle cx="50" cy="50" r="48" fill={`url(#${uid}-glow)`} />

      {/* Spikes drawn first so body overlaps their bases */}
      {SPIKE_ANGLES.map((deg) => (
        <g key={deg} transform={`rotate(${deg} 50 50)`}>
          <path
            d="M50 14 C47 24, 47 30, 50 36 C53 30, 53 24, 50 14 Z"
            fill={`url(#${uid}-spike)`}
            opacity={0.92}
          />
          <ellipse cx="50" cy="13" rx="5.5" ry="7" fill={`url(#${uid}-spike)`} opacity={0.97} />
          {/* Lit-edge highlight streak */}
          <path
            d="M48.5 17 C48 22, 48 27, 48.5 33"
            stroke="rgba(255,215,155,0.40)"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
          <line
            x1="50" y1="36" x2="50" y2="42"
            stroke="oklch(0.60 0.13 40)"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity={0.65}
          />
        </g>
      ))}

      {/* Body: sphere base shading */}
      <circle cx="50" cy="50" r="30" fill={`url(#${uid}-env)`} opacity={0.97} />

      {/* Body: shadow-side overlay */}
      <circle cx="50" cy="50" r="30" fill={`url(#${uid}-shade)`} />

      {/* Body: rim-light bounce */}
      <circle cx="50" cy="50" r="30" fill={`url(#${uid}-rim)`} />

      {/* Surface micro-dots (dark craters, not bumps) */}
      {([
        [42, 44], [58, 46], [48, 58],
        [62, 56], [38, 54], [54, 38], [46, 62],
      ] as [number, number][]).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={1.8} fill="rgba(0,0,0,0.38)" opacity={0.55} />
      ))}

      {/* Specular highlight — the key 3-D cue */}
      <circle cx="41" cy="37" r="9.5" fill={`url(#${uid}-spec)`} />

      {/* Secondary glint */}
      <circle cx="57" cy="36" r="2.8" fill="rgba(255,245,220,0.42)" />

      {/* Mid-protein dots on spikes */}
      {[15, 75, 135, 195, 255, 315].map((deg) => (
        <g key={`m${deg}`} transform={`rotate(${deg + 12} 50 50)`}>
          <circle cx="50" cy="24" r="2.2" fill="oklch(0.72 0.14 50)" opacity={0.50} />
        </g>
      ))}
    </svg>
  );
}

export function HeroParticleField({
  variant = "home",
}: {
  variant?: keyof typeof PRESETS;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const particleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const simRef = useRef<SimParticle[]>([]);
  const boundsRef = useRef({ width: 0, height: 0 });
  const preset = PRESETS[variant];

  const displayMeta = useMemo(
    () => buildSimParticles(preset, 1000, 800),
    [preset],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    if (reduceMotion) return;

    const container = containerRef.current;
    if (!container) return;

    const paint = () => {
      const particles = simRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const el = particleRefs.current[i];
        if (!el) continue;
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) rotate(${p.rot}deg)`;
        el.style.zIndex = String(Math.round(p.y));
      }
    };

    const initSim = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return false;
      boundsRef.current = { width: rect.width, height: rect.height };
      simRef.current = buildSimParticles(preset, rect.width, rect.height);
      paint();
      return true;
    };

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      if (simRef.current.length === 0) {
        initSim();
        raf = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      const { width, height } = boundsRef.current;

      stepSimulation(simRef.current, width, height, dt);
      paint();

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    const observer = new ResizeObserver(() => {
      initSim();
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      simRef.current = [];
    };
  }, [preset, reduceMotion, displayMeta]);

  if (reduceMotion) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,oklch(0.45_0.12_45/0.2),transparent_65%)]"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <style>{`
        @keyframes covidGlow {
          0%, 100% {
            filter: drop-shadow(0 0 4px rgba(230, 90, 10, 0.25)) drop-shadow(0 0 10px rgba(200, 60, 0, 0.12));
          }
          50% {
            filter: drop-shadow(0 0 10px rgba(255, 110, 20, 0.65)) drop-shadow(0 0 22px rgba(220, 80, 0, 0.35)) drop-shadow(0 0 36px rgba(180, 50, 0, 0.15));
          }
        }
      `}</style>
      {displayMeta.map((p, index) => (
        <div
          key={p.id}
          ref={(el) => {
            particleRefs.current[index] = el;
          }}
          className="absolute left-0 top-0 will-change-transform"
          style={{
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `covidGlow ${2.8 + (p.id % 7) * 0.35}s ease-in-out infinite`,
            animationDelay: `${(p.id * 0.47) % 3}s`,
          }}
        >
          <CoronavirusIcon id={p.id} size={p.size} />
        </div>
      ))}
    </div>
  );
}
