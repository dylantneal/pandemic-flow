import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TrendChip } from "@/components/dashboard/trend-chip";
import {
  formatActivityIndex,
  formatPercentChange,
  formatWeekDate,
} from "@/lib/dashboard/format";
import type { RegionMetricRow } from "@/lib/dashboard/types";

export function HomeHero({ illinoisLatest }: { illinoisLatest: RegionMetricRow | null }) {
  const activity =
    illinoisLatest?.weighted_activity_index ??
    illinoisLatest?.median_activity_index;

  return (
    <section className="relative overflow-hidden rounded-none bg-hero-bg text-hero-foreground sm:rounded-2xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,oklch(0.45_0.12_45/0.25),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold tracking-[0.25em] text-primary uppercase">
            Illinois · Cook County
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Pandemic <span className="text-primary">Flow</span>
          </h1>
          <p className="mt-3 text-sm tracking-[0.15em] text-hero-foreground/70 uppercase sm:text-base">
            Community COVID activity through wastewater
          </p>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-hero-foreground/80">
            Interpretable trends from public CDC wastewater surveillance — without
            claiming exact case counts or individual risk.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href="/illinois">
                View Illinois
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-hero-foreground/25 bg-transparent text-hero-foreground hover:bg-hero-foreground/10 hover:text-hero-foreground"
            >
              <Link href="/cook-county">Cook County</Link>
            </Button>
          </div>
        </div>

        {illinoisLatest ? (
          <div className="mx-auto mt-12 max-w-lg rounded-xl border border-hero-foreground/10 bg-hero-foreground/5 p-6 text-left backdrop-blur-sm">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              Illinois · latest week
            </p>
            <p className="mt-2 text-4xl font-semibold text-primary tabular-nums">
              {formatActivityIndex(activity)}
            </p>
            <p className="mt-1 text-sm text-hero-foreground/80">
              Activity index · WoW{" "}
              <span className="font-medium text-hero-foreground">
                {formatPercentChange(illinoisLatest.week_over_week_change)}
              </span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <TrendChip label={illinoisLatest.trend_label} />
              <span className="text-xs text-hero-foreground/60">
                {formatWeekDate(illinoisLatest.week_start)}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
