"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/model-lab", label: "Baseline models", description: "Phase 6 benchmarks" },
  {
    href: "/model-lab/neural-ode",
    label: "Learned dynamics",
    description: "Research layer (not production)",
  },
] as const;

export function ModelLabNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-col gap-2 sm:flex-row sm:gap-3"
      aria-label="Model lab sections"
    >
      {tabs.map((tab) => {
        const active =
          tab.href === "/model-lab"
            ? pathname === "/model-lab"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col rounded-xl border px-4 py-3 transition-colors",
              active
                ? "border-primary/40 bg-primary/5 shadow-sm"
                : "border-border/80 bg-card hover:border-primary/25 hover:bg-muted/30",
            )}
          >
            <span
              className={cn(
                "text-sm font-semibold",
                active ? "text-primary" : "text-foreground",
              )}
            >
              {tab.label}
            </span>
            <span className="text-xs text-muted-foreground">{tab.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
