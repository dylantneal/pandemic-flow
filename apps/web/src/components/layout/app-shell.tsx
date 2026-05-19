import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "flush";
}) {
  return (
    <div className="relative flex min-h-full flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,oklch(0.92_0.04_55/0.35),transparent)]"
      />
      <Header />
      <main
        className={cn(
          "mx-auto w-full max-w-6xl flex-1",
          variant === "default" && "px-4 py-10 sm:px-6",
          className,
        )}
      >
        {children}
      </main>
      <footer className="border-t border-border/80 bg-card/50 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          Educational research visualization — not a medical diagnostic tool.
          Data from CDC National Wastewater Surveillance System (NWSS).
        </div>
      </footer>
    </div>
  );
}
