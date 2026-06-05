import type { NeuralOdePerformanceRow } from "@/lib/dashboard/types";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

const REGIME_ORDER = ["rising", "falling", "stable", "turn_point", "unknown"] as const;

export function NeuralOdeExtendedMetrics({
  runs,
}: {
  runs: NeuralOdePerformanceRow[];
}) {
  if (runs.length === 0) return null;

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="coverage-heading">
        <h3 id="coverage-heading" className="text-base font-semibold tracking-tight">
          Interval calibration
        </h3>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Empirical coverage of nominal 80% forecast bands. Values near 80% suggest
          well-calibrated uncertainty; very low coverage means intervals are too narrow,
          very high coverage means they are too wide.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/80 bg-card">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Region / model</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">80% coverage</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.model_name} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{run.entity_label}</span>
                    <span className="block text-xs text-muted-foreground">
                      v{run.version}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{run.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatPct(run.interval_coverage)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="regime-heading">
        <h3 id="regime-heading" className="text-base font-semibold tracking-tight">
          Regime-specific MAE
        </h3>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Error broken out by origin-week regime: rising, falling, stable, and
          turn-point weeks near ±0.25 activity-index thresholds.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/80 bg-card">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Region / model</th>
                {REGIME_ORDER.map((regime) => (
                  <th key={regime} className="px-4 py-3 text-right font-medium capitalize">
                    {regime.replace("_", " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.model_name} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{run.entity_label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {run.model_name} · {run.status}
                    </span>
                  </td>
                  {REGIME_ORDER.map((regime) => {
                    const block = run.by_regime?.[regime];
                    return (
                      <td key={regime} className="px-4 py-3 text-right tabular-nums">
                        {block?.mae != null ? block.mae.toFixed(3) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="quality-heading">
        <h3 id="quality-heading" className="text-base font-semibold tracking-tight">
          Data-quality segments
        </h3>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Holdout error on high-quality origin weeks (quality score ≥ 0.7) vs lower-quality
          weeks. Useful for spotting whether the model fails mainly on sparse or noisy periods.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/80 bg-card">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Region / model</th>
                <th className="px-4 py-3 text-right font-medium">High quality MAE</th>
                <th className="px-4 py-3 text-right font-medium">Low quality MAE</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.model_name} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3 font-medium">{run.entity_label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {run.by_quality_segment?.high?.mae?.toFixed(3) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {run.by_quality_segment?.low?.mae?.toFixed(3) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
