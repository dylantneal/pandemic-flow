import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Card with an inset primary accent bar aligned to the rounded border.
 */
export function AccentCard({
  className,
  children,
  accent = true,
  ...props
}: React.ComponentProps<typeof Card> & { accent?: boolean }) {
  return (
    <Card
      className={cn(
        "border-border/80 bg-card shadow-sm",
        accent && "shadow-[inset_4px_0_0_0_var(--primary)]",
        className,
      )}
      {...props}
    >
      {children}
    </Card>
  );
}

export {
  CardHeader as AccentCardHeader,
  CardTitle as AccentCardTitle,
  CardDescription as AccentCardDescription,
  CardContent as AccentCardContent,
  CardFooter as AccentCardFooter,
};
