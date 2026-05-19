import { TrendChip } from "@/components/dashboard/trend-chip";
import {
  formatActivityIndex,
  formatPercentChange,
  formatWeekDate,
} from "@/lib/dashboard/format";
import type { RegionMetricRow } from "@/lib/dashboard/types";

export function RegionHero({
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
  const activity = latest?.weighted_activity_index ?? latest?.median_activity_index;
  const wow = latest?.week_over_week_change;

  return (
    <header className="space-y-4 border-b border-border/80 pb-8">
      <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
        {eyebrow}
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {name}
          </h1>
          <p className="max-w-2xl text-muted-foreground">{description}</p>
        </div>
        {latest ? (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="text-right sm:text-right">
              <p className="text-xs text-muted-foreground">Activity index</p>
              <p className="text-4xl font-semibold tracking-tight text-primary tabular-nums">
                {formatActivityIndex(activity)}
              </p>
              <p className="text-sm text-muted-foreground">
                Week over week{" "}
                <span className="font-medium text-foreground">
                  {formatPercentChange(wow)}
                </span>
              </p>
            </div>
            <TrendChip label={latest.trend_label} />
            <p className="text-xs text-muted-foreground">
              Updated {formatWeekDate(latest.week_start)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No metrics available yet.</p>
        )}
      </div>
    </header>
  );
}
