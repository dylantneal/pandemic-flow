import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type SupabaseHealth = {
  configured: boolean;
  connected: boolean;
  message?: string;
  environment?: string;
  error?: string;
};

export function StatusCard({ health }: { health: SupabaseHealth }) {
  const statusLabel = !health.configured
    ? "Not configured"
    : health.connected
      ? "Connected"
      : "Unreachable";

  const variant = health.connected
    ? "default"
    : health.configured
      ? "destructive"
      : "secondary";

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base">Platform status</CardTitle>
          <Badge variant={variant}>{statusLabel}</Badge>
        </div>
        <CardDescription>
          Supabase connectivity for Phase 1 foundation checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {health.connected && health.message ? (
          <p className="text-foreground">{health.message}</p>
        ) : null}
        {health.environment ? (
          <p className="text-muted-foreground">
            Environment:{" "}
            <span className="font-mono text-foreground">{health.environment}</span>
          </p>
        ) : null}
        {health.error ? (
          <p className="text-destructive">{health.error}</p>
        ) : null}
        {!health.configured ? (
          <p className="text-muted-foreground">
            Set{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
            </code>{" "}
            in <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code>.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function StatusCardSkeleton() {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full" />
      </CardContent>
    </Card>
  );
}
