"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";

type SimParticle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  size: number;
  opacity: number;
  angVx: number;
  angVy: number;
  angVz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  glowPhase: number;
};

type ParticlePreset = {
  count: number;
  seed: number;
  sizeMin: number;
  sizeMax: number;
  opacityMin: number;
  opacityMax: number;
};

type ThreeSceneBundle = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  virusGroups: THREE.Group[];
  glowSprites: THREE.Sprite[];
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
      angVx: (rand() - 0.5) * 0.55,
      angVy: (rand() - 0.5) * 0.55,
      angVz: (rand() - 0.5) * 0.55,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      glowPhase: rand() * Math.PI * 2,
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
const ANGULAR_DAMPING = 0.992;
const TORQUE_SCALE = 0.28;
const MAX_ANGULAR_SPEED = 2.4;
/** SVG body + spikes reach ~36% of icon size from center (viewBox 100, envelope r=30). */
const COLLISION_RADIUS_SCALE = 0.36;
const SPIKE_COUNT = 24;

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

function resolvePair(a: SimParticle, b: SimParticle, applyTorque: boolean) {
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

  if (applyTorque) {
    const torque = Math.abs(relDot) * TORQUE_SCALE;
    const ax = (Math.random() - 0.5) * torque;
    const ay = (Math.random() - 0.5) * torque;
    const az = (Math.random() - 0.5) * torque;
    a.angVx += ax;
    a.angVy += ay;
    a.angVz += az;
    b.angVx -= ax;
    b.angVy -= ay;
    b.angVz -= az;

    clampAngularVelocity(a);
    clampAngularVelocity(b);
  }
}

function clampAngularVelocity(p: SimParticle) {
  const speed = Math.hypot(p.angVx, p.angVy, p.angVz);
  if (speed > MAX_ANGULAR_SPEED) {
    const scale = MAX_ANGULAR_SPEED / speed;
    p.angVx *= scale;
    p.angVy *= scale;
    p.angVz *= scale;
  }
}

function integrateQuaternion(p: SimParticle, dt: number) {
  const halfDt = dt / 2;
  const { angVx, angVy, angVz, qx, qy, qz, qw } = p;

  p.qx += halfDt * (angVx * qw + angVy * qz - angVz * qy);
  p.qy += halfDt * (-angVx * qz + angVy * qw + angVz * qx);
  p.qz += halfDt * (angVx * qy - angVy * qx + angVz * qw);
  p.qw += halfDt * (-angVx * qx - angVy * qy - angVz * qz);

  const len = Math.hypot(p.qx, p.qy, p.qz, p.qw) || 1;
  p.qx /= len;
  p.qy /= len;
  p.qz /= len;
  p.qw /= len;
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

    p.angVx *= ANGULAR_DAMPING;
    p.angVy *= ANGULAR_DAMPING;
    p.angVz *= ANGULAR_DAMPING;
    clampAngularVelocity(p);
    integrateQuaternion(p, dt);

    resolveWall(p, width, height);
  }

  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        resolvePair(particles[i], particles[j], pass === 0);
      }
    }
  }
}

function fibonacciSphereNormals(count: number): THREE.Vector3[] {
  const normals: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    normals.push(
      new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize(),
    );
  }

  return normals;
}

function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255, 110, 30, 0.85)");
    gradient.addColorStop(0.45, "rgba(230, 80, 10, 0.35)");
    gradient.addColorStop(1, "rgba(180, 50, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function buildVirusGroup(glowTexture: THREE.Texture): {
  group: THREE.Group;
  glowSprite: THREE.Sprite;
} {
  const group = new THREE.Group();

  const envelopeMat = new THREE.MeshPhongMaterial({
    color: 0x8b3a0f,
    emissive: 0x3d1500,
    shininess: 60,
    transparent: true,
    opacity: 0.92,
  });
  const envelope = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), envelopeMat);
  group.add(envelope);

  const spikeMat = new THREE.MeshPhongMaterial({
    color: 0xc45010,
    emissive: 0x5a1800,
    shininess: 80,
  });

  // Spike length ~¼–⅓ of envelope radius (reference proportions)
  const stalkGeom = new THREE.CylinderGeometry(0.04, 0.07, 0.14, 8);
  const tipGeom = new THREE.SphereGeometry(0.1, 10, 8);

  for (const normal of fibonacciSphereNormals(SPIKE_COUNT)) {
    const spike = new THREE.Group();
    const stalk = new THREE.Mesh(stalkGeom, spikeMat);
    stalk.position.y = 0.07;
    spike.add(stalk);

    const tip = new THREE.Mesh(tipGeom, spikeMat);
    tip.position.y = 0.19;
    tip.scale.set(1, 0.55, 1);
    spike.add(tip);

    const outward = normal.clone();
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
    spike.position.copy(outward);
    group.add(spike);
  }

  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.45,
  });
  const glowSprite = new THREE.Sprite(glowMat);
  glowSprite.scale.set(3.2, 3.2, 1);
  glowSprite.renderOrder = -1;
  group.add(glowSprite);

  return { group, glowSprite };
}

