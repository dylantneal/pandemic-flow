import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ModelRunRow } from "@/lib/dashboard/types";
import { formatShortDate } from "@/lib/dashboard/format";
import {
  isCanonicalConservativeCandidate,
  promotionBlockFromMetrics,
  promotionStatusLabel,
  researchStatusLabel,
} from "@/lib/model-lab/neural-ode-promotion";

function metricChip(label: string, value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
        {typeof value === "number" ? value.toFixed(4) : String(value)}
      </p>
    </div>
  );
}

export function NeuralOdeRunCards({ runs }: { runs: ModelRunRow[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <p className="text-sm font-medium text-foreground">No Neural ODE runs yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Train a candidate for Illinois or Cook County with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run train:neural-ode</code>
          , then promote after the gate passes. Inference fills dashboard forecasts and
          derivative curves.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {runs.map((run) => {
        const metrics = run.metrics ?? {};
        const hyper = run.hyperparameters ?? {};
        const byHorizon = (metrics.by_horizon ?? {}) as Record<
          string,
          { mae?: number; rmse?: number }
        >;
        const mae1 = byHorizon["1"]?.mae;
        const gates = (metrics.correction_gates_by_horizon ?? {}) as Record<
          string,
          number
        >;
        const impOverall = (
          metrics.improvement_vs_ensemble as
            | { overall?: { pct_improved?: number } }
            | undefined
        )?.overall;
        const promotion = promotionBlockFromMetrics(metrics);
        const prodStatus = promotion?.production_status;
        const researchStatus = promotion?.research_status;
        const isCanonical = isCanonicalConservativeCandidate(run.version);

        return (
          <Card
            key={run.id}
            className="border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md"
          >
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-lg">{run.model_name}</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={run.status === "production" ? "default" : "secondary"}
                    className="shrink-0 capitalize"
                  >
                    {run.status === "production" ? "production" : "candidate"}
                  </Badge>
                  {isCanonical && (
                    <Badge variant="outline" className="shrink-0 border-primary/40">
                      canonical conservative
                    </Badge>
                  )}
                  {prodStatus && run.status !== "production" && (
                    <Badge
                      variant={
                        prodStatus === "near_miss" ? "outline" : "secondary"
                      }
                      className={
                        prodStatus === "near_miss"
                          ? "shrink-0 border-amber-500/50 text-amber-800 dark:text-amber-200"
                          : "shrink-0"
                      }
                    >
                      {promotionStatusLabel(prodStatus)}
                    </Badge>
                  )}
                  {researchStatus &&
                    researchStatus !== "fail" &&
                    run.status !== "production" && (
                      <Badge variant="outline" className="shrink-0 border-primary/30">
                        {researchStatusLabel(researchStatus)}
                      </Badge>
                    )}
                </div>
              </div>
              <CardDescription>
                Neural ODE · v{run.version} · updated{" "}
                {formatShortDate(run.updated_at.slice(0, 10))}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {metricChip("Holdout 1w MAE", mae1 ?? null)}
                {metricChip(
                  "80% coverage",
                  (metrics.interval_coverage as { overall?: number } | undefined)
                    ?.overall ?? null,
                )}
                {metricChip(
                  "vs ensemble (origins)",
                  impOverall?.pct_improved != null
                    ? `${(impOverall.pct_improved * 100).toFixed(1)}% improved`
                    : null,
                )}
                {metricChip("Gate h2", gates["2"] ?? null)}
                {metricChip("Gate h4", gates["4"] ?? null)}
                {metricChip("Seed", hyper.seed as number | undefined)}
                {metricChip(
                  "Data hash",
                  hyper.data_hash
                    ? String(hyper.data_hash).slice(0, 12) + "…"
                    : null,
                )}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {run.status === "production"
                  ? "This run powers region dashboard Neural ODE views and weekly inference."
                  : prodStatus === "near_miss"
                    ? "Safe on short horizons and intervals, but 4-week MAE is slightly above the ensemble slack — research candidate only."
                    : "Candidate runs remain off production dashboards until promotion passes baseline, calibration, and regime gates."}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
