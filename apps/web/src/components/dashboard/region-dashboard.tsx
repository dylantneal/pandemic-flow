import { ActivityTimeseries } from "@/components/dashboard/activity-timeseries";
import { ForecastPlaceholder } from "@/components/dashboard/forecast-placeholder";
import { MethodologyCard } from "@/components/dashboard/methodology-card";
import { QualityPanel } from "@/components/dashboard/quality-panel";
import { RegionHero } from "@/components/dashboard/region-hero";
import { SiteList } from "@/components/dashboard/site-list";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import type { RegionConfig } from "@/lib/dashboard/types";
import {
  getLatestRegionMetric,
  getRegionTimeseries,
  getSiteLatestMetrics,
  getSitesForRegion,
} from "@/lib/supabase/metrics";

const CDC_NWSS_URL =
  "https://www.cdc.gov/nwss/rv/COVID19-statetrend.html";

export async function RegionDashboard({ config }: { config: RegionConfig }) {
  const [latest, timeseries, sites, totalSites] = await Promise.all([
    getLatestRegionMetric(config.regionType, config.regionId),
    getRegionTimeseries(config.regionType, config.regionId),
    getSiteLatestMetrics({
      stateTerritory: config.stateTerritory,
      countyFips: config.countyFips,
    }),
    getSitesForRegion({
      stateTerritory: config.stateTerritory,
      countyFips: config.countyFips,
      cookOnly: config.regionType === "county",
    }),
  ]);

  const latestWeek = latest?.week_start ?? sites[0]?.week_start ?? null;

  return (
    <div className="space-y-10">
      <RegionHero
        eyebrow={config.eyebrow}
        name={config.name}
        description={config.description}
        latest={latest}
      />

      <SummaryCards latest={latest} totalSites={totalSites} />

      <ActivityTimeseries data={timeseries} regionName={config.name} />

      <ForecastPlaceholder />

      <div className="grid gap-6 lg:grid-cols-2">
        <QualityPanel latest={latest} />
        <MethodologyCard
          description="Weekly metrics are derived from CDC NWSS wastewater samples, cleaned for Illinois sewersheds, and aggregated to region and site level."
          sourceLabel="CDC NWSS"
          sourceUrl={CDC_NWSS_URL}
        />
      </div>

      <SiteList sites={sites} weekStart={latestWeek} />
    </div>
  );
}
