import { ArrowRight, BrainCircuit, GitBranch, LineChart } from "lucide-react";

import {
  neuralOdeHowItWorks,
  modelLabNeuralOde,
} from "@/lib/copy/neural-ode-copy";

const icons = [LineChart, BrainCircuit, GitBranch] as const;

export function NeuralOdeExplainer() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-card px-6 py-8 shadow-sm sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Phase 7 · Learned dynamics
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          What is a Neural ODE here?
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
          Instead of a fixed rule like “next week equals this week,” we fit a small
          neural network that describes <strong className="text-foreground">how fast</strong>{" "}
          activity changes at any moment along a trajectory. The model then integrates
          that law forward in time — similar in spirit to how physics simulates motion,
          but learned from wastewater history.
        </p>
      </section>

      <section className="space-y-4" aria-labelledby="how-heading">
        <h3 id="how-heading" className="text-lg font-semibold tracking-tight">
          How it works in three steps
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          {neuralOdeHowItWorks.map((item, i) => {
            const Icon = icons[i] ?? LineChart;
            return (
              <div
                key={item.step}
                className="relative rounded-xl border border-border/80 bg-card p-5 shadow-sm"
              >
                <p className="text-xs font-semibold tabular-nums text-primary">
                  Step {item.step}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" aria-hidden />
                  <p className="font-medium text-foreground">{item.title}</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                {i < neuralOdeHowItWorks.length - 1 && (
                  <ArrowRight
                    className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-muted-foreground/50 md:block"
                    aria-hidden
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="rounded-xl border border-border/80 bg-muted/25 p-6"
        aria-labelledby="gate-heading"
      >
        <h3 id="gate-heading" className="text-lg font-semibold tracking-tight">
          {modelLabNeuralOde.promotionTitle}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {modelLabNeuralOde.vsBaselines}
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {modelLabNeuralOde.promotionBullets.map((bullet) => (
            <li
              key={bullet}
              className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {bullet}
            </li>
          ))}
        </ul>
        <h4 className="mt-6 text-base font-semibold text-foreground">
          {modelLabNeuralOde.promotionTiersTitle}
        </h4>
        <ul className="mt-3 space-y-2">
          {modelLabNeuralOde.promotionTiers.map((tier) => (
            <li
              key={tier}
              className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/80" />
              {tier}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-4 text-sm leading-relaxed text-muted-foreground">
        <strong className="text-foreground">On region dashboards:</strong> use the
        forecast model selector to view ensemble baseline, Neural ODE, or both. The
        rate-of-change chart appears when Neural ODE is selected — it shows the model’s
        estimated derivative (dx/dt), not a separate laboratory measurement.
      </section>
    </div>
  );
}
