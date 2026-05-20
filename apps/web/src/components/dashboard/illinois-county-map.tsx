import {
  AccentCard,
  AccentCardContent,
} from "@/components/dashboard/accent-card";
import { IllinoisCountyMapClient } from "@/components/dashboard/illinois-county-map.client";
import { buildIllinoisCountyMapFeatures } from "@/lib/dashboard/illinois-map-geometry";
import type { SiteMetricRow } from "@/lib/dashboard/types";

export async function IllinoisCountyMap({
  sites,
  weekStart,
}: {
  sites: SiteMetricRow[];
  weekStart: string | null;
}) {
  const { features, width, height } = await buildIllinoisCountyMapFeatures(sites);

  return (
    <AccentCard className="overflow-hidden">
      <AccentCardContent className="px-4 pb-6 pt-4 sm:px-6">
        <IllinoisCountyMapClient
          features={features}
          width={width}
          height={height}
          weekStart={weekStart}
        />
      </AccentCardContent>
    </AccentCard>
  );
}
