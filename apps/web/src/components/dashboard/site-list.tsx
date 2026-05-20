import { TrendChip } from "@/components/dashboard/trend-chip";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatActivityIndex,
  formatPercentChange,
  formatQualityScore,
  formatShortDate,
} from "@/lib/dashboard/format";
import type { SiteMetricRow } from "@/lib/dashboard/types";

export function SiteList({
  sites,
  weekStart,
  totalInRegistry,
}: {
  sites: SiteMetricRow[];
  weekStart: string | null;
  totalInRegistry?: number;
}) {
  const weekLabel = weekStart ? formatShortDate(weekStart) : "—";
  const caption =
    totalInRegistry != null && totalInRegistry > 0
      ? `${sites.length} of ${totalInRegistry} sewersheds reported for the week of ${weekLabel}. Sorted by activity index (highest first).`
      : `${sites.length} sewersheds with data for the week of ${weekLabel}. Sorted by activity index.`;

  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardContent className="overflow-x-auto pt-6">
        <p className="mb-4 text-sm text-muted-foreground">{caption}</p>
        {sites.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No site-level rows for this region in the latest pipeline run. Region
            aggregates may still update when sewershed coverage is partial.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Site ID</th>
                <th className="pb-3 pr-4 font-medium">Counties served</th>
                <th className="pb-3 pr-4 font-medium text-right">Activity</th>
                <th className="pb-3 pr-4 font-medium text-right">WoW</th>
                <th className="pb-3 pr-4 font-medium">Trend</th>
                <th className="pb-3 pr-4 font-medium text-right">Quality</th>
                <th className="pb-3 font-medium text-right">Last sample</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  key={site.site_id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="py-3 pr-4 font-mono text-xs">{site.site_id}</td>
                  <td className="max-w-[220px] truncate py-3 pr-4 text-muted-foreground">
                    {site.counties_served ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-right font-medium text-primary tabular-nums">
                    {formatActivityIndex(site.activity_index)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatPercentChange(site.week_over_week_change)}
                  </td>
                  <td className="py-3 pr-4">
                    <TrendChip label={site.trend_label} className="text-xs" />
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatQualityScore(site.quality_score)}
                  </td>
                  <td className="py-3 text-right text-muted-foreground">
                    {formatShortDate(site.latest_sample_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
