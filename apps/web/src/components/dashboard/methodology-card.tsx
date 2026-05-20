import {
  AccentCard,
  AccentCardContent,
  AccentCardDescription,
  AccentCardHeader,
  AccentCardTitle,
} from "@/components/dashboard/accent-card";

export function MethodologyCard({
  title = "Data source",
  description,
  sourceLabel,
  sourceUrl,
}: {
  title?: string;
  description: string;
  sourceLabel: string;
  sourceUrl: string;
}) {
  return (
    <AccentCard className="bg-muted/30">
      <AccentCardHeader>
        <AccentCardTitle className="text-base">{title}</AccentCardTitle>
        <AccentCardDescription className="leading-relaxed">
          {description}
        </AccentCardDescription>
      </AccentCardHeader>
      <AccentCardContent>
        <p className="text-sm text-muted-foreground">
          Source:{" "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {sourceLabel}
          </a>
        </p>
      </AccentCardContent>
    </AccentCard>
  );
}
