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
    <Card className="border-border/80 bg-muted/30 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
          <CardTitle className="text-lg">Short-horizon forecast</CardTitle>
        </div>
        <CardDescription className="max-w-2xl leading-relaxed">
          We are validating Neural ODE based projections with uncertainty bands.
          Until models pass held-out evaluation, use the historical chart for
          trend context only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-[6rem] items-center justify-center rounded-lg border border-dashed border-border bg-card/80 px-4">
          <p className="text-center text-sm text-muted-foreground">
            Forecast module in development · expected in a future release after
            model review
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
