import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { ModelLabNav } from "@/components/model-lab/model-lab-nav";
import { BaselineMetricsTable } from "@/components/model-lab/baseline-metrics-table";
import { HorizonErrorChart } from "@/components/model-lab/horizon-error-chart";
import { ModelRunCards } from "@/components/model-lab/model-run-cards";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  getAllModelRuns,
  getBaselinePerformance,
} from "@/lib/supabase/forecasts";

/** See REVALIDATE_FORECASTS_SECONDS in lib/supabase/cache-config.ts */
export const revalidate = 21600;

export const metadata = buildPageMetadata({
  title: "Model Lab",
  description:
    "Baseline forecast performance and model run tracking for COVID Flow wastewater dynamics.",
  path: "/model-lab",
});

export default async function ModelLabPage() {
  const [runs, performance] = await Promise.all([
    getAllModelRuns(),
    getBaselinePerformance(),
  ]);

  return (
    <AppShell>
      <div className="space-y-10">
        <header className="space-y-4">
          <ModelLabNav />
          <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Phase 6 · Model lab
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Baseline forecast evaluation
          </h1>
          <p className="max-w-3xl text-muted-foreground leading-relaxed">
            <strong>Ensemble</strong> forecasts power production dashboards. These
            baselines establish the comparison bar on weekly{" "}
            <strong>weighted activity index</strong> for Illinois and Cook County.
            The Neural ODE is documented separately as a{" "}
            <Link
              href="/model-lab/neural-ode"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              learned dynamics research layer
            </Link>{" "}
            and it is calibrated and useful at short horizons, but not promoted at 4
            weeks.
          </p>
          </div>
        </header>

        <section className="rounded-xl border border-border/70 bg-muted/20 p-5 text-sm leading-relaxed text-muted-foreground sm:p-6">
          <h2 className="mb-2 text-base font-semibold text-foreground">
            What this page is
          </h2>
          <p className="max-w-3xl">
            A behind-the-scenes look at the forecasting models and how accurate they
            are. The <strong className="text-foreground">ensemble baseline</strong>{" "}
            powers the public dashboards. The{" "}
            <Link
              href="/model-lab/neural-ode"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Neural ODE
            </Link>{" "}
            is a research experiment that is not used on the dashboards. If you just
            want the current situation, the{" "}
            <Link
              href="/illinois"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              region dashboards
            </Link>{" "}
            are the place to start.
          </p>
        </section>

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
              <strong>Persistence</strong> assumes next week equals this week, which is often
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
