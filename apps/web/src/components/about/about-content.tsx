import Link from "next/link";
import {
  ArrowRight,
  Beaker,
  Check,
  Droplets,
  LineChart,
  Sparkles,
} from "lucide-react";

import { BottomLine } from "@/components/dashboard/bottom-line";
import { Button } from "@/components/ui/button";
import { about, aboutPlainTerms } from "@/lib/copy/site-copy";

const pillarIcons = [Droplets, LineChart, Beaker] as const;

export function AboutContent() {
  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-6 sm:py-20">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            The idea
          </p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {about.whyTitle}
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            {about.whyBody}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-8 shadow-sm">
          <Sparkles
            className="absolute right-4 top-4 size-8 text-primary/30"
            aria-hidden
          />
          <p className="text-sm font-medium text-primary">Why open dashboards matter</p>
          <p className="mt-3 text-sm leading-relaxed text-foreground/85">
            Public health data should be readable without a statistics degree.
            COVID Flow is built for journalists, local officials, researchers, and
            curious residents who want a straight answer to one question: is viral
            shedding in my community trending up or down this week?
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          What we stand for
        </h2>
        <ul className="mt-8 grid gap-5 sm:grid-cols-3">
          {about.pillars.map((pillar, i) => {
            const Icon = pillarIcons[i] ?? Droplets;
            return (
              <li
                key={pillar.title}
                className="group rounded-2xl border border-border/80 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {pillar.body}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/80 bg-card p-8 shadow-sm">
          <h2 className="text-xl font-semibold">{about.publishTitle}</h2>
          <ul className="mt-5 space-y-3">
            {about.publishItems.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-6 rounded-full" variant="secondary">
            <Link href="/illinois">
              Open Illinois dashboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/5 to-card p-8 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.15em] text-primary uppercase">
            On the horizon
          </p>
          <h2 className="mt-2 text-xl font-semibold">{about.roadmapTitle}</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {about.roadmapBody}
          </p>
        </div>
      </section>

      <BottomLine>
        <p>{aboutPlainTerms}</p>
      </BottomLine>

      <p className="text-center text-sm text-muted-foreground">
        Definitions, caveats, and citations live on the{" "}
        <Link
          href="/methods"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          methods page
        </Link>
        .
      </p>
    </div>
  );
}
