import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  formatActivityIndex,
  formatPercentChange,
  formatPopulation,
  formatQualityScore,
} from "@/lib/dashboard/format";
import type { RegionMetricRow } from "@/lib/dashboard/types";

export function SummaryCards({
  latest,
  totalSites,
  reportingThisWeek,
}: {
  latest: RegionMetricRow | null;
  totalSites: number;
  reportingThisWeek?: number;
}) {
  const activity = latest?.weighted_activity_index ?? latest?.median_activity_index;
  const reporting =
    reportingThisWeek ?? latest?.active_site_count ?? null;

  const cards: Array<{
    label: string;
    value: string;
    hint?: string;
    accent?: boolean;
    showWow?: boolean;
  }> = [
    {
      label: "Activity index",
      value: formatActivityIndex(activity),
      hint: "Compared to each sewershed's own history (0 = typical week)",
      accent: true,
      showWow: true,
    },
    {
      label: "Sites reporting",
      value: reporting != null ? String(reporting) : "—",
      hint:
        totalSites > 0
          ? `${reporting ?? "—"} of ${totalSites} registered sewersheds · ${formatPopulation(latest?.population_represented)} population represented`
          : "Sewershed count unavailable",
    },
    {
      label: "Data quality",
      value: formatQualityScore(latest?.quality_score),
      hint: "Latest week composite score. See quality panel for flags.",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label} className="border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {card.label}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p
              className={
                card.accent
                  ? "text-3xl font-semibold text-primary tabular-nums"
                  : "text-3xl font-semibold tabular-nums"
              }
            >
              {card.value}
            </p>
            {card.showWow && latest?.week_over_week_change != null ? (
              <p className="text-sm text-muted-foreground">
                Week-over-week{" "}
                <span className="font-medium text-foreground">
                  {formatPercentChange(latest.week_over_week_change)}
                </span>
              </p>
            ) : null}
            {card.hint ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {card.hint}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
