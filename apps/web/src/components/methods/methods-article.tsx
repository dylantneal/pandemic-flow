import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BottomLine } from "@/components/dashboard/bottom-line";
import { MethodologyCard } from "@/components/dashboard/methodology-card";
import {
  methodsCitation,
  methodsForecastsSection,
  methodsLede,
  methodsPlainTerms,
  methodsPullQuote,
  methodsSections,
} from "@/lib/copy/site-copy";

const toc = [
  { id: "source", label: "Data source" },
  ...methodsSections.map((s) => ({ id: s.id, label: s.title })),
  { id: methodsForecastsSection.id, label: methodsForecastsSection.title },
  { id: "cite", label: "How to cite" },
];

export function MethodsArticle() {
  return (
    <div className="lg:grid lg:grid-cols-[12rem_1fr] lg:gap-12">
      <nav
        className="mb-8 hidden lg:sticky lg:top-24 lg:block lg:self-start"
        aria-label="On this page"
      >
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          On this page
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {toc.map((item) => (
            <li key={item.id}>
              <Link
                href={`#${item.id}`}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0 space-y-12">
        <header
          id="overview"
          className="rounded-2xl border border-border/60 bg-muted/40 px-6 py-8 sm:px-10"
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Methodology
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            How COVID Flow works
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {methodsLede}
          </p>
        </header>

        <section id="source" className="scroll-mt-24">
          <MethodologyCard
            title="Primary data source"
            description="All metrics derive from CDC NWSS SARS-CoV-2 wastewater sample records. Our pipeline downloads open releases on a weekly schedule, harmonizes sewershed identifiers, and stores cleaned observations in a versioned database before computing indices."
            sourceLabel="CDC NWSS program"
            sourceUrl="https://www.cdc.gov/nwss/"
          />
        </section>

        <blockquote className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-5 text-base leading-relaxed text-foreground/90">
          {methodsPullQuote}
        </blockquote>

        <div className="space-y-8">
          {methodsSections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-24 border-t border-border/80 pt-8"
            >
              <p className="text-sm font-semibold text-primary tabular-nums">
                {section.number}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                {section.title}
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}

          <section
            id={methodsForecastsSection.id}
            className="scroll-mt-24 border-t border-border/80 pt-8"
          >
            <p className="text-sm font-semibold text-primary tabular-nums">
              {methodsForecastsSection.number}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {methodsForecastsSection.title}
            </h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
              {methodsForecastsSection.body}
            </p>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
              {methodsForecastsSection.detail}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href="/model-lab"
                className="group flex flex-col rounded-xl border border-border/80 bg-card px-4 py-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/20"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground group-hover:text-primary">
                  {methodsForecastsSection.baselineLinkLabel}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {methodsForecastsSection.baselineLinkDescription}
                </span>
              </Link>
              <Link
                href="/model-lab/neural-ode"
                className="group flex flex-col rounded-xl border border-border/80 bg-card px-4 py-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/20"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground group-hover:text-primary">
                  {methodsForecastsSection.neuralOdeLinkLabel}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {methodsForecastsSection.neuralOdeLinkDescription}
                </span>
              </Link>
            </div>
          </section>
        </div>

        <BottomLine>
          {methodsPlainTerms.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </BottomLine>

        <section
          id="cite"
          className="scroll-mt-24 rounded-xl border border-border/80 bg-card px-6 py-5"
        >
          <h2 className="text-base font-semibold">How to cite</h2>
          <p className="mt-2 font-mono text-sm leading-relaxed text-muted-foreground">
            {methodsCitation}
          </p>
        </section>
      </article>
    </div>
  );
}
