"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shows a compact `summary` view by default and swaps to the full `details`
 * view on demand. Used to keep the Neural ODE research page focused on the
 * canonical run while still exposing the complete candidate history.
 */
export function ResearchDisclosure({
  summary,
  details,
  showLabel,
  hideLabel,
}: {
  summary: React.ReactNode;
  details: React.ReactNode;
  showLabel: string;
  hideLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      {open ? details : summary}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md border border-border/80 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/40"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
        {open ? hideLabel : showLabel}
      </button>
    </div>
  );
}
