"use client";

import { Layers, LineChart, Sparkles } from "lucide-react";

import { forecastModelOptions } from "@/lib/copy/neural-ode-copy";
import type { ForecastViewMode } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const MODES: {
  id: ForecastViewMode;
  icon: typeof LineChart;
}[] = [
  { id: "ensemble", icon: LineChart },
  { id: "neural_ode", icon: Sparkles },
  { id: "both", icon: Layers },
];

export function ForecastModelSelector({
  value,
  onChange,
  neuralOdeAvailable,
}: {
  value: ForecastViewMode;
  onChange: (mode: ForecastViewMode) => void;
  neuralOdeAvailable: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-border/80 bg-muted/30 p-1.5"
      role="radiogroup"
      aria-label="Forecast model view"
    >
      <div className="grid gap-1 sm:grid-cols-3">
        {MODES.map(({ id, icon: Icon }) => {
          const meta = forecastModelOptions[id];
          const disabled = id !== "ensemble" && !neuralOdeAvailable;
          const selected = value === id;

          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
                selected
                  ? "bg-card shadow-sm ring-1 ring-primary/30"
                  : "hover:bg-card/60",
                disabled && "cursor-not-allowed opacity-45",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {meta.label}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {disabled
                  ? "No production Neural ODE yet. The ensemble remains the trusted forecast."
                  : meta.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
