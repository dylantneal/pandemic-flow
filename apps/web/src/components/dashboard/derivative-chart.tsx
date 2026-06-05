"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { derivativeExplainer } from "@/lib/copy/neural-ode-copy";
import { formatShortDate } from "@/lib/dashboard/format";
import type { DerivativeSeries } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const RATE_COLOR = "var(--chart-3)";
const ZERO_COLOR = "var(--muted-foreground)";

export function DerivativeChart({
  series,
  regionName,
  className,
}: {
  series: DerivativeSeries | null;
  regionName: string;
  className?: string;
}) {
  const chartData = useMemo(() => {
    if (!series?.points.length) return [];
    return series.points.map((p) => ({
      date: p.chart_date,
      rate: p.predicted_derivative,
      level: p.predicted_value,
    }));
  }, [series]);

  if (!series || chartData.length === 0) {
    return (
      <Card className={cn("border-border/80 bg-muted/30 shadow-sm", className)}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle className="text-lg">{derivativeExplainer.title}</CardTitle>
          </div>
          <CardDescription className="max-w-2xl leading-relaxed">
            When a production Neural ODE model is active for {regionName}, this chart
            shows how fast the model thinks activity is changing along the forecast
            path. Run inference after training to populate derivative samples.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[5rem] items-center justify-center rounded-lg border border-dashed border-border bg-card/80 px-4">
            <p className="text-center text-sm text-muted-foreground">
              No learned-dynamics curve available yet
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-border/80 bg-card shadow-sm", className)}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" aria-hidden />
              <CardTitle className="text-lg">{derivativeExplainer.title}</CardTitle>
            </div>
            <CardDescription className="max-w-2xl leading-relaxed">
              {derivativeExplainer.lead} Origin week:{" "}
              {formatShortDate(series.forecast_origin_week)} ({series.model_name}).
            </CardDescription>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/25 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            {derivativeExplainer.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs italic">{derivativeExplainer.caution}</p>
        </div>
      </CardHeader>

      <CardContent>
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-5 rounded"
              style={{ background: RATE_COLOR }}
            />
            Estimated dx/dt (per week)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-px w-5 border-t border-dashed"
              style={{ borderColor: ZERO_COLOR }}
            />
            Zero line (flat)
          </span>
        </div>

        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickFormatter={(d) => formatShortDate(String(d))}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v) => Number(v).toFixed(2)}
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
                    name === "rate" ? "Rate of change" : "Model level";
                  return [Number.isFinite(n) ? n.toFixed(3) : "—", label];
                }}
                labelFormatter={(label) => formatShortDate(String(label))}
              />
              <ReferenceLine y={0} stroke={ZERO_COLOR} strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="rate"
                stroke={RATE_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
