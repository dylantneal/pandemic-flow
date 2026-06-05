import type {
  BaselinePerformanceRow,
  NeuralOdePerformanceRow,
} from "@/lib/dashboard/types";

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function NeuralOdeComparison({
  neuralRuns,
  baselines,
}: {
  neuralRuns: NeuralOdePerformanceRow[];
  baselines: BaselinePerformanceRow[];
}) {
  const persistence = baselines.find((b) => b.model_type === "persistence");
  const ensemble = baselines.find((b) => b.model_type === "ensemble");

  if (neuralRuns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        No Neural ODE training runs in the database yet. Train with{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">train_neural_ode.py</code>{" "}
        to see holdout metrics here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Holdout MAE from Neural ODE training compared to production baseline rolling-origin
        scores. Lower MAE is better. This table helps you see whether promotion criteria
        are within reach before running{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">promote_model.py</code>.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border/80 bg-card">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Region / model</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">1w MAE</th>
              <th className="px-4 py-3 text-right font-medium">2w MAE</th>
              <th className="px-4 py-3 text-right font-medium">4w MAE</th>
              <th className="px-4 py-3 text-right font-medium">1w trend</th>
            </tr>
          </thead>
          <tbody>
            {persistence && (
              <tr className="border-b border-border/40 bg-muted/15">
                <td className="px-4 py-3 font-medium">Persistence (baseline)</td>
                <td className="px-4 py-3 text-muted-foreground">production</td>
                {[1, 2, 4].map((h) => {
                  const m = persistence.horizons.find((x) => x.horizon_weeks === h);
                  return (
                    <td
                      key={h}
                      className="px-4 py-3 text-right tabular-nums text-muted-foreground"
                    >
                      {m?.mae?.toFixed(3) ?? "—"}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {formatPct(
                    persistence.horizons.find((x) => x.horizon_weeks === 1)
                      ?.trend_accuracy ?? null,
                  )}
                </td>
              </tr>
            )}
            {ensemble && (
              <tr className="border-b border-border/40 bg-muted/15">
                <td className="px-4 py-3 font-medium">Ensemble (baseline)</td>
                <td className="px-4 py-3 text-muted-foreground">production</td>
                {[1, 2, 4].map((h) => {
                  const m = ensemble.horizons.find((x) => x.horizon_weeks === h);
                  return (
                    <td
                      key={h}
                      className="px-4 py-3 text-right tabular-nums text-muted-foreground"
                    >
                      {m?.mae?.toFixed(3) ?? "—"}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right text-muted-foreground">—</td>
              </tr>
            )}
            {neuralRuns.map((run) => (
              <tr key={run.model_name} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium">{run.entity_label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {run.model_name} v{run.version}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize">
                  {run.status === "production" ? "production" : "candidate"}
                </td>
                {[1, 2, 4].map((h) => {
                  const m = run.horizons.find((x) => x.horizon_weeks === h);
                  return (
                    <td key={h} className="px-4 py-3 text-right tabular-nums">
                      {m?.mae?.toFixed(3) ?? "—"}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatPct(
                    run.horizons.find((x) => x.horizon_weeks === 1)?.trend_accuracy ??
                      null,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
