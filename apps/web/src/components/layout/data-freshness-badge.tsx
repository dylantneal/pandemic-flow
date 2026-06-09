import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DataFreshness } from "@/lib/dashboard/freshness";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<DataFreshness["status"], string> = {
  current: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  recent: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400",
  stale: "border-destructive/30 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

export function DataFreshnessBadge({
  freshness,
  className,
}: {
  freshness: DataFreshness;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
      title={
        freshness.weekStart
          ? `Latest NWSS reporting week: ${freshness.weekLabel}`
          : "Latest reporting week unavailable"
      }
    >
      <Clock className="size-3.5 shrink-0" aria-hidden />
      <span className="hidden sm:inline">Data through</span>
      <span className="font-medium text-foreground sm:hidden">
        {freshness.weekLabel}
      </span>
      <span className="hidden font-medium text-foreground sm:inline">
        {freshness.weekLabel}
      </span>
      <Badge
        variant="outline"
        className={cn("px-1.5 py-0 text-[10px] font-medium", STATUS_STYLES[freshness.status])}
      >
        {freshness.statusLabel}
      </Badge>
    </div>
  );
}
