import Link from "next/link";
import { ArrowRight, Droplets, MapPin, ShieldCheck } from "lucide-react";

import { HeroParticleField } from "@/components/home/hero-particle-field";
import { Button } from "@/components/ui/button";
import { about } from "@/lib/copy/site-copy";

const highlights = [
  { icon: Droplets, label: "Population-wide signal" },
  { icon: MapPin, label: "Illinois & Cook County" },
  { icon: ShieldCheck, label: "Methods you can audit" },
] as const;

export function AboutHero() {
  return (
    <section className="relative left-1/2 w-screen max-w-none -translate-x-1/2 bg-hero-bg text-hero-foreground">
      <HeroParticleField variant="about" />
      <div className="relative mx-auto flex min-h-[min(72vh,640px)] max-w-4xl flex-col justify-center px-4 py-20 sm:px-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          {about.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          {about.headline}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-hero-foreground/90 sm:text-xl">
          {about.lede}
        </p>

        <ul className="mt-8 flex flex-wrap gap-3">
          {highlights.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2 rounded-full border border-hero-foreground/15 bg-hero-foreground/5 px-4 py-2 text-sm backdrop-blur-sm"
            >
              <Icon className="size-4 text-primary" aria-hidden />
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link href="/illinois">
              Explore Illinois
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-full border-hero-foreground/25 bg-transparent px-6 text-hero-foreground hover:bg-hero-foreground/10 hover:text-hero-foreground"
          >
            <Link href="/methods">How we measure</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
