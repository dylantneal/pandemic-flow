"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatShortDate } from "@/lib/dashboard/format";
import type { TimeseriesPoint } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type RangeKey = "12" | "52" | "all";

const CHART_COLOR = "var(--chart-1)";

export function ActivityTimeseries({
  data,
  regionName,
  className,
}: {
  data: TimeseriesPoint[];
  regionName: string;
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>("52");

  const chartData = useMemo(() => {
    const points = data
      .filter((d) => d.weighted_activity_index != null)
      .map((d) => ({
        week: d.week_start,
        value: d.weighted_activity_index as number,
        label: formatShortDate(d.week_start),
      }));

    if (range === "all") return points;
    const n = range === "12" ? 12 : 52;
    return points.slice(-n);
  }, [data, range]);

  return (
    <Card className={cn("border-border/80 bg-card shadow-sm", className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">Wastewater activity over time</CardTitle>
          <CardDescription>
            Weekly weighted activity index for {regionName}. Higher values indicate
            elevated viral RNA relative to the regional baseline.
          </CardDescription>
        </div>
        <div className="flex gap-1 rounded-lg border border-border/80 bg-muted/40 p-1">
          {(
            [
              ["12", "12 wk"],
              ["52", "52 wk"],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={range === key ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setRange(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No time-series data available.
          </p>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLOR} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={CHART_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
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
                  formatter={(value) => {
                    const n = typeof value === "number" ? value : Number(value);
                    return [Number.isFinite(n) ? n.toFixed(2) : "—", "Activity index"];
                  }}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { week?: string };
                    return row?.week ? formatShortDate(row.week) : "";
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  fill="url(#activityFill)"
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: CHART_COLOR }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Source: CDC NWSS via Pandemic Flow weekly pipeline. Index is relative to
          historical sewershed baselines, not a case count.
        </p>
      </CardContent>
    </Card>
  );
}
