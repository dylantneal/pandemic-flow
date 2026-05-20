import { geoAlbers, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";

import {
  aggregateSitesToCounties,
  toMapAggregate,
  type CountyMapAggregate,
} from "@/lib/dashboard/county-aggregate";
import { COUNTY_BY_FIPS } from "@/lib/dashboard/county-lookup";
// Imported as a module asset so Next.js bundles it into the serverless function
// payload — `public/` files are not available to runtime fs reads on Vercel.
import topoData from "@/lib/dashboard/data/illinois-counties.topo.json";
import type { SiteMetricRow } from "@/lib/dashboard/types";

export type CountyMapFeature = {
  fips: string;
  name: string;
  d: string;
  aggregate: CountyMapAggregate | null;
};

/** Serialisable per-week county aggregates keyed by FIPS, grouped by week. */
export type WeeklyCountySnapshot = {
  weekStart: string;
  /** FIPS → aggregate (null means no data for that county that week) */
  counties: Record<string, CountyMapAggregate>;
  reportingCount: number;
};

const WIDTH = 520;
const HEIGHT = 620;

function loadTopology(): Topology {
  return topoData as unknown as Topology;
}

/** Build projected path strings for every IL county — reused across all weeks. */
export async function buildIllinoisCountyPaths(): Promise<{
  pathsByFips: Record<string, { name: string; d: string }>;
  width: number;
  height: number;
}> {
  const topo = loadTopology();
  const collection = feature(
    topo,
    topo.objects.counties as Parameters<typeof feature>[1],
  ) as FeatureCollection<Geometry>;

  // Illinois-specific Albers projection: rotate central meridian to −89.2°,
  // parallels bracketing the state (37 – 43 N), center on Illinois latitude.
  const projection = geoAlbers()
    .rotate([89.2, 0])
    .center([0, 40.0])
    .parallels([37, 43])
    .fitSize([WIDTH, HEIGHT], collection);
  const pathGen = geoPath(projection);

  const pathsByFips: Record<string, { name: string; d: string }> = {};
  for (const f of collection.features) {
    const fips = String(f.id ?? "");
    const entry = COUNTY_BY_FIPS.get(fips);
    pathsByFips[fips] = {
      name: entry?.name ?? fips,
      d: pathGen(f as Feature<Geometry>) ?? "",
    };
  }

  return { pathsByFips, width: WIDTH, height: HEIGHT };
}

/** Build features for a single week (current usage — backward compat). */
export async function buildIllinoisCountyMapFeatures(
  sites: SiteMetricRow[],
): Promise<{
  features: CountyMapFeature[];
  width: number;
  height: number;
}> {
  const { pathsByFips, width, height } = await buildIllinoisCountyPaths();
  const aggregates = aggregateSitesToCounties(sites);

  const features: CountyMapFeature[] = Object.entries(pathsByFips).map(
    ([fips, { name, d }]) => {
      const agg = aggregates.get(fips);
      return {
        fips,
        name,
        d,
        aggregate: agg ? toMapAggregate(agg) : null,
      };
    },
  );

  return { features, width, height };
}

/**
 * Build all historical weekly snapshots.
 * `allSites` is the flat list returned by getSiteHistoricalMetrics().
 */
export async function buildWeeklyCountySnapshots(
  allSites: SiteMetricRow[],
): Promise<{
  snapshots: WeeklyCountySnapshot[];
  pathsByFips: Record<string, { name: string; d: string }>;
  width: number;
  height: number;
}> {
  const { pathsByFips, width, height } = await buildIllinoisCountyPaths();

  // Group flat rows by week_start
  const byWeek = new Map<string, SiteMetricRow[]>();
  for (const row of allSites) {
    const w = row.week_start;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(row);
  }

  const weeks = [...byWeek.keys()].sort();

  const snapshots: WeeklyCountySnapshot[] = weeks.map((weekStart) => {
    const sites = byWeek.get(weekStart)!;
    const aggregates = aggregateSitesToCounties(sites);
    const counties: Record<string, CountyMapAggregate> = {};
    for (const [fips, agg] of aggregates) {
      counties[fips] = toMapAggregate(agg);
    }
    return {
      weekStart,
      counties,
      reportingCount: Object.keys(counties).length,
    };
  });

  return { snapshots, pathsByFips, width, height };
}
