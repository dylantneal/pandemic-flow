"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/illinois", label: "Illinois" },
  { href: "/cook-county", label: "Cook County" },
  { href: "/methods", label: "Methods" },
  { href: "/model-lab", label: "Model Lab" },
  { href: "/about", label: "About" },
] as const;

export function Header({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-80 sm:text-xl"
        >
          COVID <span className="text-primary">Flow</span>
        </Link>

        <nav className="hidden items-center gap-0.5 sm:flex">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-2.5 py-2 text-sm transition-colors sm:px-3",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <nav className="flex items-center gap-1 sm:hidden">
          <Link
            href="/illinois"
            className="rounded-md px-2 py-1.5 text-xs font-medium text-primary"
          >
            IL
          </Link>
          <Link
            href="/cook-county"
            className="rounded-md px-2 py-1.5 text-xs text-muted-foreground"
          >
            Cook
          </Link>
        </nav>
      </div>
    </header>
  );
}
