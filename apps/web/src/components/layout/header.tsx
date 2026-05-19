import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/methods", label: "Methods" },
  { href: "/about", label: "About" },
] as const;

export function Header({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
            <span className="text-sm font-semibold text-primary">PF</span>
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">
              Pandemic Flow
            </span>
            <span className="text-xs text-muted-foreground">
              Wastewater dynamics
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-3"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Badge
          variant="outline"
          className="hidden border-primary/30 text-primary sm:inline-flex"
        >
          Phase 1
        </Badge>
      </div>
    </header>
  );
}
