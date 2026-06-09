"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendChip } from "@/components/dashboard/trend-chip";
import { forecastModelOptions } from "@/lib/copy/neural-ode-copy";
import {
  detectEnsembleReboundCaution,
  detectStaleNeuralOverlayCaution,
  shouldSoftenEnsembleBridge,
} from "@/lib/dashboard/forecast-caution";
import { formatShortDate, trendLabelText } from "@/lib/dashboard/format";
import type {
  ForecastViewMode,
  RegionForecast,
  TimeseriesPoint,
} from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const OBSERVED_COLOR = "var(--chart-1)";
const ENSEMBLE_COLOR = "var(--chart-2)";
const NEURAL_COLOR = "var(--forecast-neural)";

type ChartRow = {
  week: string;
  observed: number | null;
  ensemble: number | null;
  neural: number | null;
  bandBase: number | null;
  bandWidth: number | null;
};

function appendForecastRows(
  observed: ChartRow[],
  forecast: RegionForecast,
  field: "ensemble" | "neural",
  options?: { softenBridgeFromPriorWeek?: boolean },
): ChartRow[] {
  const originWeek = forecast.forecast_origin_week;
  const originPoint = observed.find((p) => p.week === originWeek);
  const bridgeValue = originPoint?.observed ?? null;

  const rows: ChartRow[] = forecast.horizons.map((h) => {
    const row: ChartRow = {
      week: h.target_date,
      observed: null,
      ensemble: field === "ensemble" ? h.predicted_activity_index : null,
      neural: field === "neural" ? h.predicted_activity_index : null,
      bandBase: null,
      bandWidth: null,
    };
    if (h.lower_bound != null && h.upper_bound != null) {
      row.bandBase = h.lower_bound;
      row.bandWidth = h.upper_bound - h.lower_bound;
    }
    return row;
  });

  if (bridgeValue == null || rows.length === 0) {
    return mergeForecastRows(observed, rows);
  }

  if (options?.softenBridgeFromPriorWeek && originPoint) {
    const originIdx = observed.findIndex((p) => p.week === originWeek);
    if (originIdx > 0) {
      const prior = observed[originIdx - 1];
      const priorBridge = prior.observed;
      if (priorBridge != null) {
        const patched = observed.map((p) => {
          if (p.week !== prior.week) return p;
          return {
            ...p,
            ensemble: field === "ensemble" ? priorBridge : p.ensemble,
            neural: field === "neural" ? priorBridge : p.neural,
          };
        });
        return mergeForecastRows(patched, rows);
      }
    }
  }

  if (originPoint) {
    const patched = observed.map((p) => {
      if (p.week !== originWeek) return p;
      return {
        ...p,
        ensemble: field === "ensemble" ? bridgeValue : p.ensemble,
        neural: field === "neural" ? bridgeValue : p.neural,
      };
    });
    return mergeForecastRows(patched, rows);
  }

  const bridge: ChartRow = {
    week: originWeek,
    observed: null,
    ensemble: field === "ensemble" ? bridgeValue : null,
    neural: field === "neural" ? bridgeValue : null,
    bandBase: bridgeValue,
    bandWidth: 0,
  };
  return mergeForecastRows(observed, [bridge, ...rows]);
}

/** When a stale research forecast predates the latest observed week, clip history at origin. */
function clipObservedAtOrigin(
  observed: ChartRow[],
  originWeek: string | undefined,
): ChartRow[] {
  if (!originWeek) return observed;
  const latest = observed[observed.length - 1]?.week;
  if (!latest || latest <= originWeek) return observed;
  return observed.filter((p) => p.week <= originWeek);
}

function mergeForecastRows(base: ChartRow[], extra: ChartRow[]): ChartRow[] {
  const byWeek = new Map(base.map((r) => [r.week, { ...r }]));
  for (const row of extra) {
    const existing = byWeek.get(row.week);
    if (existing) {
      if (row.ensemble != null) existing.ensemble = row.ensemble;
      if (row.neural != null) existing.neural = row.neural;
    } else {
      byWeek.set(row.week, { ...row });
    }
  }
  return Array.from(byWeek.values()).sort((a, b) => a.week.localeCompare(b.week));
}

