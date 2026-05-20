import { TrendChip } from "@/components/dashboard/trend-chip";
import {
  formatActivityIndex,
  formatPercentChange,
  formatWeekDate,
} from "@/lib/dashboard/format";
import type { RegionMetricRow } from "@/lib/dashboard/types";

export function RegionCompactIntro({
  eyebrow,
  name,
  description,
  latest,
}: {
  eyebrow: string;
  name: string;
  description: string;
  latest: RegionMetricRow | null;
}) {
  const activity =
    latest?.weighted_activity_index ?? latest?.median_activity_index;

  return (
    <header className="flex flex-col gap-4 border-b border-border/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{name}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {latest ? (
        <div className="flex shrink-0 flex-wrap items-center gap-4 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground">Activity index</p>
            <p className="text-2xl font-semibold text-primary tabular-nums">
              {formatActivityIndex(activity)}
            </p>
          </div>
          <div className="h-8 w-px bg-border" aria-hidden />
          <div>
            <p className="text-xs text-muted-foreground">Week over week</p>
            <p className="text-sm font-medium tabular-nums">
              {formatPercentChange(latest.week_over_week_change)}
            </p>
          </div>
          <TrendChip label={latest.trend_label} />
          <span className="text-xs text-muted-foreground">
            {formatWeekDate(latest.week_start)}
          </span>
        </div>
      ) : null}
    </header>
  );
}
