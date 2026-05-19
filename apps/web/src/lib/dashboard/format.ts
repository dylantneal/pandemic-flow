import type { TrendLabel } from "@/lib/dashboard/types";

/** Activity index is roughly -1 (low) to +1 (high) vs historical baseline. */
export function formatActivityIndex(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

export function formatPercentChange(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatWeekDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatPopulation(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

export function formatQualityScore(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function trendLabelText(label: TrendLabel): string {
  switch (label) {
    case "rising":
      return "Rising";
    case "falling":
      return "Falling";
    case "stable":
      return "Stable";
    default:
      return "Insufficient data";
  }
}

export function parseQualityFlags(flags: unknown): string[] {
  if (Array.isArray(flags)) {
    return flags.filter((f): f is string => typeof f === "string");
  }
  return [];
}
