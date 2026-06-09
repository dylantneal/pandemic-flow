export type TrendLabel = "rising" | "falling" | "stable" | "insufficient_data";

export type RegionMetricRow = {
  id: string;
  region_type: string;
  region_id: string;
  region_name: string;
  week_start: string;
  site_count: number | null;
  active_site_count: number | null;
  population_represented: number | null;
  median_activity_index: number | null;
  weighted_activity_index: number | null;
  week_over_week_change: number | null;
  estimated_growth_rate: number | null;
  trend_label: TrendLabel;
  quality_score: number | null;
  quality_flags: unknown;
  created_at: string;
};

export type TimeseriesPoint = {
  week_start: string;
  weighted_activity_index: number | null;
  median_activity_index: number | null;
  trend_label: TrendLabel;
  active_site_count: number | null;
  quality_score: number | null;
  week_over_week_change: number | null;
};

export type SiteMetricRow = {
  site_id: string;
  week_start: string;
  sample_count: number;
  activity_index: number | null;
  week_over_week_change: number | null;
  trend_label: TrendLabel;
  quality_score: number | null;
  quality_flags: unknown;
  latest_sample_date: string | null;
  counties_served: string | null;
  population_served: number | null;
  active_status: string | null;
};

export type RegionConfig = {
  slug: string;
  name: string;
  eyebrow: string;
  regionType: "state" | "county";
  regionId: string;
  stateTerritory: string;
  countyFips?: string;
  description: string;
};

export const ILLINOIS_CONFIG: RegionConfig = {
  slug: "illinois",
  name: "Illinois",
  eyebrow: "STATE SURVEILLANCE",
  regionType: "state",
  regionId: "IL",
  stateTerritory: "IL",
  description:
    "Statewide community wastewater signal from CDC NWSS sewersheds across Illinois, aggregated weekly after cleaning and quality review.",
};

export const COOK_CONFIG: RegionConfig = {
  slug: "cook-county",
  name: "Cook County",
  eyebrow: "COUNTY SURVEILLANCE",
  regionType: "county",
  regionId: "17031",
  stateTerritory: "IL",
  countyFips: "17031",
  description:
    "Cook County and Chicago-area sewersheds. A metro-focused view of community viral shedding in wastewater.",
};

export type ForecastHorizon = {
  horizon_weeks: number;
  target_date: string;
  predicted_activity_index: number | null;
  lower_bound: number | null;
  upper_bound: number | null;
  predicted_trend: TrendLabel;
  confidence_label: "low" | "medium" | "high" | null;
};

export type RegionForecast = {
  forecast_origin_week: string;
  model_name: string;
  model_type: string;
  horizons: ForecastHorizon[];
};

export type ModelRunRow = {
  id: string;
  model_name: string;
  model_type: string;
  version: string;
  status: string;
  metrics: Record<string, unknown> | null;
  hyperparameters: Record<string, unknown> | null;
  updated_at: string;
};

export type BaselineHorizonMetric = {
  horizon_weeks: number;
  mae: number | null;
  rmse: number | null;
  trend_accuracy: number | null;
  n_evaluations: number;
};

export type BaselinePerformanceRow = {
  model_name: string;
  model_type: string;
  horizons: BaselineHorizonMetric[];
  total_evaluations: number;
};

export type ForecastViewMode = "ensemble" | "neural_ode" | "both";

export type DerivativePoint = {
  t_offset_days: number;
  predicted_value: number;
  predicted_derivative: number;
  /** ISO date for chart axis (origin + offset days). */
  chart_date: string;
};

export type DerivativeSeries = {
  forecast_origin_week: string;
  model_name: string;
  points: DerivativePoint[];
};

export type NeuralOdePerformanceRow = {
  model_name: string;
  version: string;
  status: string;
  entity_label: string;
  horizons: BaselineHorizonMetric[];
  total_evaluations: number;
  interval_coverage?: number | null;
  by_regime?: Record<
    string,
    { mae?: number | null; rmse?: number | null; n_evaluations?: number }
  >;
  by_quality_segment?: Record<
    string,
    { mae?: number | null; rmse?: number | null; n_evaluations?: number }
  >;
};
