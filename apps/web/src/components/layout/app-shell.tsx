import { Header } from "@/components/layout/header";
import { footerDisclaimer } from "@/lib/copy/site-copy";
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
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,oklch(0.96_0.02_55/0.4),transparent_70%)]"
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
          {footerDisclaimer}
        </div>
      </footer>
    </div>
  );
}
