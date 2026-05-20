import { createServerClient } from "@/lib/supabase/server";
import type {
  BaselineHorizonMetric,
  BaselinePerformanceRow,
  ForecastHorizon,
  ModelRunRow,
  RegionForecast,
  TrendLabel,
} from "@/lib/dashboard/types";

const ENSEMBLE_MODEL_NAME = "ensemble_v1";

const PREDICTION_COLUMNS =
  "id, model_run_id, entity_type, entity_id, forecast_origin_week, target_date, horizon_weeks, predicted_activity_index, lower_bound, upper_bound, predicted_trend, confidence_label";

const MODEL_RUN_COLUMNS =
  "id, model_name, model_type, version, status, metrics, hyperparameters, updated_at";

type PredictionRow = {
  id: string;
  model_run_id: string;
  entity_type: string;
  entity_id: string;
  forecast_origin_week: string;
  target_date: string;
  horizon_weeks: number;
  predicted_activity_index: number | null;
  lower_bound: number | null;
  upper_bound: number | null;
  predicted_trend: TrendLabel;
  confidence_label: "low" | "medium" | "high" | null;
};

async function getModelRunByName(modelName: string): Promise<ModelRunRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("model_runs")
    .select(MODEL_RUN_COLUMNS)
    .eq("model_name", modelName)
    .maybeSingle();

  if (error) {
    console.error("getModelRunByName:", error.message);
    return null;
  }
  return data as ModelRunRow | null;
}

async function getLatestOriginWeek(
  entityType: string,
  entityId: string,
  modelRunId: string,
): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("forecast_origin_week")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("model_run_id", modelRunId)
    .order("forecast_origin_week", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getLatestOriginWeek:", error.message);
    return null;
  }
  return (data?.forecast_origin_week as string) ?? null;
}

function mapHorizons(rows: PredictionRow[]): ForecastHorizon[] {
  return rows
    .sort((a, b) => a.horizon_weeks - b.horizon_weeks)
    .map((r) => ({
      horizon_weeks: r.horizon_weeks,
      target_date: r.target_date,
      predicted_activity_index: r.predicted_activity_index,
      lower_bound: r.lower_bound,
      upper_bound: r.upper_bound,
      predicted_trend: r.predicted_trend,
      confidence_label: r.confidence_label,
    }));
}

export async function getLatestRegionForecast(
  regionType: string,
  regionId: string,
  modelName: string = ENSEMBLE_MODEL_NAME,
): Promise<RegionForecast | null> {
  const modelRun = await getModelRunByName(modelName);
  if (!modelRun) return null;

  const originWeek = await getLatestOriginWeek(regionType, regionId, modelRun.id);
  if (!originWeek) return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("predictions")
    .select(PREDICTION_COLUMNS)
    .eq("entity_type", regionType)
    .eq("entity_id", regionId)
    .eq("model_run_id", modelRun.id)
    .eq("forecast_origin_week", originWeek)
    .order("horizon_weeks", { ascending: true });

  if (error) {
    console.error("getLatestRegionForecast:", error.message);
    return null;
  }

  const rows = (data ?? []) as PredictionRow[];
  if (rows.length === 0) return null;

  return {
    forecast_origin_week: originWeek,
    model_name: modelRun.model_name,
    model_type: modelRun.model_type,
    horizons: mapHorizons(rows),
  };
}

export async function getRegionForecastByModel(
  regionType: string,
  regionId: string,
  modelName: string,
): Promise<RegionForecast | null> {
  return getLatestRegionForecast(regionType, regionId, modelName);
}

export async function getAllModelRuns(): Promise<ModelRunRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("model_runs")
    .select(MODEL_RUN_COLUMNS)
    .order("model_name", { ascending: true });

  if (error) {
    console.error("getAllModelRuns:", error.message);
    return [];
  }
  return (data ?? []) as ModelRunRow[];
}

function parseHorizonMetrics(
  metrics: Record<string, unknown> | null,
): BaselineHorizonMetric[] {
  if (!metrics) return [];
  const byHorizon = metrics.by_horizon as Record<
    string,
    {
      mae?: number | null;
      rmse?: number | null;
      trend_accuracy?: number | null;
      n_evaluations?: number;
    }
  > | undefined;
  if (!byHorizon) return [];

  return Object.entries(byHorizon)
    .map(([h, m]) => ({
      horizon_weeks: Number(h),
      mae: m.mae ?? null,
      rmse: m.rmse ?? null,
      trend_accuracy: m.trend_accuracy ?? null,
      n_evaluations: m.n_evaluations ?? 0,
    }))
    .sort((a, b) => a.horizon_weeks - b.horizon_weeks);
}

export async function getBaselinePerformance(): Promise<BaselinePerformanceRow[]> {
  const runs = await getAllModelRuns();
  return runs
    .filter((r) => r.model_type !== "neural_ode")
    .map((run) => ({
      model_name: run.model_name,
      model_type: run.model_type,
      horizons: parseHorizonMetrics(run.metrics),
      total_evaluations: Number(run.metrics?.total_evaluations ?? 0),
    }))
    .filter((r) => r.horizons.length > 0 || r.total_evaluations > 0);
}

export { ENSEMBLE_MODEL_NAME };
