import { resolveCountyName } from "@/lib/dashboard/county-lookup";
import type { SiteMetricRow, TrendLabel } from "@/lib/dashboard/types";

export type CountyAggregate = {
  fips: string;
  name: string;
  siteCount: number;
  populationCovered: number;
  activityIndex: number | null;
  wowChange: number | null;
  trendLabel: TrendLabel;
  qualityScore: number | null;
  latestSampleDate: string | null;
  contributingSites: SiteMetricRow[];
};

type CountyAccumulator = {
  entry: { fips: string; name: string };
  sites: SiteMetricRow[];
  populationCovered: number;
};

function parseCountiesServed(countiesServed: string | null): string[] {
  if (!countiesServed?.trim()) return [];
  return countiesServed
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function weightedMean(
  values: Array<{ value: number; weight: number }>,
): number | null {
  if (values.length === 0) return null;
  const totalWeight = values.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) {
    const sum = values.reduce((s, v) => s + v.value, 0);
    return sum / values.length;
  }
  const weighted = values.reduce((s, v) => s + v.value * v.weight, 0);
  return weighted / totalWeight;
}

function modeTrend(sites: SiteMetricRow[]): TrendLabel {
  if (sites.length === 0) return "insufficient_data";
  if (sites.length === 1) return sites[0]!.trend_label;

  const counts = new Map<TrendLabel, number>();
  for (const site of sites) {
    const label = site.trend_label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  let best: TrendLabel = "insufficient_data";
  let bestCount = 0;
  let tie = false;

  for (const [label, count] of counts) {
    if (label === "insufficient_data") continue;
    if (count > bestCount) {
      best = label;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }

  if (bestCount === 0 || tie) return "insufficient_data";
  return best;
}

function minQuality(sites: SiteMetricRow[]): number | null {
  const scores = sites
    .map((s) => s.quality_score)
    .filter((q): q is number => q != null);
  if (scores.length === 0) return null;
  return Math.min(...scores);
}

function latestSampleDate(sites: SiteMetricRow[]): string | null {
  let latest: string | null = null;
  for (const site of sites) {
    const d = site.latest_sample_date;
    if (!d) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

function finalizeAggregate(acc: CountyAccumulator): CountyAggregate {
  const { entry, sites, populationCovered } = acc;

  const activityPairs: Array<{ value: number; weight: number }> = [];
  const wowPairs: Array<{ value: number; weight: number }> = [];

  for (const site of sites) {
    const weight =
      site.population_served != null && site.population_served > 0
        ? site.population_served / Math.max(sites.length, 1)
        : 1;

    if (site.activity_index != null && !Number.isNaN(site.activity_index)) {
      activityPairs.push({ value: site.activity_index, weight });
    }
    if (
      site.week_over_week_change != null &&
      !Number.isNaN(site.week_over_week_change)
    ) {
      wowPairs.push({ value: site.week_over_week_change, weight });
    }
  }

  return {
    fips: entry.fips,
    name: entry.name,
    siteCount: sites.length,
    populationCovered,
    activityIndex: weightedMean(activityPairs),
    wowChange: weightedMean(wowPairs),
    trendLabel: modeTrend(sites),
    qualityScore: minQuality(sites),
    latestSampleDate: latestSampleDate(sites),
    contributingSites: sites,
  };
}

/**
 * Rolls site-level weekly metrics up to Illinois counties by `counties_served`.
 */
export function aggregateSitesToCounties(
  sites: SiteMetricRow[],
): Map<string, CountyAggregate> {
  const accumulators = new Map<string, CountyAccumulator>();

  for (const site of sites) {
    const countyNames = parseCountiesServed(site.counties_served);
    if (countyNames.length === 0) continue;

    const n = countyNames.length;
    const popShare =
      site.population_served != null && site.population_served > 0
        ? site.population_served / n
        : 0;

    for (const rawName of countyNames) {
      const entry = resolveCountyName(rawName);
      if (!entry) continue;

      let acc = accumulators.get(entry.fips);
      if (!acc) {
        acc = {
          entry: { fips: entry.fips, name: entry.name },
          sites: [],
          populationCovered: 0,
        };
        accumulators.set(entry.fips, acc);
      }

      acc.sites.push(site);
      acc.populationCovered += popShare;
    }
  }

  const result = new Map<string, CountyAggregate>();
  for (const acc of accumulators.values()) {
    result.set(acc.entry.fips, finalizeAggregate(acc));
  }
  return result;
}

/** Serializable county stats for the map client (no full site rows). */
export type CountyMapAggregate = Omit<CountyAggregate, "contributingSites"> & {
  contributingSiteCount: number;
};

export function toMapAggregate(agg: CountyAggregate): CountyMapAggregate {
  const { contributingSites, ...rest } = agg;
  return {
    ...rest,
    contributingSiteCount: contributingSites.length,
  };
}
