import { Badge } from "@/components/ui/badge";
import { trendLabelText } from "@/lib/dashboard/format";
import type { TrendLabel } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const styles: Record<TrendLabel, string> = {
  rising: "border-orange-300 bg-orange-50 text-orange-700",
  falling: "border-emerald-200 bg-emerald-50 text-emerald-800",
  stable: "border-border bg-muted text-muted-foreground",
  insufficient_data: "border-border bg-muted/60 text-muted-foreground",
};

export function TrendChip({
  label,
  className,
}: {
  label: TrendLabel;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", styles[label], className)}
    >
      {trendLabelText(label)}
    </Badge>
  );
}
