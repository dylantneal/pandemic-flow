import { AppShell } from "@/components/layout/app-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "About | Pandemic Flow",
  description: "About the Pandemic Flow COVID wastewater dynamics project.",
};

export default function AboutPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">About</h1>
          <p className="text-muted-foreground leading-relaxed">
            Pandemic Flow is an educational and research-oriented platform that
            visualizes community-level COVID activity from public wastewater
            surveillance data, with a Neural ODE layer to explore hidden continuous
            dynamics.
          </p>
        </div>

        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Current phase</CardTitle>
            <CardDescription className="leading-relaxed">
              Phase 1 establishes the monorepo, Next.js shell, Supabase foundation,
              CI, and Vercel deployment. Data ingestion and Illinois/Cook County
              dashboards arrive in Phase 2.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Disclaimer</CardTitle>
            <CardDescription className="leading-relaxed">
              This is not a medical diagnostic tool and does not estimate individual
              risk. Wastewater trends indicate community-level viral activity and
              should be interpreted with appropriate caution and alongside other
              public health data.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppShell>
  );
}
