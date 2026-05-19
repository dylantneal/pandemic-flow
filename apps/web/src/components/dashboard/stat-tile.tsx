import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  category,
  value,
  title,
  note,
  href,
  className,
}: {
  category: string;
  value: string;
  title: string;
  note?: string;
  href?: string;
  className?: string;
}) {
  const inner = (
    <Card
      className={cn(
        "h-full border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md",
        href && "cursor-pointer",
        className,
      )}
    >
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-semibold tracking-wide text-primary uppercase">
          {category}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-primary tabular-nums">{value}</p>
        <p className="mt-2 font-medium text-foreground">{title}</p>
        {note ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground italic">
            {note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full no-underline">
        {inner}
      </Link>
    );
  }
  return inner;
}
