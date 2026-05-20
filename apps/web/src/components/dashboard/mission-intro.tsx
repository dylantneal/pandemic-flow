import { mission } from "@/lib/copy/site-copy";

export function MissionIntro() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{mission.title}</h2>
        <p className="text-base leading-relaxed text-muted-foreground">{mission.lede}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        <li className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            What it measures
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mission.what}
          </p>
        </li>
        <li className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            How to read it
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mission.how}
          </p>
        </li>
        <li className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            What it is not
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mission.why}
          </p>
        </li>
      </ul>
    </section>
  );
}
