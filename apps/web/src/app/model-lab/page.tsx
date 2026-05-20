import { AppShell } from "@/components/layout/app-shell";
import { BaselineMetricsTable } from "@/components/model-lab/baseline-metrics-table";
import { HorizonErrorChart } from "@/components/model-lab/horizon-error-chart";
import { ModelRunCards } from "@/components/model-lab/model-run-cards";
import {
  getAllModelRuns,
  getBaselinePerformance,
} from "@/lib/supabase/forecasts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Model Lab",
  description:
    "Baseline forecast performance and model run tracking for COVID Flow wastewater dynamics.",
};

export default async function ModelLabPage() {
  const [runs, performance] = await Promise.all([
    getAllModelRuns(),
    getBaselinePerformance(),
  ]);

  return (
    <AppShell>
      <div className="space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Model lab
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Baseline forecast evaluation
          </h1>
          <p className="max-w-3xl text-muted-foreground leading-relaxed">
            Honest short-horizon baselines establish a comparison bar before Neural
            ODE modeling. Forecasts use rolling-origin backtests on weekly{" "}
            <strong>weighted activity index</strong> for Illinois and Cook County.
            Intervals reflect residual spread from past forecast errors, not clinical
            uncertainty.
          </p>
        </header>

        <section className="space-y-4" aria-labelledby="runs-heading">
          <h2 id="runs-heading" className="text-lg font-semibold tracking-tight">
            Model runs
          </h2>
          <ModelRunCards runs={runs} />
        </section>

        <section className="space-y-4" aria-labelledby="metrics-heading">
          <h2 id="metrics-heading" className="text-lg font-semibold tracking-tight">
            Performance metrics
          </h2>
          <BaselineMetricsTable performance={performance} />
        </section>

        <HorizonErrorChart performance={performance} />

        <section className="rounded-lg border border-border/80 bg-muted/30 p-6 text-sm text-muted-foreground leading-relaxed">
          <h2 className="mb-2 text-base font-semibold text-foreground">
            How to read these results
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Persistence</strong> assumes next week equals this week — often
              hard to beat at 1-week horizon.
            </li>
            <li>
              <strong>Moving average</strong> smooths recent weeks; useful when signal
              is noisy.
            </li>
            <li>
              <strong>Trend</strong> extrapolates recent direction; can overshoot at
              longer horizons.
            </li>
            <li>
              <strong>Seasonal naive</strong> compares to the same week last year (52-week
              lag).
            </li>
            <li>
              <strong>Ensemble</strong> averages component baselines for dashboard
              display; Neural ODE (Phase 7) must beat these on held-out weeks to be
              promoted.
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
