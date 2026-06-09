import { unstable_cache } from "next/cache";

import { createServerClient } from "@/lib/supabase/server";
import {
  CACHE_TAGS,
  REVALIDATE_FORECASTS_SECONDS,
} from "@/lib/supabase/cache-config";
import type {
  BaselineHorizonMetric,
  BaselinePerformanceRow,
  DerivativeSeries,
  ForecastHorizon,
  ModelRunRow,
  NeuralOdePerformanceRow,
  RegionForecast,
  TrendLabel,
} from "@/lib/dashboard/types";

const ENSEMBLE_MODEL_NAME = "ensemble_v1";

/** Frozen canonical research candidate surfaced in the dashboard compare view. */
const CANONICAL_NEURAL_ODE_VERSION = "1.7.5-shrinkage-conservative";

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

export function neuralOdeModelName(regionId: string): string {
  return `neural_ode_${regionId}`;
}

export async function getProductionNeuralOdeRun(
  regionId: string,
): Promise<ModelRunRow | null> {
  const modelName = neuralOdeModelName(regionId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("model_runs")
    .select(MODEL_RUN_COLUMNS)
    .eq("model_name", modelName)
    .eq("status", "production")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getProductionNeuralOdeRun:", error.message);
    return null;
  }
  return (data as ModelRunRow | null) ?? null;
}

/** Frozen canonical research candidate for a region (1.7.5), regardless of status. */
export async function getNeuralOdeResearchRun(
  regionId: string,
): Promise<ModelRunRow | null> {
  const modelName = neuralOdeModelName(regionId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("model_runs")
    .select(MODEL_RUN_COLUMNS)
    .eq("model_name", modelName)
    .eq("version", CANONICAL_NEURAL_ODE_VERSION)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getNeuralOdeResearchRun:", error.message);
    return null;
  }
  return (data as ModelRunRow | null) ?? null;
}

/** Latest stored forecast for a specific model run id (avoids model_name collisions). */
async function getLatestRegionForecastForRun(
  regionType: string,
  regionId: string,
  modelRun: ModelRunRow,
): Promise<RegionForecast | null> {
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
    console.error("getLatestRegionForecastForRun:", error.message);
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

/** Build the instantaneous rate-of-change series for a run's stored forecast. */
async function buildNeuralOdeDerivatives(
  regionType: string,
  regionId: string,
  modelRun: ModelRunRow,
  forecast: RegionForecast,
): Promise<DerivativeSeries | null> {
  const supabase = createServerClient();
  const { data: preds, error: predErr } = await supabase
    .from("predictions")
    .select("id")
    .eq("entity_type", regionType)
    .eq("entity_id", regionId)
    .eq("model_run_id", modelRun.id)
    .eq("forecast_origin_week", forecast.forecast_origin_week);

  if (predErr || !preds?.length) {
    if (predErr) console.error("buildNeuralOdeDerivatives predictions:", predErr.message);
    return null;
  }

  const predIds = preds.map((p) => p.id as string);
  const { data: derivs, error: derivErr } = await supabase
    .from("prediction_derivatives")
    .select("t_offset_days, predicted_value, predicted_derivative")
    .in("prediction_id", predIds)
    .order("t_offset_days", { ascending: true });

  if (derivErr || !derivs?.length) {
    return null;
  }

  const origin = forecast.forecast_origin_week;
  const points = derivs.map((row) => {
    const offset = Number(row.t_offset_days);
    const chartDate = addDaysToIso(origin, offset);
    return {
      t_offset_days: offset,
      predicted_value: Number(row.predicted_value),
      predicted_derivative: Number(row.predicted_derivative),
      chart_date: chartDate,
    };
  });

  return {
    forecast_origin_week: origin,
    model_name: modelRun.model_name,
    points,
  };
}

function addDaysToIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Math.round(days));
  return base.toISOString().slice(0, 10);
}

export async function getNeuralOdeRuns(): Promise<ModelRunRow[]> {
  const runs = await getAllModelRuns();
  return runs.filter((r) => r.model_type === "neural_ode");
}

export async function getNeuralOdePerformance(): Promise<NeuralOdePerformanceRow[]> {
  const runs = await getNeuralOdeRuns();
  const entityLabels: Record<string, string> = {
    neural_ode_IL: "Illinois",
    neural_ode_17031: "Cook County",
  };

  return runs
    .map((run) => {
      const metrics = run.metrics ?? {};
      const interval = metrics.interval_coverage as
        | { overall?: number | null }
        | undefined;
      return {
        model_name: run.model_name,
        version: run.version,
        status: run.status,
        entity_label: entityLabels[run.model_name] ?? run.model_name,
        horizons: parseHorizonMetrics(run.metrics),
        total_evaluations: Number(run.metrics?.total_evaluations ?? 0),
        interval_coverage: interval?.overall ?? null,
        by_regime: (metrics.by_regime as NeuralOdePerformanceRow["by_regime"]) ?? undefined,
        by_quality_segment:
          (metrics.by_quality_segment as NeuralOdePerformanceRow["by_quality_segment"]) ??
          undefined,
      };
    })
    .filter((r) => r.horizons.length > 0 || r.total_evaluations > 0);
}

async function fetchRegionForecastsBundle(
  regionType: string,
  regionId: string,
): Promise<{
  ensemble: RegionForecast | null;
  neuralOde: RegionForecast | null;
  derivatives: DerivativeSeries | null;
  neuralOdeAvailable: boolean;
  neuralOdeIsResearch: boolean;
  neuralOdeVersion: string | null;
}> {
  const [ensemble, productionRun] = await Promise.all([
    getLatestRegionForecast(regionType, regionId, ENSEMBLE_MODEL_NAME),
    getProductionNeuralOdeRun(regionId),
  ]);

  // Prefer a promoted production model; otherwise fall back to the frozen
  // canonical research candidate so the compare view has something to show.
  const neuralRun = productionRun ?? (await getNeuralOdeResearchRun(regionId));
  const isResearch = !productionRun && Boolean(neuralRun);

  let neuralOde: RegionForecast | null = null;
  let derivatives: DerivativeSeries | null = null;

  if (neuralRun) {
    neuralOde = await getLatestRegionForecastForRun(regionType, regionId, neuralRun);
    if (neuralOde) {
      derivatives = await buildNeuralOdeDerivatives(
        regionType,
        regionId,
        neuralRun,
        neuralOde,
      );
    }
  }

  return {
    ensemble,
    neuralOde,
    derivatives,
    neuralOdeAvailable: Boolean(neuralOde),
    neuralOdeIsResearch: isResearch && Boolean(neuralOde),
    neuralOdeVersion: neuralOde ? neuralRun?.version ?? null : null,
  };
}

export async function getRegionForecastsBundle(
  regionType: string,
  regionId: string,
): Promise<{
  ensemble: RegionForecast | null;
  neuralOde: RegionForecast | null;
  derivatives: DerivativeSeries | null;
  neuralOdeAvailable: boolean;
  neuralOdeIsResearch: boolean;
  neuralOdeVersion: string | null;
}> {
  return unstable_cache(
    fetchRegionForecastsBundle,
    ["region-forecasts-bundle", regionType, regionId],
    {
      revalidate: REVALIDATE_FORECASTS_SECONDS,
      tags: [CACHE_TAGS.forecasts],
    },
  )(regionType, regionId);
}

export { ENSEMBLE_MODEL_NAME };
