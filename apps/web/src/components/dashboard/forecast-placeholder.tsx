import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export function ForecastPlaceholder() {
  return (
    <Card className="border-dashed border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
          <CardTitle className="text-lg">Short-horizon forecast</CardTitle>
        </div>
        <CardDescription>
          Neural ODE–based projections with uncertainty bands will appear here in a
          future release. For now, use the historical chart above for trend context.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-primary/20 bg-card/80">
          <p className="text-sm text-muted-foreground">
            Forecast coming in Phase 6 · model training in progress
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
