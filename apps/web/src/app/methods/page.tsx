import { AppShell } from "@/components/layout/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Methods | Pandemic Flow",
  description: "How wastewater surveillance and modeling will work in Pandemic Flow.",
};

const sections = [
  {
    title: "What wastewater measures",
    body: "Each sample reflects SARS-CoV-2 RNA shed into a sewershed — a community-level biological signal, not a direct case count or individual diagnosis.",
  },
  {
    title: "What we will model",
    body: "The platform will emphasize trend direction, rate of change, and short-horizon forecasts with uncertainty — comparing Neural ODE trajectories to simple baselines.",
  },
  {
    title: "What we will not claim",
    body: "Pandemic Flow will not estimate exact infections, individual risk, or medical certainty. Wastewater should be interpreted alongside other surveillance systems.",
  },
] as const;

export default function MethodsPage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Methods</h1>
          <p className="max-w-2xl text-muted-foreground">
            Placeholder for the scientific methodology. Phase 2 will document CDC
            NWSS ingestion, cleaning rules, activity indexing, and model evaluation.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {sections.map((section) => (
            <Card key={section.title} className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {section.body}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
