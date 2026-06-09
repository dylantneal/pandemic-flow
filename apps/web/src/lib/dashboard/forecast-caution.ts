import { formatPercentChange, formatShortDate } from "@/lib/dashboard/format";
import type { RegionForecast, TimeseriesPoint } from "@/lib/dashboard/types";

/** WoW change below this (e.g. −0.20 = −20%) triggers rebound caution. */
export const SHARP_WOW_THRESHOLD = -0.2;

export function latestObservedPoint(
  timeseries: TimeseriesPoint[],
): TimeseriesPoint | undefined {
  return timeseries.filter((d) => d.weighted_activity_index != null).at(-1);
}

/** Sharp recent drop + ensemble anchored at that week predicting higher / rising. */
export function detectEnsembleReboundCaution(
  timeseries: TimeseriesPoint[],
  ensemble: RegionForecast | null,
): { show: boolean; message: string } | null {
  const latest = latestObservedPoint(timeseries);
  if (!latest?.week_start || latest.week_over_week_change == null || !ensemble) {
    return null;
  }
  if (latest.week_over_week_change > SHARP_WOW_THRESHOLD) return null;
  if (ensemble.forecast_origin_week !== latest.week_start) return null;

  const h1 = ensemble.horizons.find((h) => h.horizon_weeks === 1) ?? ensemble.horizons[0];
  if (h1?.predicted_activity_index == null) return null;

  const atOrigin = latest.weighted_activity_index as number;
  const rebound =
    h1.predicted_activity_index! > atOrigin + 0.05 ||
    h1.predicted_trend === "rising";

  if (!rebound) return null;

  return {
    show: true,
    message: `Activity fell sharply this week (${formatPercentChange(latest.week_over_week_change)} week-over-week). The ensemble forecast shows a rebound, and simple baselines often mean-revert after big moves. Treat the next few weeks as uncertain.`,
  };
}

/** Neural research overlay predates the latest observed / ensemble week. */
export function detectStaleNeuralOverlayCaution(
  timeseries: TimeseriesPoint[],
  neural: RegionForecast | null,
  ensemble: RegionForecast | null,
): { show: boolean; message: string } | null {
  const latest = latestObservedPoint(timeseries);
  if (!latest?.week_start || !neural) return null;
  if (neural.forecast_origin_week >= latest.week_start) return null;

  const ensembleOrigin = ensemble?.forecast_origin_week;
  const refreshNote =
    ensembleOrigin && ensembleOrigin > neural.forecast_origin_week
      ? " The research overlay refreshes with the weekly data pipeline when new CDC weeks publish."
      : "";

  return {
    show: true,
    message: `The Neural ODE overlay is from the week of ${formatShortDate(neural.forecast_origin_week)} and did not see activity through ${formatShortDate(latest.week_start)}. Divergence after that date is expected.${refreshNote}`,
  };
}

/** Use the week before forecast origin as ensemble bridge (avoids V at crash week). */
export function shouldSoftenEnsembleBridge(
  timeseries: TimeseriesPoint[],
  ensemble: RegionForecast | null,
  viewMode: "ensemble" | "neural_ode" | "both",
): boolean {
  if (viewMode !== "both") return false;
  const caution = detectEnsembleReboundCaution(timeseries, ensemble);
  return caution?.show ?? false;
}