function buildChartData(
  timeseries: TimeseriesPoint[],
  ensemble: RegionForecast | null,
  neural: RegionForecast | null,
  viewMode: ForecastViewMode,
  contextWeeks: number = 12,
): ChartRow[] {
  const observed: ChartRow[] = timeseries
    .filter((d) => d.weighted_activity_index != null)
    .slice(-contextWeeks)
    .map((d) => ({
      week: d.week_start,
      observed: d.weighted_activity_index as number,
      ensemble: null,
      neural: null,
      bandBase: null,
      bandWidth: null,
    }));

  let merged = observed;
  const softenEnsembleBridge = shouldSoftenEnsembleBridge(
    timeseries,
    ensemble,
    viewMode,
  );

  if (viewMode === "ensemble" || viewMode === "both") {
    if (ensemble?.horizons.length) {
      merged = mergeForecastRows(
        merged,
        appendForecastRows(observed, ensemble, "ensemble", {
          softenBridgeFromPriorWeek: softenEnsembleBridge,
        }),
      );
    }
  }

  if (viewMode === "neural_ode" || viewMode === "both") {
    if (neural?.horizons.length) {
      const neuralObserved =
        viewMode === "neural_ode"
          ? clipObservedAtOrigin(observed, neural.forecast_origin_week)
          : observed;
      const neuralRows = appendForecastRows(neuralObserved, neural, "neural");
      if (viewMode === "both") {
        merged = mergeForecastRows(merged, neuralRows);
        // Keep ensemble band only in compare mode
        for (const row of merged) {
          if (row.neural != null && row.ensemble != null) {
            const ens = ensemble?.horizons.find((h) => h.target_date === row.week);
            if (ens?.lower_bound != null && ens?.upper_bound != null) {
              row.bandBase = ens.lower_bound;
              row.bandWidth = ens.upper_bound - ens.lower_bound;
            }
          }
        }
      } else {
        merged = neuralRows;
      }
    }
  }

  return merged;
}

function activeForecast(
  viewMode: ForecastViewMode,
  ensemble: RegionForecast | null,
  neural: RegionForecast | null,
): RegionForecast | null {
  if (viewMode === "neural_ode") return neural;
  if (viewMode === "both") return null;
  return ensemble ?? neural;
}

function chartDescription(
  viewMode: ForecastViewMode,
  regionName: string,
  ensemble: RegionForecast | null,
  neural: RegionForecast | null,
): string {
  if (viewMode === "ensemble" && ensemble) {
    return `Ensemble baseline for ${regionName} from the week of ${formatShortDate(ensemble.forecast_origin_week)}. Shaded band ≈ 80% interval from backtest errors.`;
  }
  if (viewMode === "neural_ode" && neural) {
    return `Neural ODE learned trajectory for ${regionName} from the week of ${formatShortDate(neural.forecast_origin_week)}. Band uses holdout residual spread.`;
  }
  if (viewMode === "both") {
    const ensOrigin = ensemble
      ? formatShortDate(ensemble.forecast_origin_week)
      : "—";
    const neuralOrigin = neural
      ? formatShortDate(neural.forecast_origin_week)
      : "—";
    const sameOrigin =
      ensemble?.forecast_origin_week &&
      ensemble.forecast_origin_week === neural?.forecast_origin_week;
    const originNote = sameOrigin
      ? `Both forecasts start from the week of ${ensOrigin}.`
      : `Ensemble from ${ensOrigin}; Neural ODE research candidate from ${neuralOrigin}. Origins may differ because only the ensemble updates weekly.`;
    return `Side-by-side comparison for ${regionName}. Dark orange dashed = ensemble; teal dashed = Neural ODE (research). ${originNote}`;
  }
  return `Short-horizon forecast for ${regionName}.`;
}

function legendLabel(
  base: string,
  forecast: RegionForecast | null,
  showOrigin: boolean,
): string {
  if (!showOrigin || !forecast) return base;
  return `${base} · from ${formatShortDate(forecast.forecast_origin_week)}`;
}

