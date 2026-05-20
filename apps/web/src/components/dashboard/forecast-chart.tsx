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
import { TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendChip } from "@/components/dashboard/trend-chip";
import { formatShortDate, trendLabelText } from "@/lib/dashboard/format";
import type { RegionForecast, TimeseriesPoint } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const OBSERVED_COLOR = "var(--chart-1)";
const FORECAST_COLOR = "var(--chart-2)";

type ChartRow = {
  week: string;
  observed: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
  bandWidth: number | null;
  kind: "observed" | "forecast" | "bridge";
};

function buildChartData(
  timeseries: TimeseriesPoint[],
  forecast: RegionForecast | null,
  contextWeeks: number = 12,
): ChartRow[] {
  const observed: ChartRow[] = timeseries
    .filter((d) => d.weighted_activity_index != null)
    .slice(-contextWeeks)
    .map((d) => ({
      week: d.week_start,
      observed: d.weighted_activity_index as number,
      forecast: null,
      lower: null,
      upper: null,
      bandWidth: null,
      kind: "observed" as const,
    }));

  if (!forecast || forecast.horizons.length === 0) {
    return observed;
  }

  const originWeek = forecast.forecast_origin_week;
  const originPoint = observed.find((p) => p.week === originWeek);
  const bridgeValue = originPoint?.observed ?? null;

  const forecastRows: ChartRow[] = forecast.horizons.map((h) => ({
    week: h.target_date,
    observed: null,
    forecast: h.predicted_activity_index,
    lower: h.lower_bound,
    upper: h.upper_bound,
    bandWidth:
      h.lower_bound != null && h.upper_bound != null
        ? h.upper_bound - h.lower_bound
        : null,
    kind: "forecast" as const,
  }));

  // Bridge point at origin so forecast line connects to observed
  if (bridgeValue != null && forecastRows.length > 0) {
    const bridge: ChartRow = {
      week: originWeek,
      observed: null,
      forecast: bridgeValue,
      lower: bridgeValue,
      upper: bridgeValue,
      bandWidth: 0,
      kind: "bridge",
    };
    // Only add bridge if not already last observed point with forecast overlap
    const lastObserved = observed[observed.length - 1];
    if (lastObserved?.week !== originWeek) {
      return [...observed, bridge, ...forecastRows];
    }
    // Patch last observed to also carry forecast anchor
    const patched = [...observed];
    patched[patched.length - 1] = {
      ...lastObserved,
      forecast: bridgeValue,
      lower: bridgeValue,
      upper: bridgeValue,
      bandWidth: 0,
      kind: "bridge",
    };
    return [...patched, ...forecastRows];
  }

  return [...observed, ...forecastRows];
}

export function ForecastChart({
  timeseries,
  forecast,
  regionName,
  className,
}: {
  timeseries: TimeseriesPoint[];
  forecast: RegionForecast | null;
  regionName: string;
  className?: string;
}) {
  const chartData = useMemo(
    () => buildChartData(timeseries, forecast),
    [timeseries, forecast],
  );

  const primaryHorizon = forecast?.horizons[0];
  const fourWeekHorizon = forecast?.horizons.find((h) => h.horizon_weeks === 4);

  if (!forecast || forecast.horizons.length === 0) {
    return (
      <Card className={cn("border-border/80 bg-muted/30 shadow-sm", className)}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle className="text-lg">Short-horizon forecast</CardTitle>
          </div>
          <CardDescription className="max-w-2xl leading-relaxed">
            Baseline forecasts are generated after weekly metrics update. Run the
            forecast pipeline to populate predictions for {regionName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[6rem] items-center justify-center rounded-lg border border-dashed border-border bg-card/80 px-4">
            <p className="text-center text-sm text-muted-foreground">
              No forecast data available yet
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-border/80 bg-card shadow-sm", className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle className="text-lg">Short-horizon forecast</CardTitle>
          </div>
          <CardDescription className="mt-1 max-w-2xl leading-relaxed">
            Ensemble baseline projection for {regionName} from the week of{" "}
            {formatShortDate(forecast.forecast_origin_week)}. Shaded band shows an
            approximate 80% interval from backtest residuals.
          </CardDescription>
        </div>
        {fourWeekHorizon && (
          <TrendChip label={fourWeekHorizon.predicted_trend} />
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: OBSERVED_COLOR }}
            />
            Observed
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded border border-dashed"
              style={{ borderColor: FORECAST_COLOR }}
            />
            Forecast
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-4 rounded opacity-30"
              style={{ background: FORECAST_COLOR }}
            />
            80% interval
          </span>
        </div>

        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={FORECAST_COLOR} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={FORECAST_COLOR} stopOpacity={0.05} />
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
                  const label =
                    name === "observed"
                      ? "Observed"
                      : name === "forecast"
                        ? "Forecast"
                        : String(name);
                  return [Number.isFinite(n) ? n.toFixed(2) : "—", label];
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row?.week ? formatShortDate(row.week) : "";
                }}
              />
              {forecast.forecast_origin_week && (
                <ReferenceLine
                  x={forecast.forecast_origin_week}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                />
              )}
              <Area
                type="monotone"
                dataKey="lower"
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
              <Line
                type="monotone"
                dataKey="observed"
                stroke={OBSERVED_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke={FORECAST_COLOR}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 3, fill: FORECAST_COLOR }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {primaryHorizon && (
          <p className="mt-3 text-xs text-muted-foreground">
            1-week outlook: {trendLabelText(primaryHorizon.predicted_trend)} ·
            confidence {primaryHorizon.confidence_label ?? "—"}. Baseline models only;
            not a clinical forecast.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
