import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex min-h-full flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.55_0.15_220/0.18),transparent)]"
      />
      <Header />
      <main className={cn("mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6", className)}>
        {children}
      </main>
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          Educational research visualization — not a medical diagnostic tool.
        </div>
      </footer>
    </div>
  );
}
