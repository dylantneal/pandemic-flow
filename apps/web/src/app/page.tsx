import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { StatusCard } from "@/components/dashboard/status-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkSupabaseHealth } from "@/lib/supabase/health";

export const dynamic = "force-dynamic";

const roadmap = [
  {
    title: "CDC ingestion",
    description: "Weekly pipeline for NWSS SARS-CoV-2 wastewater samples.",
  },
  {
    title: "Illinois / Cook County",
    description: "Regional dashboards with site-level trends and quality flags.",
  },
  {
    title: "Neural ODE layer",
    description: "Learned continuous dynamics compared against simple baselines.",
  },
] as const;

export default async function HomePage() {
  const health = await checkSupabaseHealth();

  return (
    <AppShell>
      <section className="space-y-8">
        <div className="space-y-4">
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
            Illinois · Cook County focus
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Community COVID activity,{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
              seen through wastewater
            </span>
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Pandemic Flow turns public wastewater surveillance into interpretable
            trends, forecasts, and model explanations — without claiming exact case
            counts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/methods">How it works</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/about">About the project</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <StatusCard health={health} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {roadmap.map((item) => (
              <Card
                key={item.title}
                className="border-border/60 bg-card/60 backdrop-blur-sm"
              >
                <CardHeader>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Coming in Phase 2+</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="border-dashed border-border/80 bg-muted/20">
          <CardHeader>
            <CardTitle className="text-base">Phase 1 deliverable</CardTitle>
            <CardDescription>
              This deployment is the application shell: routing, design system,
              Supabase foundation, CI, and Vercel hosting.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </AppShell>
  );
}
