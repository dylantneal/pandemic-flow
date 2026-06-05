import { AppShell } from "@/components/layout/app-shell";
import { ModelLabNav } from "@/components/model-lab/model-lab-nav";
import { NeuralOdeComparison } from "@/components/model-lab/neural-ode-comparison";
import { NeuralOdeExplainer } from "@/components/model-lab/neural-ode-explainer";
import { NeuralOdeExtendedMetrics } from "@/components/model-lab/neural-ode-extended-metrics";
import { NeuralOdeFraming } from "@/components/model-lab/neural-ode-framing";
import { NeuralOdeResearchBanner } from "@/components/model-lab/neural-ode-research-banner";
import { NeuralOdeRunCards } from "@/components/model-lab/neural-ode-run-cards";
import { modelLabNeuralOde } from "@/lib/copy/neural-ode-copy";
import {
  getBaselinePerformance,
  getNeuralOdePerformance,
  getNeuralOdeRuns,
} from "@/lib/supabase/forecasts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Learned dynamics · Model Lab",
  description:
    "Neural ODE research layer — why v1.7.5 stays off production dashboards and what we learned from constrained wastewater forecasting.",
};

export default async function NeuralOdeModelLabPage() {
  const [neuralRuns, performance, baselines] = await Promise.all([
    getNeuralOdeRuns(),
    getNeuralOdePerformance(),
    getBaselinePerformance(),
  ]);

  return (
    <AppShell>
      <div className="space-y-10">
        <header className="space-y-4">
          <ModelLabNav />
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              {modelLabNeuralOde.pageSubtitle}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {modelLabNeuralOde.pageTitle}
            </h1>
            <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
              {modelLabNeuralOde.pageLead}
            </p>
          </div>
        </header>

        <NeuralOdeFraming />

        <NeuralOdeResearchBanner runs={neuralRuns} />

        <NeuralOdeExplainer />

        <section className="space-y-4" aria-labelledby="neural-runs-heading">
          <h2
            id="neural-runs-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Training runs
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Each region has its own model name ({`neural_ode_IL`},{" "}
            {`neural_ode_17031`}). <strong className="text-foreground">v1.7.5-shrinkage-conservative</strong> is
            the frozen canonical research reference (candidate only). Production
            dashboard forecasts remain ensemble-first.
          </p>
          <NeuralOdeRunCards runs={neuralRuns} />
        </section>

        <section className="space-y-4" aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="text-lg font-semibold tracking-tight">
            Holdout vs baselines
          </h2>
          <NeuralOdeComparison neuralRuns={performance} baselines={baselines} />
        </section>

        <section className="space-y-4" aria-labelledby="extended-metrics-heading">
          <h2
            id="extended-metrics-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Calibration & regime breakdown
          </h2>
          <NeuralOdeExtendedMetrics runs={performance} />
        </section>

        <section className="rounded-xl border border-border/80 bg-muted/25 p-6 text-sm leading-relaxed text-muted-foreground">
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Research operator notes
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Frozen reference:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                1.7.5-shrinkage-conservative
              </code>{" "}
              — do not promote; promotion is blocked in code for this version.
            </li>
            <li>
              Optional h4 experiment:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                npm run train:neural-ode:h4-abstain
              </code>{" "}
              then{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                npm run compare:neural-ode:h4-abstain
              </code>
              .
            </li>
            <li>
              Production dashboards: ensemble only unless a future run passes all
              gates and is explicitly promoted.
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
