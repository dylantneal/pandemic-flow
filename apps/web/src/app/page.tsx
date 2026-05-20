import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { BottomLine } from "@/components/dashboard/bottom-line";
import { HomeHero } from "@/components/dashboard/home-hero";
import { MissionIntro } from "@/components/dashboard/mission-intro";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import {
  AccentCard,
  AccentCardDescription,
  AccentCardHeader,
  AccentCardTitle,
} from "@/components/dashboard/accent-card";
import { homePlainTerms, regionalDashboardsIntro, siteName } from "@/lib/copy/site-copy";
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
      <HomeHero illinoisLatest={illinois} />

      <section className="mx-auto max-w-6xl space-y-14 px-4 py-16 sm:px-6">
        <MissionIntro />

        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Regional dashboards
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
              {regionalDashboardsIntro}
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
                  ? `${illinois.active_site_count ?? "—"} sewersheds in latest week`
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
                  ? `${cook.active_site_count ?? "—"} sewersheds in latest week`
                  : undefined
              }
              href="/cook-county"
            />
            <StatTile
              category="United States"
              value="Planned"
              title="National overview"
              note="Broader geographic coverage is on the roadmap after Illinois validation."
              className="opacity-95"
            />
          </div>
        </div>

        <BottomLine>
          {homePlainTerms.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </BottomLine>

        <div className="grid gap-4 sm:grid-cols-2">
          <AccentCard>
            <AccentCardHeader>
              <AccentCardTitle className="text-base">Methods & limitations</AccentCardTitle>
              <AccentCardDescription className="leading-relaxed">
                Data ingestion, index construction, trend rules, and known
                caveats for interpreting wastewater monitoring data.
              </AccentCardDescription>
            </AccentCardHeader>
            <div className="px-6 pb-6">
              <Button asChild variant="outline" className="gap-2">
                <Link href="/methods">
                  Read methodology
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </AccentCard>
          <AccentCard>
            <AccentCardHeader>
              <AccentCardTitle className="text-base">About the program</AccentCardTitle>
              <AccentCardDescription className="leading-relaxed">
                Mission, data governance, release status, and planned modeling
                work for short-horizon dynamics.
              </AccentCardDescription>
            </AccentCardHeader>
            <div className="px-6 pb-6">
              <Button asChild variant="ghost" className="gap-2 text-primary">
                <Link href="/about">
                  About {siteName}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </AccentCard>
        </div>
      </section>
    </AppShell>
  );
}
