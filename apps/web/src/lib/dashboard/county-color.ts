/** Diverging activity-index fill for county chloropleth. */

export const ACTIVITY_DOMAIN = { low: -1.75, mid: 0, high: 1.0 } as const;

export const NO_DATA_FILL = "url(#pfNoDataPattern)";

/** OKLCH stops: low (cream) → mid (tan) → high (primary orange). */
const STOPS: Array<{ t: number; l: number; c: number; h: number }> = [
  { t: -1.75, l: 0.97, c: 0.02, h: 75 },
  { t: -0.75, l: 0.94, c: 0.03, h: 70 },
  { t: 0, l: 0.88, c: 0.05, h: 65 },
  { t: 0.35, l: 0.78, c: 0.1, h: 55 },
  { t: 1.0, l: 0.62, c: 0.18, h: 45 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateStops(value: number): string {
  const v = clamp(value, STOPS[0]!.t, STOPS[STOPS.length - 1]!.t);

  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i]!;
    const b = STOPS[i + 1]!;
    if (v >= a.t && v <= b.t) {
      const t = (v - a.t) / (b.t - a.t);
      const l = lerp(a.l, b.l, t);
      const c = lerp(a.c, b.c, t);
      const h = lerp(a.h, b.h, t);
      return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
    }
  }

  const last = STOPS[STOPS.length - 1]!;
  return `oklch(${last.l} ${last.c} ${last.h})`;
}

export function fillForActivity(index: number | null | undefined): string {
  if (index == null || Number.isNaN(index)) return NO_DATA_FILL;
  return interpolateStops(index);
}

export const LEGEND_GRADIENT_STOPS = STOPS.map((s) => ({
  offset: `${((s.t - ACTIVITY_DOMAIN.low) / (ACTIVITY_DOMAIN.high - ACTIVITY_DOMAIN.low)) * 100}%`,
  color: interpolateStops(s.t),
}));
