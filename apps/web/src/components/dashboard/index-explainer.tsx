import { indexExplainer } from "@/lib/copy/site-copy";

export function IndexExplainer() {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">
        How to read the activity index
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {indexExplainer.tiles.map((tile, i) => (
          <div
            key={tile.label}
            className="rounded-xl border border-border/80 bg-card px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold text-primary tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </p>
            <p className="mt-1 font-medium text-foreground">{tile.label}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {tile.body}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {indexExplainer.footer}
      </p>
    </div>
  );
}
