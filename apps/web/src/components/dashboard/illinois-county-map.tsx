import {
  AccentCard,
  AccentCardContent,
} from "@/components/dashboard/accent-card";
import { IllinoisCountyMapClient } from "@/components/dashboard/illinois-county-map.client";
import {
  buildWeeklyCountySnapshots,
} from "@/lib/dashboard/illinois-map-geometry";
import type { SiteMetricRow } from "@/lib/dashboard/types";

export async function IllinoisCountyMap({
  sites,
  weekStart,
  historicalSites,
}: {
  sites: SiteMetricRow[];
  weekStart: string | null;
  /** All historical rows (from getSiteHistoricalMetrics) */
  historicalSites: SiteMetricRow[];
}) {
  const { snapshots, pathsByFips, width, height } =
    await buildWeeklyCountySnapshots(historicalSites.length > 0 ? historicalSites : sites);

  return (
    <AccentCard className="overflow-hidden">
      <AccentCardContent className="px-4 pb-6 pt-4 sm:px-6">
        <IllinoisCountyMapClient
          snapshots={snapshots}
          pathsByFips={pathsByFips}
          width={width}
          height={height}
          currentWeek={weekStart}
        />
      </AccentCardContent>
    </AccentCard>
  );
}
