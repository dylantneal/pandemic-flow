"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BaselinePerformanceRow } from "@/lib/dashboard/types";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function HorizonErrorChart({
  performance,
}: {
  performance: BaselinePerformanceRow[];
}) {
  const withMae = performance.filter((p) =>
    p.horizons.some((h) => h.mae != null),
  );

  if (withMae.length === 0) {
    return null;
  }

  const horizons = [1, 2, 3, 4];
  const chartData = horizons.map((h) => {
    const row: Record<string, string | number> = { horizon: `${h}w` };
    for (const model of withMae) {
      const m = model.horizons.find((x) => x.horizon_weeks === h);
      if (m?.mae != null) {
        row[model.model_name] = m.mae;
      }
    }
    return row;
  });

  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">MAE by horizon</CardTitle>
        <CardDescription>
          Mean absolute error on held-out weekly activity index. Compare models
          before trusting more complex approaches.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis
                dataKey="horizon"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {withMae.map((model, i) => (
                <Bar
                  key={model.model_name}
                  dataKey={model.model_name}
                  fill={COLORS[i % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
