import { cn } from "@/lib/utils";

export function BottomLine({
  title = "In plain terms",
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-hero-bg px-6 py-8 text-hero-foreground sm:px-8",
        className,
      )}
    >
      <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
        {title}
      </p>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-hero-foreground/90 [&_strong]:font-semibold [&_strong]:text-hero-foreground">
        {children}
      </div>
    </section>
  );
}
