import { unstable_cache } from "next/cache";

import { createServerClient } from "@/lib/supabase/server";
import {
  CACHE_TAGS,
  REVALIDATE_WEEKLY_SECONDS,
} from "@/lib/supabase/cache-config";
import type {
  RegionMetricRow,
  SiteMetricRow,
  TimeseriesPoint,
} from "@/lib/dashboard/types";

/** NWSS stores Illinois as lowercase `il` in site-level tables. */
const IL_STATE_DB = "il";

const METRIC_COLUMNS =
  "id, region_type, region_id, region_name, week_start, site_count, active_site_count, population_represented, median_activity_index, weighted_activity_index, week_over_week_change, estimated_growth_rate, trend_label, quality_score, quality_flags, created_at";

const TIMESERIES_COLUMNS =
  "week_start, weighted_activity_index, median_activity_index, trend_label, active_site_count, quality_score, week_over_week_change";

const SITE_METRIC_COLUMNS =
  "site_id, week_start, sample_count, activity_index, week_over_week_change, trend_label, quality_score, quality_flags, latest_sample_date";

async function fetchLatestRegionMetric(
  regionType: string,
  regionId: string,
): Promise<RegionMetricRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("weekly_region_metrics")
    .select(METRIC_COLUMNS)
    .eq("region_type", regionType)
    .eq("region_id", regionId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getLatestRegionMetric:", error.message);
    return null;
  }
  return data as RegionMetricRow | null;
}

export async function getLatestRegionMetric(
  regionType: string,
  regionId: string,
): Promise<RegionMetricRow | null> {
  return unstable_cache(
    fetchLatestRegionMetric,
    ["latest-region-metric", regionType, regionId],
    {
      revalidate: REVALIDATE_WEEKLY_SECONDS,
      tags: [CACHE_TAGS.weeklyMetrics],
    },
  )(regionType, regionId);
}

export async function getGlobalDataFreshness(): Promise<{
  weekStart: string | null;
}> {
  const latest = await getLatestRegionMetric("state", "IL");
  return { weekStart: latest?.week_start ?? null };
}

