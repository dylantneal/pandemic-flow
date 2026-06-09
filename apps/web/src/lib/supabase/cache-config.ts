/**
 * Revalidation windows for dashboard data fetches.
 * Rollback: set values to 0 and restore `export const dynamic = "force-dynamic"` on pages.
 */
export const REVALIDATE_WEEKLY_SECONDS = 60 * 60;

export const REVALIDATE_FORECASTS_SECONDS = 60 * 60 * 6;

export const REVALIDATE_SITE_HISTORY_SECONDS = 60 * 60 * 12;

export const CACHE_TAGS = {
  weeklyMetrics: "weekly-metrics",
  forecasts: "forecasts",
  siteHistory: "site-history",
} as const;
