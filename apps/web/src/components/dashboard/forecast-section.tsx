"use client";

import { useState } from "react";
import Link from "next/link";

import { DerivativeChart } from "@/components/dashboard/derivative-chart";
import { ForecastChart } from "@/components/dashboard/forecast-chart";
import { ForecastModelSelector } from "@/components/dashboard/forecast-model-selector";
import { neuralOdeIntro } from "@/lib/copy/neural-ode-copy";
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
  regionName,
}: {
  timeseries: TimeseriesPoint[];
  ensembleForecast: RegionForecast | null;
  neuralOdeForecast: RegionForecast | null;
  derivatives: DerivativeSeries | null;
  neuralOdeAvailable: boolean;
  regionName: string;
}) {
  const [viewMode, setViewMode] = useState<ForecastViewMode>("ensemble");

  return (
    <section className="space-y-6" aria-labelledby="forecast-section-heading">
      <div className="space-y-3">
        <h2
          id="forecast-section-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Forecast & learned dynamics
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {neuralOdeIntro.subtitle} {neuralOdeIntro.productionNote} These forecasts
          track wastewater activity, not confirmed case counts.{" "}
          <Link
            href="/model-lab/neural-ode"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Read how Neural ODE is evaluated
          </Link>
          .
        </p>
      </div>

      <ForecastModelSelector
        value={viewMode}
        onChange={setViewMode}
        neuralOdeAvailable={neuralOdeAvailable}
      />

      <ForecastChart
        timeseries={timeseries}
        ensembleForecast={ensembleForecast}
        neuralOdeForecast={neuralOdeForecast}
        viewMode={viewMode}
        regionName={regionName}
      />

      {(viewMode === "neural_ode" || viewMode === "both") && (
        <DerivativeChart series={derivatives} regionName={regionName} />
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {neuralOdeIntro.disclaimer}
      </p>
    </section>
  );
}