function buildThreeScene(
  canvas: HTMLCanvasElement,
  particles: SimParticle[],
  width: number,
  height: number,
): ThreeSceneBundle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const halfW = width / 2;
  const halfH = height / 2;
  const camera = new THREE.OrthographicCamera(
    -halfW,
    halfW,
    halfH,
    -halfH,
    -1000,
    1000,
  );
  camera.position.z = 500;

  scene.add(new THREE.AmbientLight(0x8b4513, 0.6));
  const dirLight = new THREE.DirectionalLight(0xff7722, 1.2);
  dirLight.position.set(halfW * 0.3, halfH * 0.5, 400);
  scene.add(dirLight);

  const glowTexture = createGlowTexture();
  const virusGroups: THREE.Group[] = [];
  const glowSprites: THREE.Sprite[] = [];

  for (const p of particles) {
    const { group, glowSprite } = buildVirusGroup(glowTexture);
    const scale = p.size / 2;
    group.scale.setScalar(scale);
    group.userData.particleId = p.id;
    virusGroups.push(group);
    glowSprites.push(glowSprite);
    scene.add(group);
  }

  return { renderer, scene, camera, virusGroups, glowSprites };
}

function disposeThreeScene(bundle: ThreeSceneBundle | null) {
  if (!bundle) return;

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  bundle.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      geometries.add(obj.geometry);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => materials.add(m));
    }
    if (obj instanceof THREE.Sprite) {
      materials.add(obj.material);
    }
  });

  const glowMap = bundle.glowSprites[0]?.material.map;
  if (glowMap) glowMap.dispose();

  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  bundle.renderer.dispose();
}

export function HeroParticleField({
  variant = "home",
}: {
  variant?: keyof typeof PRESETS;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SimParticle[]>([]);
  const threeRef = useRef<ThreeSceneBundle | null>(null);
  const boundsRef = useRef({ width: 0, height: 0 });
  const preset = PRESETS[variant];

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
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncThree = (now: number) => {
      const bundle = threeRef.current;
      const particles = simRef.current;
      if (!bundle || particles.length === 0) return;

      const { width, height } = boundsRef.current;
      const halfW = width / 2;
      const halfH = height / 2;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const group = bundle.virusGroups[i];
        const glow = bundle.glowSprites[i];
        if (!group || !glow) continue;

        group.position.set(p.x - halfW, halfH - p.y, 0);
        group.quaternion.set(p.qx, p.qy, p.qz, p.qw);
        group.renderOrder = Math.round(p.y);

        group.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            child.material instanceof THREE.MeshPhongMaterial
          ) {
            child.material.opacity = p.opacity * 0.92;
          }
        });

        const mat = glow.material as THREE.SpriteMaterial;
        mat.opacity =
          p.opacity * (0.35 + 0.35 * (0.5 + 0.5 * Math.sin(now * 0.002 + p.glowPhase)));
      }

      bundle.renderer.render(bundle.scene, bundle.camera);
    };

    const initSim = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return false;

      boundsRef.current = { width: rect.width, height: rect.height };
      simRef.current = buildSimParticles(preset, rect.width, rect.height);

      if (threeRef.current) {
        disposeThreeScene(threeRef.current);
        threeRef.current = null;
      }

      threeRef.current = buildThreeScene(
        canvas,
        simRef.current,
        rect.width,
        rect.height,
      );

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
      syncThree(now);

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
      disposeThreeScene(threeRef.current);
      threeRef.current = null;
      simRef.current = [];
    };
  }, [preset, reduceMotion]);

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
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
