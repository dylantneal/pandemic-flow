"use client";

import { useEffect, useState } from "react";

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  driftX: number;
  driftY: number;
  durX: number;
  durY: number;
  rotDur: number;
  /** Negative offset so animation is already in progress on first paint */
  phaseX: number;
  phaseY: number;
  phaseRot: number;
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

function buildParticles(preset: ParticlePreset): Particle[] {
  const rand = seededRandom(preset.seed);
  const items: Particle[] = [];
  for (let i = 0; i < preset.count; i++) {
    const t = rand();
    const durX = 7 + rand() * 8;
    const durY = 9 + rand() * 10;
    const rotDur = 22 + rand() * 28;
    items.push({
      id: i,
      x: 2 + rand() * 96,
      y: 2 + rand() * 96,
      size: preset.sizeMin + t * (preset.sizeMax - preset.sizeMin),
      opacity: preset.opacityMin + rand() * (preset.opacityMax - preset.opacityMin),
      driftX: 14 + rand() * 32,
      driftY: 12 + rand() * 28,
      durX,
      durY,
      rotDur,
      phaseX: -(rand() * durX),
      phaseY: -(rand() * durY),
      phaseRot: -(rand() * rotDur),
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

const PRESET_PARTICLES = {
  home: buildParticles(HOME_PRESET),
  about: buildParticles(ABOUT_PRESET),
} as const;

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

      {/* envelope */}
      <circle cx="50" cy="50" r="30" fill={`url(#${uid}-env)`} opacity={0.92} />
      {/* envelope texture */}
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

      {/* spike proteins */}
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

      {/* small envelope proteins between spikes */}
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
  variant?: keyof typeof PRESET_PARTICLES;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const particles = PRESET_PARTICLES[variant];

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (reduceMotion) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,oklch(0.45_0.12_45/0.2),transparent_65%)]"
      />
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute hero-particle-drift-x"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              "--drift-x": `${p.driftX}px`,
              "--dur-x": `${p.durX}s`,
              "--phase-x": `${p.phaseX}s`,
            } as React.CSSProperties
          }
        >
          <div
            className="hero-particle-drift-y size-full"
            style={
              {
                "--drift-y": `${p.driftY}px`,
                "--dur-y": `${p.durY}s`,
                "--phase-y": `${p.phaseY}s`,
              } as React.CSSProperties
            }
          >
            <div
              className="hero-particle-tumble size-full"
            style={
              {
                "--rot-dur": `${p.rotDur}s`,
                "--phase-rot": `${p.phaseRot}s`,
              } as React.CSSProperties
            }
          >
              <CoronavirusIcon id={p.id} size={p.size} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
