import { AppShell } from "@/components/layout/app-shell";
import { BottomLine } from "@/components/dashboard/bottom-line";
import { MethodologyCard } from "@/components/dashboard/methodology-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Methods",
  description:
    "How Pandemic Flow ingests CDC wastewater data, computes activity indices, and interprets trends.",
};

const sections = [
  {
    title: "What wastewater measures",
    body: "Each sample reflects SARS-CoV-2 RNA shed into a sewershed — a community-level biological signal from everyone connected to that sewer network. It is not a direct case count, hospitalization estimate, or individual diagnosis.",
  },
  {
    title: "How we build weekly metrics",
    body: "We ingest CDC National Wastewater Surveillance System (NWSS) data weekly, clean observations for Illinois sewersheds, and roll them up to site- and region-level metrics. The activity index compares the current week to each site's historical baseline (roughly −1 low to +1 high).",
  },
  {
    title: "Trends and forecasts",
    body: "Trend labels (rising, falling, stable) use week-over-week changes with minimum sample thresholds. Short-horizon forecasts from a Neural ODE model are planned for a later phase; the dashboard currently shows historical series only.",
  },
  {
    title: "Data quality caveats",
    body: "Quality scores reflect sample count, detection limits, and site reporting gaps. A rising index with a low quality score should be interpreted cautiously. Rain, industrial flow, and sewershed coverage changes can shift readings without a true epidemic change.",
  },
] as const;

export default function MethodsPage() {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-4 border-b border-border/80 pb-8 text-center sm:text-left">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Methodology
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            How Pandemic Flow works
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Transparent, research-oriented methods for turning public wastewater
            surveillance into interpretable community activity trends.
          </p>
        </header>

        <MethodologyCard
          title="Primary data source"
          description="All metrics derive from CDC NWSS SARS-CoV-2 wastewater sample records, refreshed on a weekly schedule via our ingestion pipeline."
          sourceLabel="CDC NWSS"
          sourceUrl="https://www.cdc.gov/nwss/"
        />

        <BottomLine>
          <p>
            <strong>Wastewater is a population signal.</strong> It can rise before
            clinical cases in some outbreaks and fall as immunity or behavior changes
            — but it cannot tell you your personal risk.
          </p>
          <p>
            Use these dashboards for <strong>community context</strong>, alongside
            official public health guidance and clinical surveillance — not as a
            substitute for medical advice.
          </p>
        </BottomLine>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold">What the data shows</h2>
          <div className="grid gap-4">
            {sections.map((section) => (
              <Card key={section.title} className="border-border/80 bg-card shadow-sm">
                <CardHeader className="border-l-4 border-l-primary pl-4">
                  <CardTitle className="text-base">{section.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed text-foreground/80">
                    {section.body}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="border-border/80 bg-muted/30">
          <CardHeader>
            <CardTitle className="text-base">How to cite</CardTitle>
            <CardDescription>
              Pandemic Flow (2026). Community COVID wastewater dynamics dashboard.
              Data: CDC National Wastewater Surveillance System.
            </CardDescription>
          </CardHeader>
        </Card>
      </article>
    </AppShell>
  );
}
