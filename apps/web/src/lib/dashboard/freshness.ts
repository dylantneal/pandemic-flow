import { formatWeekDate } from "@/lib/dashboard/format";

export type FreshnessStatus = "current" | "recent" | "stale" | "unknown";

export type DataFreshness = {
  weekStart: string | null;
  status: FreshnessStatus;
  weekLabel: string;
  statusLabel: string;
};

export function getFreshnessStatus(
  weekStart: string | null | undefined,
): FreshnessStatus {
  if (!weekStart) return "unknown";

  const week = new Date(`${weekStart.slice(0, 10)}T12:00:00`);
  const now = new Date();
  const daysSince =
    (now.getTime() - week.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince <= 10) return "current";
  if (daysSince <= 21) return "recent";
  return "stale";
}

const STATUS_LABELS: Record<FreshnessStatus, string> = {
  current: "Latest week",
  recent: "Recent data",
  stale: "Older week",
  unknown: "Update pending",
};

export function buildDataFreshness(
  weekStart: string | null | undefined,
): DataFreshness {
  const status = getFreshnessStatus(weekStart);
  return {
    weekStart: weekStart ?? null,
    status,
    weekLabel: weekStart ? formatWeekDate(weekStart) : "—",
    statusLabel: STATUS_LABELS[status],
  };
}
