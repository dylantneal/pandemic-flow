"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { DerivativeChart } from "@/components/dashboard/derivative-chart";
import { ForecastChart } from "@/components/dashboard/forecast-chart";
import { ForecastModelSelector } from "@/components/dashboard/forecast-model-selector";
import { neuralOdeIntro } from "@/lib/copy/neural-ode-copy";
import { cn } from "@/lib/utils";
import type {
  DerivativeSeries,
  ForecastViewMode,
  RegionForecast,
  TimeseriesPoint,
} from "@/lib/dashboard/types";

export function ForecastSection({
  timeseries,
  ensembleForecast,
  neuralOdeForecast,
  derivatives,
  neuralOdeAvailable,
  neuralOdeIsResearch,
  neuralOdeVersion,
  regionName,
}: {
  timeseries: TimeseriesPoint[];
  ensembleForecast: RegionForecast | null;
  neuralOdeForecast: RegionForecast | null;
  derivatives: DerivativeSeries | null;
  neuralOdeAvailable: boolean;
  neuralOdeIsResearch: boolean;
  neuralOdeVersion: string | null;
  regionName: string;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<ForecastViewMode>("ensemble");
  const effectiveViewMode: ForecastViewMode = advanced ? viewMode : "ensemble";

  return (
    <section className="space-y-6" aria-labelledby="forecast-section-heading">
      <div className="space-y-3">
        <h2
          id="forecast-section-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Projected trend (next few weeks)
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Our best estimate of where the wastewater activity index for {regionName}{" "}
          is heading over the next few weeks, shown with an uncertainty band. This
          tracks wastewater activity, not confirmed case counts.
        </p>
      </div>

      <ForecastChart
        timeseries={timeseries}
        ensembleForecast={ensembleForecast}
        neuralOdeForecast={neuralOdeForecast}
        viewMode={effectiveViewMode}
        regionName={regionName}
      />

      <div className="space-y-4 rounded-xl border border-border/70 bg-muted/15 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setAdvanced((open) => !open)}
          aria-expanded={advanced}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="text-sm font-medium text-foreground">
            Compare models (advanced)
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              advanced && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {advanced && (
          <div className="space-y-5 border-t border-border/60 pt-4">
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              The ensemble baseline is the trusted production forecast. The Neural
              ODE is an experimental research model that learns how activity changes
              week to week. Use the selector to overlay it on the chart above.{" "}
              <Link
                href="/methods#forecasts"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Read how forecasts are evaluated
              </Link>
              .
            </p>

            <ForecastModelSelector
              value={viewMode}
              onChange={setViewMode}
              neuralOdeAvailable={neuralOdeAvailable}
            />

            {neuralOdeIsResearch &&
              (viewMode === "neural_ode" || viewMode === "both") && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                  Showing the frozen research candidate
                  {neuralOdeVersion ? ` (v${neuralOdeVersion})` : ""}. This is a candidate
                  model, not the production forecast. It is shown here for comparison
                  only; the ensemble remains the trusted forecast on this dashboard.
                </p>
              )}

            {(viewMode === "neural_ode" || viewMode === "both") && (
              <DerivativeChart series={derivatives} regionName={regionName} />
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              {neuralOdeIntro.disclaimer}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
