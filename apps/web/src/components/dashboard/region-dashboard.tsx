import { ActivityTimeseries } from "@/components/dashboard/activity-timeseries";
import { ForecastSection } from "@/components/dashboard/forecast-section";
import { IndexExplainer } from "@/components/dashboard/index-explainer";
import { IllinoisCountyMap } from "@/components/dashboard/illinois-county-map";
import { MethodologyCard } from "@/components/dashboard/methodology-card";
import { QualityPanel } from "@/components/dashboard/quality-panel";
import { RegionCompactIntro } from "@/components/dashboard/region-compact-intro";
import { RegionHero } from "@/components/dashboard/region-hero";
import { SiteList } from "@/components/dashboard/site-list";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { RegionSectionNav } from "@/components/dashboard/region-section-nav";
import {
  dataProvenanceDescription,
  illinoisMapIntro,
} from "@/lib/copy/site-copy";
import { formatWeekDate } from "@/lib/dashboard/format";
import type { RegionConfig } from "@/lib/dashboard/types";
import {
  getLatestRegionMetric,
  getRegionTimeseries,
  getSiteHistoricalMetrics,
  getSiteLatestMetrics,
  getSitesForRegion,
} from "@/lib/supabase/metrics";
import { getRegionForecastsBundle } from "@/lib/supabase/forecasts";

const CDC_NWSS_URL = "https://www.cdc.gov/nwss/";

export async function RegionDashboard({ config }: { config: RegionConfig }) {
  const cookOnly = config.regionType === "county";
  const isIllinois = config.slug === "illinois";

  const [latest, timeseries, sites, totalSites, historicalSites, forecastBundle] =
    await Promise.all([
      getLatestRegionMetric(config.regionType, config.regionId),
      getRegionTimeseries(config.regionType, config.regionId),
      getSiteLatestMetrics({ cookCountyOnly: cookOnly }),
      getSitesForRegion({ cookCountyOnly: cookOnly }),
      isIllinois
        ? getSiteHistoricalMetrics({ fromDate: "2021-11-22" })
        : Promise.resolve([]),
      getRegionForecastsBundle(config.regionType, config.regionId),
    ]);

  const latestWeek = latest?.week_start ?? sites[0]?.week_start ?? null;
  const reportingCount = sites.length || latest?.active_site_count;

  const illinoisSections = [
    { id: "county-map-heading", label: "County map" },
    { id: "metrics-heading", label: "Metrics" },
    { id: "trend-heading", label: "Trend" },
    { id: "quality-heading", label: "Quality" },
    { id: "forecast-heading", label: "Forecast" },
  ];

  const cookSections = [
    { id: "metrics-heading", label: "Metrics" },
    { id: "trend-heading", label: "Trend" },
    { id: "sites-heading", label: "Sites" },
    { id: "quality-heading", label: "Quality" },
    { id: "forecast-heading", label: "Forecast" },
  ];

  if (isIllinois) {
    return (
      <div className="space-y-12">
        <RegionSectionNav sections={illinoisSections} />
        <RegionCompactIntro
          eyebrow={config.eyebrow}
          name={config.name}
          description={config.description}
          latest={latest}
        />

        <section
          id="county-map-heading"
          className="scroll-mt-24 space-y-4"
          aria-labelledby="county-map-title"
        >
          <div>
            <h2
              id="county-map-title"
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

        <section
          id="metrics-heading"
          className="scroll-mt-24 space-y-6"
          aria-labelledby="metrics-heading-label"
        >
          <h2 id="metrics-heading-label" className="sr-only">
            Current metrics
          </h2>
          <SummaryCards
            latest={latest}
            totalSites={totalSites}
            reportingThisWeek={reportingCount ?? undefined}
          />
          <IndexExplainer />
        </section>

        <section
          id="trend-heading"
          className="scroll-mt-24 space-y-4"
          aria-labelledby="trend-title"
        >
          <div>
            <h2
              id="trend-title"
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
          id="quality-heading"
          className="scroll-mt-24 grid gap-6 lg:grid-cols-2"
          aria-labelledby="quality-heading-label"
        >
          <h2 id="quality-heading-label" className="sr-only">
            Quality and provenance
          </h2>
          <QualityPanel latest={latest} />
          <MethodologyCard
            title="Data provenance"
            description={dataProvenanceDescription}
            sourceLabel="CDC NWSS program"
            sourceUrl={CDC_NWSS_URL}
          />
        </section>

        <div id="forecast-heading" className="scroll-mt-24">
        <ForecastSection
          timeseries={timeseries}
          ensembleForecast={forecastBundle.ensemble}
          neuralOdeForecast={forecastBundle.neuralOde}
          derivatives={forecastBundle.derivatives}
          neuralOdeAvailable={forecastBundle.neuralOdeAvailable}
          neuralOdeIsResearch={forecastBundle.neuralOdeIsResearch}
          neuralOdeVersion={forecastBundle.neuralOdeVersion}
          regionName={config.name}
        />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <RegionSectionNav sections={cookSections} />
      <RegionHero
        eyebrow={config.eyebrow}
        name={config.name}
        description={config.description}
        latest={latest}
      />

      <section
        id="metrics-heading"
        className="scroll-mt-24 space-y-6"
        aria-labelledby="metrics-heading-label"
      >
        <h2 id="metrics-heading-label" className="sr-only">
          Current metrics
        </h2>
        <SummaryCards
          latest={latest}
          totalSites={totalSites}
          reportingThisWeek={reportingCount ?? undefined}
        />
        <IndexExplainer />
      </section>

      <section
        id="trend-heading"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="trend-title"
      >
        <div>
          <h2
            id="trend-title"
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

      <section
        id="sites-heading"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="sites-title"
      >
        <div>
          <h2 id="sites-title" className="text-lg font-semibold tracking-tight">
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
        id="quality-heading"
        className="scroll-mt-24 grid gap-6 lg:grid-cols-2"
        aria-labelledby="quality-heading-label"
      >
        <h2 id="quality-heading-label" className="sr-only">
          Quality and provenance
        </h2>
        <QualityPanel latest={latest} />
        <MethodologyCard
          title="Data provenance"
          description={`${dataProvenanceDescription} Cook County views use Illinois-focused cleaning rules before publishing to this dashboard.`}
          sourceLabel="CDC NWSS program"
          sourceUrl={CDC_NWSS_URL}
        />
      </section>

      <div id="forecast-heading" className="scroll-mt-24">
        <ForecastSection
          timeseries={timeseries}
          ensembleForecast={forecastBundle.ensemble}
          neuralOdeForecast={forecastBundle.neuralOde}
          derivatives={forecastBundle.derivatives}
          neuralOdeAvailable={forecastBundle.neuralOdeAvailable}
          neuralOdeIsResearch={forecastBundle.neuralOdeIsResearch}
          neuralOdeVersion={forecastBundle.neuralOdeVersion}
          regionName={config.name}
        />
      </div>
    </div>
  );
}
