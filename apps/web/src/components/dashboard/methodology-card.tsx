import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Card className="border-border/80 bg-muted/30">
      <CardHeader className="border-l-4 border-l-primary pl-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
