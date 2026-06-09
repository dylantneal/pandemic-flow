import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricHelp } from "@/components/dashboard/metric-help";
import {
  qualityPanelDescription,
  qualityPanelFooter,
  qualityPanelNoFlags,
  metricHelp,
} from "@/lib/copy/site-copy";
import { formatQualityScore } from "@/lib/dashboard/format";
import { formatQualityFlags } from "@/lib/dashboard/quality-labels";
import type { RegionMetricRow } from "@/lib/dashboard/types";

export function QualityPanel({ latest }: { latest: RegionMetricRow | null }) {
  const flags = formatQualityFlags(latest?.quality_flags);
  const score = latest?.quality_score;

  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          Data quality
          <MetricHelp
            title={metricHelp.qualityScore.title}
            body={metricHelp.qualityScore.body}
          />
        </CardTitle>
        <CardDescription>{qualityPanelDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold text-primary tabular-nums">
            {formatQualityScore(score)}
          </span>
          <span className="text-sm text-muted-foreground">quality score</span>
        </div>

        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">{qualityPanelNoFlags}</p>
        ) : (
          <ul className="space-y-2">
            {flags.map((label) => (
              <li
                key={label}
                className="flex gap-2 text-sm text-muted-foreground before:mt-2 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-primary before:content-['']"
              >
                {label}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          {qualityPanelFooter}
        </p>
      </CardContent>
    </Card>
  );
}