export function ForecastChart({
  timeseries,
  ensembleForecast,
  neuralOdeForecast,
  viewMode,
  regionName,
  className,
}: {
  timeseries: TimeseriesPoint[];
  ensembleForecast: RegionForecast | null;
  neuralOdeForecast: RegionForecast | null;
  viewMode: ForecastViewMode;
  regionName: string;
  className?: string;
}) {
  const chartData = useMemo(
    () => buildChartData(timeseries, ensembleForecast, neuralOdeForecast, viewMode),
    [timeseries, ensembleForecast, neuralOdeForecast, viewMode],
  );

  const forecast = activeForecast(viewMode, ensembleForecast, neuralOdeForecast);
  const primaryHorizon = forecast?.horizons[0];
  const fourWeekHorizon = forecast?.horizons.find((h) => h.horizon_weeks === 4);
  const ensemblePrimary = ensembleForecast?.horizons[0];
  const neuralPrimary = neuralOdeForecast?.horizons[0];

  const hasEnsemble = Boolean(ensembleForecast?.horizons.length);
  const hasNeural = Boolean(neuralOdeForecast?.horizons.length);
  const showChart =
    (viewMode === "ensemble" && hasEnsemble) ||
    (viewMode === "neural_ode" && hasNeural) ||
    (viewMode === "both" && (hasEnsemble || hasNeural));

  const description = chartDescription(
    viewMode,
    regionName,
    ensembleForecast,
    neuralOdeForecast,
  );
  const showOriginInLegend = viewMode === "both";
  const latestObservedWeek = timeseries
    .filter((d) => d.weighted_activity_index != null)
    .at(-1)?.week_start;
  const staleNeuralOrigin =
    viewMode === "neural_ode" &&
    neuralOdeForecast &&
    latestObservedWeek &&
    latestObservedWeek > neuralOdeForecast.forecast_origin_week;

  const ensembleCaution =
    (viewMode === "ensemble" || viewMode === "both") &&
    detectEnsembleReboundCaution(timeseries, ensembleForecast);
  const staleNeuralCaution =
    (viewMode === "both" || viewMode === "neural_ode") &&
    detectStaleNeuralOverlayCaution(
      timeseries,
      neuralOdeForecast,
      ensembleForecast,
    );
  const showSoftenNote =
    viewMode === "both" &&
    Boolean(ensembleCaution) &&
    shouldSoftenEnsembleBridge(timeseries, ensembleForecast, viewMode);

  if (!showChart) {
    return (
      <Card className={cn("border-border/80 bg-muted/30 shadow-sm", className)}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle className="text-lg">Short-horizon forecast</CardTitle>
          </div>
          <CardDescription className="max-w-2xl leading-relaxed">
            No forecast data for the selected view. Baselines update weekly; Neural ODE
            appears after train → promote → infer for {regionName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[6rem] items-center justify-center rounded-lg border border-dashed border-border bg-card/80 px-4">
            <p className="text-center text-sm text-muted-foreground">
              No forecast data available for this model
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const originWeek = forecast?.forecast_origin_week;
  const compareOrigins =
    viewMode === "both"
      ? [
          ensembleForecast?.forecast_origin_week,
          neuralOdeForecast?.forecast_origin_week,
        ].filter((w): w is string => Boolean(w))
      : originWeek
        ? [originWeek]
        : [];
  const uniqueCompareOrigins = [...new Set(compareOrigins)];

  return (
    <Card className={cn("border-border/80 bg-card shadow-sm", className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle className="text-lg">Short-horizon forecast</CardTitle>
          </div>
          <CardDescription className="mt-1 max-w-2xl leading-relaxed">
            {description}
            {staleNeuralOrigin && (
              <>
                {" "}
                Observed history stops at the forecast origin (
                {formatShortDate(neuralOdeForecast!.forecast_origin_week)}) so the
                dashed line connects cleanly. Newer observed weeks are omitted in this
                view.
              </>
            )}
          </CardDescription>
          <p className="mt-2 text-xs text-muted-foreground">
            Viewing: <strong className="text-foreground">{forecastModelOptions[viewMode].label}</strong>
          </p>
        </div>
        {viewMode !== "both" && fourWeekHorizon && (
          <TrendChip label={fourWeekHorizon.predicted_trend} />
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: OBSERVED_COLOR }} />
            Observed
          </span>
          {(viewMode === "ensemble" || viewMode === "both") && hasEnsemble && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded border border-dashed"
                style={{ borderColor: ENSEMBLE_COLOR }}
              />
              {legendLabel("Ensemble", ensembleForecast, showOriginInLegend)}
            </span>
          )}
          {(viewMode === "neural_ode" || viewMode === "both") && hasNeural && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded border border-dashed"
                style={{ borderColor: NEURAL_COLOR }}
              />
              {legendLabel("Neural ODE", neuralOdeForecast, showOriginInLegend)}
            </span>
          )}
          {viewMode !== "both" && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-4 rounded opacity-30"
                style={{ background: viewMode === "neural_ode" ? NEURAL_COLOR : ENSEMBLE_COLOR }}
              />
              ~80% interval
            </span>
          )}
        </div>

        {(ensembleCaution || staleNeuralCaution || showSoftenNote) && (
          <div className="mb-4 space-y-2" role="status">
            {ensembleCaution && (
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <p>{ensembleCaution.message}</p>
              </div>
            )}
            {staleNeuralCaution && (
              <div className="flex gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-950 dark:text-sky-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                <p>{staleNeuralCaution.message}</p>
              </div>
            )}
            {showSoftenNote && (
              <p className="text-[11px] text-muted-foreground">
                In compare view, the ensemble dashed line starts from the week before the
                sharp drop so the chart does not over-emphasize a V-shaped rebound at the
                crash week.
              </p>
            )}
          </div>
        )}

        <div className="h-[280px] w-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ENSEMBLE_COLOR} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ENSEMBLE_COLOR} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={32}
                tickFormatter={(w) => formatShortDate(String(w))}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={36}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: "12px",
                }}
                formatter={(value, name) => {
                  const n = typeof value === "number" ? value : Number(value);
                  const labels: Record<string, string> = {
                    observed: "Observed",
                    ensemble: "Ensemble",
                    neural: "Neural ODE",
                  };
                  return [
                    Number.isFinite(n) ? n.toFixed(2) : "—",
                    labels[String(name)] ?? String(name),
                  ];
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row?.week ? formatShortDate(row.week) : "";
                }}
              />
              {uniqueCompareOrigins.map((week) => (
                <ReferenceLine
                  key={week}
                  x={week}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                />
              ))}
              {viewMode !== "both" && (
                <>
                  <Area
                    type="monotone"
                    dataKey="bandBase"
                    stackId="band"
                    stroke="none"
                    fill="transparent"
                    connectNulls={false}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="bandWidth"
                    stackId="band"
                    stroke="none"
                    fill="url(#forecastBand)"
                    connectNulls={false}
                    dot={false}
                    isAnimationActive={false}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="observed"
                stroke={OBSERVED_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              {(viewMode === "ensemble" || viewMode === "both") && (
                <Line
                  type="monotone"
                  dataKey="ensemble"
                  stroke={ENSEMBLE_COLOR}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={{ r: 3, fill: ENSEMBLE_COLOR }}
                  connectNulls
                />
              )}
              {(viewMode === "neural_ode" || viewMode === "both") && (
                <Line
                  type="monotone"
                  dataKey="neural"
                  stroke={NEURAL_COLOR}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={{ r: 3, fill: NEURAL_COLOR }}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {viewMode === "both" ? (
          <div className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {ensemblePrimary && (
              <p>
                1-week ensemble (from{" "}
                {formatShortDate(ensembleForecast!.forecast_origin_week)}):{" "}
                {trendLabelText(ensemblePrimary.predicted_trend)} · confidence{" "}
                {ensemblePrimary.confidence_label ?? "—"}.
              </p>
            )}
            {neuralPrimary && (
              <p>
                1-week Neural ODE research (from{" "}
                {formatShortDate(neuralOdeForecast!.forecast_origin_week)}):{" "}
                {trendLabelText(neuralPrimary.predicted_trend)} · confidence{" "}
                {neuralPrimary.confidence_label ?? "—"}.
              </p>
            )}
            <p className="text-[11px] italic">
              Surveillance context only, not for clinical decisions.
            </p>
          </div>
        ) : (
          primaryHorizon && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              1-week outlook ({forecast?.model_name ?? "model"}):{" "}
              {trendLabelText(primaryHorizon.predicted_trend)} · confidence{" "}
              {primaryHorizon.confidence_label ?? "—"}. Surveillance context only, not
              for clinical decisions.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
