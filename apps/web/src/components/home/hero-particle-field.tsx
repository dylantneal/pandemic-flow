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
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="drop-shadow-[0_2px_12px_oklch(0.45_0.14_45/0.35)]"
    >
      <defs>
        <radialGradient id={`${uid}-env`} cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor="oklch(0.72 0.1 55)" />
          <stop offset="55%" stopColor="oklch(0.58 0.11 48)" />
          <stop offset="100%" stopColor="oklch(0.42 0.08 42)" />
        </radialGradient>
        <radialGradient id={`${uid}-spike`} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="oklch(0.78 0.2 42)" />
          <stop offset="100%" stopColor="oklch(0.55 0.16 38)" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="30" fill={`url(#${uid}-env)`} opacity={0.92} />
      {[
        [42, 44],
        [58, 46],
        [48, 58],
        [62, 56],
        [38, 54],
        [54, 38],
        [46, 62],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={1.8}
          fill="oklch(0.5 0.06 45)"
          opacity={0.35}
        />
      ))}

      {SPIKE_ANGLES.map((deg) => (
        <g key={deg} transform={`rotate(${deg} 50 50)`}>
          <path
            d="M50 14 C47 24, 47 30, 50 36 C53 30, 53 24, 50 14 Z"
            fill={`url(#${uid}-spike)`}
            opacity={0.9}
          />
          <ellipse
            cx="50"
            cy="13"
            rx="5.5"
            ry="7"
            fill={`url(#${uid}-spike)`}
            opacity={0.95}
          />
          <line
            x1="50"
            y1="36"
            x2="50"
            y2="42"
            stroke="oklch(0.62 0.14 40)"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity={0.7}
          />
        </g>
      ))}

      {[15, 75, 135, 195, 255, 315].map((deg) => (
        <g key={`m${deg}`} transform={`rotate(${deg + 12} 50 50)`}>
          <circle cx="50" cy="24" r="2.2" fill="oklch(0.7 0.14 50)" opacity={0.55} />
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
          }}
        >
          <CoronavirusIcon id={p.id} size={p.size} />
        </div>
      ))}
    </div>
  );
}
