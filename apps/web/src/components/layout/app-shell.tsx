import Link from "next/link";

import { DataFreshnessBadge } from "@/components/layout/data-freshness-badge";
import { Header } from "@/components/layout/header";
import { footerDisclaimer } from "@/lib/copy/site-copy";
import { buildDataFreshness } from "@/lib/dashboard/freshness";
import { getGlobalDataFreshness } from "@/lib/supabase/metrics";
import { cn } from "@/lib/utils";

const footerLinks = [
  { href: "/methods", label: "Methods" },
  { href: "/methods#forecasts", label: "Forecast methods" },
  { href: "/about", label: "About" },
] as const;

export async function AppShell({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "flush";
}) {
  const { weekStart } = await getGlobalDataFreshness();
  const freshness = buildDataFreshness(weekStart);

  return (
    <div className="relative flex min-h-full flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,oklch(0.96_0.02_55/0.4),transparent_70%)]"
      />
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "mx-auto w-full max-w-6xl flex-1 outline-none",
          variant === "default" && "px-4 py-10 sm:px-6",
          className,
        )}
      >
        {children}
      </main>
      <footer className="border-t border-border/80 bg-card/50 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center text-xs text-muted-foreground sm:px-6">
          <DataFreshnessBadge freshness={freshness} />
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          >
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="max-w-3xl leading-relaxed">{footerDisclaimer}</p>
        </div>
      </footer>
    </div>
  );
}
