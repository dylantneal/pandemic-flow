"use client";

import { cn } from "@/lib/utils";

export type RegionSectionLink = {
  id: string;
  label: string;
};

export function RegionSectionNav({
  sections,
  className,
}: {
  sections: RegionSectionLink[];
  className?: string;
}) {
  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="On this page"
      className={cn(
        "flex flex-wrap gap-2 rounded-xl border border-border/80 bg-card/80 p-2 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <span className="self-center px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Jump to
      </span>
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
