import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BaselinePerformanceRow } from "@/lib/dashboard/types";

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNum(value: number | null, digits = 3): string {
  if (value == null) return "—";
  return value.toFixed(digits);
}

export function BaselineMetricsTable({
  performance,
}: {
  performance: BaselinePerformanceRow[];
}) {
  if (performance.length === 0) {
    return (
      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Baseline performance</CardTitle>
          <CardDescription>
            Run forecast backfill and evaluation to populate rolling-origin metrics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No evaluation data yet. Use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              npm run forecast:backfill
            </code>{" "}
            followed by{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              npm run forecast:evaluate
            </code>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  const horizons = [
    ...new Set(performance.flatMap((p) => p.horizons.map((h) => h.horizon_weeks))),
  ].sort((a, b) => a - b);

  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Baseline performance</CardTitle>
        <CardDescription>
          Rolling-origin backtest metrics by forecast horizon. Lower MAE/RMSE is
          better; trend accuracy measures direction (rising/falling/stable).
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Model</th>
              {horizons.map((h) => (
                <th key={h} colSpan={3} className="pb-2 pr-4 text-center font-medium">
                  {h}-week
                </th>
              ))}
              <th className="pb-2 font-medium">N</th>
            </tr>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4" />
              {horizons.flatMap((h) => [
                <th key={`${h}-mae`} className="py-2 pr-2 font-normal">
                  MAE
                </th>,
                <th key={`${h}-rmse`} className="py-2 pr-2 font-normal">
                  RMSE
                </th>,
                <th key={`${h}-trend`} className="py-2 pr-4 font-normal">
                  Trend
                </th>,
              ])}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {performance.map((row) => (
              <tr key={row.model_name} className="border-b border-border/40">
                <td className="py-2.5 pr-4 font-medium">{row.model_name}</td>
                {horizons.flatMap((h) => {
                  const m = row.horizons.find((x) => x.horizon_weeks === h);
                  return [
                    <td
                      key={`${row.model_name}-${h}-mae`}
                      className="py-2.5 pr-2 tabular-nums"
                    >
                      {formatNum(m?.mae ?? null)}
                    </td>,
                    <td
                      key={`${row.model_name}-${h}-rmse`}
                      className="py-2.5 pr-2 tabular-nums"
                    >
                      {formatNum(m?.rmse ?? null)}
                    </td>,
                    <td
                      key={`${row.model_name}-${h}-trend`}
                      className="py-2.5 pr-4 tabular-nums"
                    >
                      {formatPct(m?.trend_accuracy ?? null)}
                    </td>,
                  ];
                })}
                <td className="py-2.5 tabular-nums text-muted-foreground">
                  {row.total_evaluations}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
