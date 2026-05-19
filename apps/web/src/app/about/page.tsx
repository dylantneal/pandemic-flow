import { AppShell } from "@/components/layout/app-shell";
import { BottomLine } from "@/components/dashboard/bottom-line";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "About",
  description: "About the Pandemic Flow COVID wastewater dynamics project.",
};

export default function AboutPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            About
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Pandemic Flow</h1>
          <p className="text-muted-foreground leading-relaxed">
            An educational and research-oriented platform that visualizes
            community-level COVID activity from public wastewater surveillance
            data, with a Neural ODE layer planned to explore continuous dynamics
            and short-horizon forecasts.
          </p>
        </header>

        <BottomLine>
          <p>
            This tool is <strong>not a medical diagnostic</strong> and does not
            estimate individual risk. Wastewater trends indicate community viral
            activity and should be read with appropriate caution.
          </p>
        </BottomLine>

        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Current status</CardTitle>
            <CardDescription className="leading-relaxed">
              Phase 5 delivers Illinois and Cook County dashboards with weekly
              activity indices, historical charts, site lists, and data quality
              panels. Automated weekly data refresh runs via GitHub Actions.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">What&apos;s next</CardTitle>
            <CardDescription className="leading-relaxed">
              Neural ODE forecasting, national overview, and richer model
              explainability are planned for future phases.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppShell>
  );
}
