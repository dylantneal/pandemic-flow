import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import { HeroParticleField } from "@/components/home/hero-particle-field";
import { Button } from "@/components/ui/button";
import { TrendChip } from "@/components/dashboard/trend-chip";
import { heroEyebrow, heroHook } from "@/lib/copy/site-copy";
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
    <section className="relative left-1/2 w-screen max-w-none -translate-x-1/2 bg-hero-bg text-hero-foreground">
      <HeroParticleField />
      <div className="relative flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center px-4 py-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            {heroEyebrow}
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl">
            COVID <span className="text-primary">Flow</span>
          </h1>
          <p className="mt-4 max-w-lg text-lg font-medium text-hero-foreground/90 sm:text-xl">
            {heroHook}
          </p>

          {illinoisLatest ? (
            <div className="mt-10 w-full max-w-sm rounded-2xl border border-hero-foreground/20 bg-hero-foreground/10 p-6 text-left shadow-lg backdrop-blur-md">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                Illinois activity index
              </p>
              <p className="mt-2 text-5xl font-semibold text-primary tabular-nums">
                {formatActivityIndex(activity)}
              </p>
              <p className="mt-1 text-sm text-hero-foreground/85">
                Week-over-week{" "}
                <span className="font-medium text-hero-foreground">
                  {formatPercentChange(illinoisLatest.week_over_week_change)}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <TrendChip label={illinoisLatest.trend_label} />
                <span className="text-xs text-hero-foreground/65">
                  Week of {formatWeekDate(illinoisLatest.week_start)}
                </span>
              </div>
            </div>
          ) : null}

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="gap-2 px-6">
              <Link href="/illinois">
                Explore Illinois
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-hero-foreground/30 bg-transparent px-6 text-hero-foreground hover:bg-hero-foreground/10 hover:text-hero-foreground"
            >
              <Link href="/cook-county">Cook County</Link>
            </Button>
          </div>
        </div>

        <p
          className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 text-xs text-hero-foreground/50"
          aria-hidden
        >
          Scroll to learn more
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </p>
      </div>
    </section>
  );
}