async function fetchRegionTimeseries(
  regionType: string,
  regionId: string,
  weeks?: number,
): Promise<TimeseriesPoint[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("weekly_region_metrics")
    .select(TIMESERIES_COLUMNS)
    .eq("region_type", regionType)
    .eq("region_id", regionId)
    .order("week_start", { ascending: true });

  if (weeks != null && weeks > 0) {
    const latest = await fetchLatestRegionMetric(regionType, regionId);
    if (latest?.week_start) {
      const start = new Date(`${latest.week_start}T12:00:00`);
      start.setDate(start.getDate() - weeks * 7);
      query = query.gte("week_start", start.toISOString().slice(0, 10));
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("getRegionTimeseries:", error.message);
    return [];
  }
  return (data ?? []) as TimeseriesPoint[];
}

export async function getRegionTimeseries(
  regionType: string,
  regionId: string,
  weeks?: number,
): Promise<TimeseriesPoint[]> {
  const cacheKey =
    weeks != null ? `region-timeseries-${weeks}` : "region-timeseries-all";
  return unstable_cache(
    fetchRegionTimeseries,
    [cacheKey, regionType, regionId],
    {
      revalidate: REVALIDATE_WEEKLY_SECONDS,
      tags: [CACHE_TAGS.weeklyMetrics],
    },
  )(regionType, regionId, weeks);
}

async function getCookSiteIds(): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("sites")
    .select("site_id")
    .eq("is_cook_county_site", true);

  if (error) {
    console.error("getCookSiteIds:", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.site_id as string);
}

async function fetchSiteLatestMetrics(options: {
  cookCountyOnly?: boolean;
}): Promise<SiteMetricRow[]> {
  const supabase = createServerClient();

  const { data: weekRow, error: weekError } = await supabase
    .from("weekly_site_metrics")
    .select("week_start")
    .eq("state_territory", IL_STATE_DB)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (weekError || !weekRow?.week_start) {
    if (weekError) console.error("getSiteLatestMetrics week:", weekError.message);
    return [];
  }

  const latestWeek = weekRow.week_start as string;

  let metricsQuery = supabase
    .from("weekly_site_metrics")
    .select(SITE_METRIC_COLUMNS)
    .eq("state_territory", IL_STATE_DB)
    .eq("week_start", latestWeek)
    .order("activity_index", { ascending: false, nullsFirst: false });

  if (options.cookCountyOnly) {
    const cookIds = await getCookSiteIds();
    if (cookIds.length === 0) return [];
    metricsQuery = metricsQuery.in("site_id", cookIds);
  }

  const { data: metrics, error: metricsError } = await metricsQuery;
  if (metricsError) {
    console.error("getSiteLatestMetrics:", metricsError.message);
    return [];
  }

  const siteIds = (metrics ?? []).map((m) => m.site_id as string);
  if (siteIds.length === 0) return [];

  const { data: sites } = await supabase
    .from("sites")
    .select("site_id, counties_served, population_served, active_status")
    .in("site_id", siteIds);

  const siteMap = new Map(
    (sites ?? []).map((s) => [s.site_id as string, s]),
  );

  return (metrics ?? []).map((m) => {
    const site = siteMap.get(m.site_id as string);
    return {
      site_id: m.site_id as string,
      week_start: m.week_start as string,
      sample_count: m.sample_count as number,
      activity_index: m.activity_index as number | null,
      week_over_week_change: m.week_over_week_change as number | null,
      trend_label: m.trend_label as SiteMetricRow["trend_label"],
      quality_score: m.quality_score as number | null,
      quality_flags: m.quality_flags,
      latest_sample_date: m.latest_sample_date as string | null,
      counties_served: (site?.counties_served as string | null) ?? null,
      population_served: (site?.population_served as number | null) ?? null,
      active_status: (site?.active_status as string | null) ?? null,
    };
  });
}

export async function getSiteLatestMetrics(options: {
  cookCountyOnly?: boolean;
}): Promise<SiteMetricRow[]> {
  const scope = options.cookCountyOnly ? "cook" : "illinois";
  return unstable_cache(
    fetchSiteLatestMetrics,
    ["site-latest-metrics", scope],
    {
      revalidate: REVALIDATE_WEEKLY_SECONDS,
      tags: [CACHE_TAGS.weeklyMetrics],
    },
  )(options);
}

/**
 * Returns site-level metrics for all available weeks for Illinois.
 * Optionally limited to the most recent `weeks` periods.
 * The result is a flat array keyed by `week_start`; callers should group by
 * `week_start` to build per-week snapshots.
 */
async function fetchSiteHistoricalMetrics(options?: {
  weeks?: number;
  fromDate?: string;
}): Promise<SiteMetricRow[]> {
  const supabase = createServerClient();

  // PostgREST caps responses at 1000 rows. Get the total count first, then
  // fetch all pages concurrently so the full history loads in one round-trip
  // instead of 18+ sequential calls (which would exceed Vercel's 10 s limit).
  const PAGE_SIZE = 1000;

  let fromDate: string | undefined;
  if (options?.fromDate) {
    fromDate = options.fromDate;
  } else if (options?.weeks != null && options.weeks > 0) {
    const { data: weekRow } = await supabase
      .from("weekly_site_metrics")
      .select("week_start")
      .eq("state_territory", IL_STATE_DB)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (weekRow?.week_start) {
      const latest = new Date(`${weekRow.week_start as string}T12:00:00`);
      latest.setDate(latest.getDate() - options.weeks * 7);
      fromDate = latest.toISOString().slice(0, 10);
    }
  }

  // 1. Count total matching rows
  let countQuery = supabase
    .from("weekly_site_metrics")
    .select("*", { count: "exact", head: true })
    .eq("state_territory", IL_STATE_DB);
  if (fromDate) countQuery = countQuery.gte("week_start", fromDate);

  const { count, error: countError } = await countQuery;
  if (countError || !count) {
    console.error("getSiteHistoricalMetrics count:", countError?.message);
    return [];
  }

  // 2. Fetch all pages in parallel
  const pageCount = Math.ceil(count / PAGE_SIZE);
  const pagePromises = Array.from({ length: pageCount }, (_, i) => {
    let q = supabase
      .from("weekly_site_metrics")
      .select(`${SITE_METRIC_COLUMNS}, week_start`)
      .eq("state_territory", IL_STATE_DB)
      .order("week_start", { ascending: true })
      .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
    if (fromDate) q = q.gte("week_start", fromDate);
    return q;
  });

  const pages = await Promise.all(pagePromises);
  const allMetrics: Record<string, unknown>[] = [];
  for (const { data: page, error } of pages) {
    if (error) {
      console.error("getSiteHistoricalMetrics page:", error.message);
      continue;
    }
    if (page) allMetrics.push(...(page as Record<string, unknown>[]));
  }

  if (allMetrics.length === 0) return [];

  const siteIds = [...new Set(allMetrics.map((m) => m.site_id as string))];

  const { data: sites } = await supabase
    .from("sites")
    .select("site_id, counties_served, population_served, active_status")
    .in("site_id", siteIds);

  const siteMap = new Map(
    (sites ?? []).map((s) => [s.site_id as string, s]),
  );

  return (allMetrics).map((m) => {
    const site = siteMap.get(m.site_id as string);
    return {
      site_id: m.site_id as string,
      week_start: m.week_start as string,
      sample_count: m.sample_count as number,
      activity_index: m.activity_index as number | null,
      week_over_week_change: m.week_over_week_change as number | null,
      trend_label: m.trend_label as SiteMetricRow["trend_label"],
      quality_score: m.quality_score as number | null,
      quality_flags: m.quality_flags,
      latest_sample_date: m.latest_sample_date as string | null,
      counties_served: (site?.counties_served as string | null) ?? null,
      population_served: (site?.population_served as number | null) ?? null,
      active_status: (site?.active_status as string | null) ?? null,
    };
  });
}

export async function getSiteHistoricalMetrics(options?: {
  weeks?: number;
  fromDate?: string;
}): Promise<SiteMetricRow[]> {
  // Full Illinois history is ~7 MB and exceeds Next.js unstable_cache's 2 MB limit.
  // Fetch directly; page-level revalidate still applies on /illinois.
  return fetchSiteHistoricalMetrics(options);
}

export async function getSitesForRegion(options: {
  cookCountyOnly?: boolean;
}): Promise<number> {
  const supabase = createServerClient();
  let query = supabase
    .from("sites")
    .select("site_id", { count: "exact", head: true })
    .eq("state_territory", IL_STATE_DB);

  if (options.cookCountyOnly) {
    query = query.eq("is_cook_county_site", true);
  }

  const { count, error } = await query;
  if (error) {
    console.error("getSitesForRegion:", error.message);
    return 0;
  }
  return count ?? 0;
}
