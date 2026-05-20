import { ActivityTimeseries } from "@/components/dashboard/activity-timeseries";
import { ForecastPlaceholder } from "@/components/dashboard/forecast-placeholder";
import { IndexExplainer } from "@/components/dashboard/index-explainer";
import { IllinoisCountyMap } from "@/components/dashboard/illinois-county-map";
import { MethodologyCard } from "@/components/dashboard/methodology-card";
import { QualityPanel } from "@/components/dashboard/quality-panel";
import { RegionCompactIntro } from "@/components/dashboard/region-compact-intro";
import { RegionHero } from "@/components/dashboard/region-hero";
import { SiteList } from "@/components/dashboard/site-list";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { illinoisMapIntro } from "@/lib/copy/site-copy";
import { formatWeekDate } from "@/lib/dashboard/format";
import type { RegionConfig } from "@/lib/dashboard/types";
import {
  getLatestRegionMetric,
  getRegionTimeseries,
  getSiteHistoricalMetrics,
  getSiteLatestMetrics,
  getSitesForRegion,
} from "@/lib/supabase/metrics";

const CDC_NWSS_URL = "https://www.cdc.gov/nwss/";

export async function RegionDashboard({ config }: { config: RegionConfig }) {
  const cookOnly = config.regionType === "county";
  const isIllinois = config.slug === "illinois";

  const [latest, timeseries, sites, totalSites, historicalSites] = await Promise.all([
    getLatestRegionMetric(config.regionType, config.regionId),
    getRegionTimeseries(config.regionType, config.regionId),
    getSiteLatestMetrics({ cookCountyOnly: cookOnly }),
    getSitesForRegion({ cookCountyOnly: cookOnly }),
    isIllinois ? getSiteHistoricalMetrics({ fromDate: "2021-11-22" }) : Promise.resolve([]),
  ]);

  const latestWeek = latest?.week_start ?? sites[0]?.week_start ?? null;
  const reportingCount = sites.length || latest?.active_site_count;

  if (isIllinois) {
    return (
      <div className="space-y-12">
        <RegionCompactIntro
          eyebrow={config.eyebrow}
          name={config.name}
          description={config.description}
          latest={latest}
        />

        <section className="space-y-4" aria-labelledby="county-map-heading">
          <div>
            <h2
              id="county-map-heading"
              className="text-lg font-semibold tracking-tight"
            >
              County map
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {illinoisMapIntro}
              {latestWeek
                ? ` Data for the week of ${formatWeekDate(latestWeek)}.`
                : ""}
            </p>
          </div>
          <IllinoisCountyMap
            sites={sites}
            weekStart={latestWeek}
            historicalSites={historicalSites}
          />
        </section>

        <section className="space-y-6" aria-labelledby="metrics-heading">
          <h2 id="metrics-heading" className="sr-only">
            Current metrics
          </h2>
          <SummaryCards
            latest={latest}
            totalSites={totalSites}
            reportingThisWeek={reportingCount ?? undefined}
          />
          <IndexExplainer />
        </section>

        <section className="space-y-4" aria-labelledby="trend-heading">
          <div>
            <h2
              id="trend-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Historical trend
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Weekly wastewater signal for {config.name} from CDC NWSS samples
              after cleaning and quality review.
            </p>
          </div>
          <ActivityTimeseries data={timeseries} regionName={config.name} />
        </section>

        <section
          className="grid gap-6 lg:grid-cols-2"
          aria-labelledby="quality-heading"
        >
          <h2 id="quality-heading" className="sr-only">
            Quality and provenance
          </h2>
          <QualityPanel latest={latest} />
          <MethodologyCard
            title="Data provenance"
            description="Metrics are rebuilt each week from CDC NWSS open data. We harmonize sewershed identifiers, apply Illinois cleaning rules, and roll samples up to site and region level."
            sourceLabel="CDC NWSS program"
            sourceUrl={CDC_NWSS_URL}
          />
        </section>

        <ForecastPlaceholder />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <RegionHero
        eyebrow={config.eyebrow}
        name={config.name}
        description={config.description}
        latest={latest}
      />

      <section className="space-y-6" aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Current metrics
        </h2>
        <SummaryCards
          latest={latest}
          totalSites={totalSites}
          reportingThisWeek={reportingCount ?? undefined}
        />
        <IndexExplainer />
      </section>

      <section className="space-y-4" aria-labelledby="trend-heading">
        <div>
          <h2
            id="trend-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Historical trend
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Weekly community wastewater signal for {config.name}, aggregated from
            CDC NWSS sewershed samples after cleaning and quality review.
          </p>
        </div>
        <ActivityTimeseries data={timeseries} regionName={config.name} />
      </section>

      <section className="space-y-4" aria-labelledby="sites-heading">
        <div>
          <h2 id="sites-heading" className="text-lg font-semibold tracking-tight">
            Sewershed sites
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Site-level activity for the latest reporting week. Each row is one
            wastewater monitoring location connected to the public sewer network.
          </p>
        </div>
        <SiteList
          sites={sites}
          weekStart={latestWeek}
          totalInRegistry={totalSites}
        />
      </section>

      <section
        className="grid gap-6 lg:grid-cols-2"
        aria-labelledby="quality-heading"
      >
        <h2 id="quality-heading" className="sr-only">
          Quality and provenance
        </h2>
        <QualityPanel latest={latest} />
        <MethodologyCard
          title="Data provenance"
          description="Metrics are rebuilt each week from CDC NWSS open data. We harmonize sewershed identifiers, apply Illinois-focused cleaning rules, and roll samples up to the site and region level before publishing to this dashboard."
          sourceLabel="CDC NWSS program"
          sourceUrl={CDC_NWSS_URL}
        />
      </section>

      <ForecastPlaceholder />
    </div>
  );
}
