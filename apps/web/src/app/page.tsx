import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { BottomLine } from "@/components/dashboard/bottom-line";
import { HomeHero } from "@/components/dashboard/home-hero";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatActivityIndex,
  formatPercentChange,
  trendLabelText,
} from "@/lib/dashboard/format";
import { getLatestRegionMetric } from "@/lib/supabase/metrics";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [illinois, cook] = await Promise.all([
    getLatestRegionMetric("state", "IL"),
    getLatestRegionMetric("county", "17031"),
  ]);

  const ilActivity =
    illinois?.weighted_activity_index ?? illinois?.median_activity_index;
  const cookActivity =
    cook?.weighted_activity_index ?? cook?.median_activity_index;

  return (
    <AppShell variant="flush" className="px-0 py-0">
      <div className="px-4 pt-6 sm:px-6">
        <HomeHero illinoisLatest={illinois} />
      </div>

      <section className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            What we track
          </h2>
          <p className="mt-2 text-muted-foreground">
            Weekly wastewater activity indices for Illinois and Cook County
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatTile
            category="Illinois"
            value={formatActivityIndex(ilActivity)}
            title={
              illinois
                ? `${trendLabelText(illinois.trend_label)} · ${formatPercentChange(illinois.week_over_week_change)} WoW`
                : "Statewide sewershed aggregate"
            }
            note={
              illinois
                ? `${illinois.active_site_count ?? "—"} active sites reporting`
                : undefined
            }
            href="/illinois"
          />
          <StatTile
            category="Cook County"
            value={formatActivityIndex(cookActivity)}
            title={
              cook
                ? `${trendLabelText(cook.trend_label)} · ${formatPercentChange(cook.week_over_week_change)} WoW`
                : "Chicago metro sewershed focus"
            }
            note={
              cook
                ? `${cook.active_site_count ?? "—"} active sites in county`
                : undefined
            }
            href="/cook-county"
          />
          <StatTile
            category="National"
            value="Soon"
            title="U.S. overview in a future release"
            note="Phase 5 focuses on Illinois and Cook County dashboards."
            className="opacity-90"
          />
        </div>

        <BottomLine>
          <p>
            <strong>Wastewater measures community shedding</strong>, not individual
            infections. Viral RNA in sewage reflects how much SARS-CoV-2 is
            circulating in a sewershed — useful for spotting rises and falls weeks
            before clinical data in some settings.
          </p>
          <p>
            Pandemic Flow summarizes CDC NWSS data into weekly activity indices and
            trend labels. It does <strong>not</strong> estimate case counts, hospital
            admissions, or personal risk.
          </p>
        </BottomLine>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Methods & limitations</CardTitle>
              <CardDescription className="leading-relaxed">
                How we clean NWSS data, compute activity indices, and what to watch
                for in data quality.
              </CardDescription>
            </CardHeader>
            <div className="px-4 pb-4">
              <Button asChild variant="outline" className="gap-2">
                <Link href="/methods">
                  Read methods
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </Card>
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">About the project</CardTitle>
              <CardDescription className="leading-relaxed">
                Research-oriented visualization with a Neural ODE modeling layer
                planned for trajectory forecasting.
              </CardDescription>
            </CardHeader>
            <div className="px-4 pb-4">
              <Button asChild variant="ghost" className="gap-2 text-primary">
                <Link href="/about">
                  About Pandemic Flow
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
