import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ModelRunRow } from "@/lib/dashboard/types";
import { formatShortDate } from "@/lib/dashboard/format";

export function ModelRunCards({ runs }: { runs: ModelRunRow[] }) {
  if (runs.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {runs.map((run) => {
        const evalCount = Number(run.metrics?.total_evaluations ?? 0);
        return (
          <Card key={run.id} className="border-border/80 bg-card shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{run.model_name}</CardTitle>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {run.status}
                </Badge>
              </div>
              <CardDescription>
                {run.model_type} · v{run.version}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                Evaluations scored:{" "}
                <span className="font-medium text-foreground">{evalCount}</span>
              </p>
              <p className="text-xs">
                Updated {formatShortDate(run.updated_at.slice(0, 10))}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
