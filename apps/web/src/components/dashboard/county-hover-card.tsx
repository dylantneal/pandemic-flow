import { TrendChip } from "@/components/dashboard/trend-chip";
import {
  formatActivityIndex,
  formatPercentChange,
  formatPopulation,
  formatQualityScore,
  formatShortDate,
  formatWeekDate,
} from "@/lib/dashboard/format";
import type { CountyMapAggregate } from "@/lib/dashboard/county-aggregate";

export function CountyHoverCardContent({
  countyName,
  aggregate,
  weekStart,
}: {
  countyName: string;
  aggregate: CountyMapAggregate | null;
  weekStart: string | null;
}) {
  if (!aggregate) {
    return (
      <div className="space-y-2">
        <p className="font-semibold text-foreground">{countyName} County</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          No NWSS sewersheds reported in this county for the week of{" "}
          {weekStart ? formatWeekDate(weekStart) : "the latest period"}. Wastewater
          viral load is not directly measured here; neutral map shading means
          absence of NWSS reporting in that county, not low community activity.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-foreground">{countyName} County</p>
        <TrendChip label={aggregate.trendLabel} className="text-xs" />
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Activity index</p>
        <p className="text-2xl font-semibold text-primary tabular-nums">
          {formatActivityIndex(aggregate.activityIndex)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Week over week</dt>
          <dd className="font-medium tabular-nums">
            {formatPercentChange(aggregate.wowChange)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Quality score</dt>
          <dd className="font-medium tabular-nums">
            {formatQualityScore(aggregate.qualityScore)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Coverage</dt>
          <dd className="font-medium">
            {aggregate.contributingSiteCount} sewershed
            {aggregate.contributingSiteCount === 1 ? "" : "s"} reporting
            {aggregate.populationCovered > 0
              ? ` · ${formatPopulation(aggregate.populationCovered)} population represented`
              : ""}
          </dd>
        </div>
        {aggregate.latestSampleDate ? (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Latest sample</dt>
            <dd className="font-medium">
              {formatShortDate(aggregate.latestSampleDate)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
