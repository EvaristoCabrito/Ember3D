/** Lightweight CPU-side particle pool for the two elements that need discrete motes rather
 * than a pure shader fill: fire embers and holy's slow-rising motes with motion-blur trails.
 * Kept deliberately small (particle counts are capped) — each is one small billboard draw
 * using the shared PARTICLE program, so instance count only ever affects draw-call count,
 * never program switches or FBO binds. */

import type { ElementKind } from "./params";

export interface FxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: [number, number, number];
}

const MAX_PARTICLES_PER_EMITTER = 28;

export class ParticleEmitter {
  particles: FxParticle[] = [];
  private spawnAccum = 0;

  constructor(private kind: Extract<ElementKind, "fire" | "holy" | "lightning" | "acid">) {}

  update(dt: number, anchorX: number, anchorY: number, radiusPx: number, color: [number, number, number], rate = 10): void {
    this.spawnAccum += dt * rate;
    while (this.spawnAccum >= 1 && this.particles.length < MAX_PARTICLES_PER_EMITTER) {
      this.spawnAccum -= 1;
      this.spawn(anchorX, anchorY, radiusPx, color);
    }
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (this.kind === "fire" || this.kind === "acid") p.vy -= 6 * dt;
      if (this.kind === "lightning") {
        p.vx *= Math.max(0, 1 - 3.5 * dt);
        p.vy += 80 * dt;
      }
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  private spawn(anchorX: number, anchorY: number, radiusPx: number, color: [number, number, number]): void {
    const spread = radiusPx * 0.6;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * spread;
    const x = anchorX + Math.cos(angle) * r;
    const y = anchorY + Math.sin(angle) * r * 0.5;
    if (this.kind === "fire") {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 24,
        vy: -40 - Math.random() * 50,
        age: 0,
        life: 0.6 + Math.random() * 0.5,
        size: radiusPx * (0.08 + Math.random() * 0.08),
        color,
      });
    } else if (this.kind === "acid") {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 18,
        vy: -22 - Math.random() * 28,
        age: 0,
        life: 0.45 + Math.random() * 0.4,
        size: radiusPx * (0.05 + Math.random() * 0.07),
        color: Math.random() > 0.45 ? [0.75, 1, 0.3] : color,
      });
    } else if (this.kind === "lightning") {
      const a = -Math.PI * 0.15 + Math.random() * Math.PI * 1.3;
      const spd = 90 + Math.random() * 160;
      this.particles.push({
        x: anchorX + (Math.random() - 0.5) * radiusPx * 0.15,
        y: anchorY + (Math.random() - 0.5) * radiusPx * 0.08,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.35 - 40,
        age: 0,
        life: 0.12 + Math.random() * 0.22,
        size: radiusPx * (0.03 + Math.random() * 0.05),
        color: [0.85, 0.93, 1],
      });
    } else {
      this.particles.push({
        x: anchorX + (Math.random() - 0.5) * radiusPx * 0.8,
        y: anchorY + radiusPx * (0.4 + Math.random() * 0.4),
        vx: (Math.random() - 0.5) * 6,
        vy: -18 - Math.random() * 14,
        age: 0,
        life: 1.4 + Math.random() * 0.8,
        size: radiusPx * (0.05 + Math.random() * 0.05),
        color,
      });
    }
  }

  clear(): void {
    this.particles = [];
  }
}
