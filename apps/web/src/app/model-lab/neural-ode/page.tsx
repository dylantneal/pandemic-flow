import { AppShell } from "@/components/layout/app-shell";
import { ModelLabNav } from "@/components/model-lab/model-lab-nav";
import { NeuralOdeComparison } from "@/components/model-lab/neural-ode-comparison";
import { NeuralOdeExplainer } from "@/components/model-lab/neural-ode-explainer";
import { NeuralOdeExtendedMetrics } from "@/components/model-lab/neural-ode-extended-metrics";
import { NeuralOdeFraming } from "@/components/model-lab/neural-ode-framing";
import { NeuralOdeResearchBanner } from "@/components/model-lab/neural-ode-research-banner";
import { NeuralOdeRunCards } from "@/components/model-lab/neural-ode-run-cards";
import { ResearchDisclosure } from "@/components/model-lab/research-disclosure";
import { modelLabNeuralOde } from "@/lib/copy/neural-ode-copy";
import { isCanonicalConservativeCandidate } from "@/lib/model-lab/neural-ode-promotion";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  getBaselinePerformance,
  getNeuralOdePerformance,
  getNeuralOdeRuns,
} from "@/lib/supabase/forecasts";

/** Canonical research run and any promoted production runs stay visible by default. */
const isPrimaryRun = (version: string, status: string) =>
  isCanonicalConservativeCandidate(version) || status === "production";

/** See REVALIDATE_FORECASTS_SECONDS in lib/supabase/cache-config.ts */
export const revalidate = 21600;

export const metadata = buildPageMetadata({
  title: "Learned dynamics · Model Lab",
  description:
    "Neural ODE research layer: why v1.7.5 stays off production dashboards and what we learned from constrained wastewater forecasting.",
  path: "/model-lab/neural-ode",
});

export default async function NeuralOdeModelLabPage() {
  const [neuralRuns, performance, baselines] = await Promise.all([
    getNeuralOdeRuns(),
    getNeuralOdePerformance(),
    getBaselinePerformance(),
  ]);

  const primaryRuns = neuralRuns.filter((run) =>
    isPrimaryRun(run.version, run.status),
  );
  const primaryPerformance = performance.filter((run) =>
    isPrimaryRun(run.version, run.status),
  );
  const hasMoreRuns =
    primaryRuns.length > 0 && primaryRuns.length < neuralRuns.length;
  const hasMorePerformance =
    primaryPerformance.length > 0 &&
    primaryPerformance.length < performance.length;

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
          {hasMoreRuns ? (
            <ResearchDisclosure
              showLabel="Show all candidate runs"
              hideLabel="Show only the canonical run"
              summary={<NeuralOdeRunCards runs={primaryRuns} />}
              details={<NeuralOdeRunCards runs={neuralRuns} />}
            />
          ) : (
            <NeuralOdeRunCards runs={neuralRuns} />
          )}
        </section>

        <section className="space-y-4" aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="text-lg font-semibold tracking-tight">
            Holdout vs baselines
          </h2>
          {hasMorePerformance ? (
            <ResearchDisclosure
              showLabel="Show all candidate runs"
              hideLabel="Show only the canonical run"
              summary={
                <NeuralOdeComparison
                  neuralRuns={primaryPerformance}
                  baselines={baselines}
                />
              }
              details={
                <NeuralOdeComparison
                  neuralRuns={performance}
                  baselines={baselines}
                />
              }
            />
          ) : (
            <NeuralOdeComparison neuralRuns={performance} baselines={baselines} />
          )}
        </section>

        <section className="space-y-4" aria-labelledby="extended-metrics-heading">
          <h2
            id="extended-metrics-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Calibration & regime breakdown
          </h2>
          {hasMorePerformance ? (
            <ResearchDisclosure
              showLabel="Show all candidate runs"
              hideLabel="Show only the canonical run"
              summary={<NeuralOdeExtendedMetrics runs={primaryPerformance} />}
              details={<NeuralOdeExtendedMetrics runs={performance} />}
            />
          ) : (
            <NeuralOdeExtendedMetrics runs={performance} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
