import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatQualityScore,
  parseQualityFlags,
} from "@/lib/dashboard/format";
import type { RegionMetricRow } from "@/lib/dashboard/types";

const FLAG_LABELS: Record<string, string> = {
  below_lod: "Some samples below limit of detection",
  sparse_week: "Fewer than two samples in the week",
  stale_site: "One or more sites have not reported recently",
  missing_concentration: "Missing concentration values",
};

export function QualityPanel({ latest }: { latest: RegionMetricRow | null }) {
  const flags = parseQualityFlags(latest?.quality_flags);
  const score = latest?.quality_score;

  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Data quality</CardTitle>
        <CardDescription>
          How complete and reliable the underlying wastewater samples are for the
          latest reporting week. Lower scores mean more caution when interpreting
          trends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold text-primary tabular-nums">
            {formatQualityScore(score)}
          </span>
          <span className="text-sm text-muted-foreground">quality score</span>
        </div>

        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No quality flags for the latest week. Reporting looks routine.
          </p>
        ) : (
          <ul className="space-y-2">
            {flags.map((flag) => (
              <li
                key={flag}
                className="flex gap-2 text-sm text-muted-foreground before:mt-2 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-primary before:content-['']"
              >
                {FLAG_LABELS[flag] ?? flag.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Wastewater monitoring reflects community shedding, not individual
          diagnoses. Gaps in sampling, lab methods, or sewershed coverage can shift
          the index without a true epidemic change.
        </p>
      </CardContent>
    </Card>
  );
}
