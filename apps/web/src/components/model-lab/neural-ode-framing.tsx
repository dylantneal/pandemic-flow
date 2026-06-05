import { BarChart3, Compass, ShieldCheck } from "lucide-react";

import { modelLabNeuralOde } from "@/lib/copy/neural-ode-copy";

export function NeuralOdeFraming() {
  const { whyNotPromoted, futureWork, dashboardNote } = modelLabNeuralOde;

  return (
    <div className="space-y-4">
      <section
        className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-5 py-5"
        aria-labelledby="why-not-promoted-heading"
      >
        <div className="flex gap-3">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300"
            aria-hidden
          />
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <h2
              id="why-not-promoted-heading"
              className="text-base font-semibold text-foreground"
            >
              {whyNotPromoted.title}
            </h2>
            <p>{whyNotPromoted.lead}</p>
            <p className="rounded-lg border border-amber-500/20 bg-background/60 px-4 py-3 text-foreground">
              {whyNotPromoted.reason}
            </p>
            <p>{whyNotPromoted.stillValuable}</p>
            <p className="font-medium text-foreground">{whyNotPromoted.productDecision}</p>
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-border/80 bg-card px-5 py-5 shadow-sm"
        aria-labelledby="dashboard-note-heading"
      >
        <div className="flex gap-3">
          <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <h2
              id="dashboard-note-heading"
              className="text-base font-semibold text-foreground"
            >
              {dashboardNote.title}
            </h2>
            <p>{dashboardNote.body}</p>
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-5"
        aria-labelledby="future-work-heading"
      >
        <div className="flex gap-3">
          <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <h2
              id="future-work-heading"
              className="text-base font-semibold text-foreground"
            >
              {futureWork.title}
            </h2>
            <p>{futureWork.lead}</p>
            <ul className="list-disc space-y-2 pl-5">
              {futureWork.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
