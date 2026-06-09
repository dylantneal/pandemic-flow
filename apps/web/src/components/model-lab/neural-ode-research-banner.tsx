import { AlertTriangle, FlaskConical } from "lucide-react";

import { modelLabNeuralOde } from "@/lib/copy/neural-ode-copy";
import type { ModelRunRow } from "@/lib/dashboard/types";
import { isCanonicalConservativeCandidate } from "@/lib/model-lab/neural-ode-promotion";

export function NeuralOdeResearchBanner({ runs }: { runs: ModelRunRow[] }) {
  const hasProduction = runs.some((run) => run.status === "production");
  const candidateCount = runs.filter((run) => run.status === "candidate").length;
  const hasCanonical = runs.some((run) =>
    isCanonicalConservativeCandidate(run.version),
  );

  return (
    <div className="space-y-3">
      {hasCanonical && !hasProduction && (
        <>
          <div className="rounded-xl border border-border/80 bg-card px-5 py-4 shadow-sm">
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">
                {modelLabNeuralOde.researchConclusion.title}
              </p>
              <p>{modelLabNeuralOde.researchConclusion.plainSummary}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                    What works
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {modelLabNeuralOde.researchConclusion.works.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Why not production
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {modelLabNeuralOde.researchConclusion.notProduction.map(
                      (item) => (
                        <li key={item}>{item}</li>
                      ),
                    )}
                  </ul>
                </div>
              </div>
              <p className="text-xs italic">
                {modelLabNeuralOde.researchConclusion.framing}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-primary/25 bg-primary/5 px-5 py-4">
            <div className="flex gap-3">
              <FlaskConical
                className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                aria-hidden
              />
              <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">
                  {modelLabNeuralOde.canonicalCandidate.title}
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  {modelLabNeuralOde.canonicalCandidate.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-5 py-4">
        <div className="flex gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">
              Research track: not a case-count predictor
            </p>
            <p>{modelLabNeuralOde.targetClarification}</p>
            {!hasProduction && (
              <p>{modelLabNeuralOde.researchBanner}</p>
            )}
            {candidateCount > 0 && !hasProduction && (
              <p>
                {candidateCount} candidate run{candidateCount === 1 ? "" : "s"} in
                the database; none are promoted to production dashboards yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
