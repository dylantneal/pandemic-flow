import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ForecastChart } from "@/components/dashboard/forecast-chart";
import type { RegionForecast, TimeseriesPoint } from "@/lib/dashboard/types";

vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => <div data-testid="chart-mock">{children}</div>;

  return {
    ResponsiveContainer: Passthrough,
    ComposedChart: Passthrough,
    Area: () => null,
    Line: () => null,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

const timeseries: TimeseriesPoint[] = [
  {
    week_start: "2026-05-19",
    weighted_activity_index: -0.2,
    median_activity_index: -0.2,
    trend_label: "stable",
    active_site_count: 30,
    quality_score: 0.8,
    week_over_week_change: 0.01,
  },
  {
    week_start: "2026-05-26",
    weighted_activity_index: -0.1,
    median_activity_index: -0.1,
    trend_label: "rising",
    active_site_count: 32,
    quality_score: 0.82,
    week_over_week_change: 0.05,
  },
];

const ensembleForecast: RegionForecast = {
  forecast_origin_week: "2026-05-26",
  model_name: "ensemble_v1",
  model_type: "baseline",
  horizons: [
    {
      horizon_weeks: 1,
      target_date: "2026-06-02",
      predicted_activity_index: -0.08,
      lower_bound: -0.2,
      upper_bound: 0.05,
      predicted_trend: "stable",
      confidence_label: "medium",
    },
  ],
};

describe("ForecastChart", () => {
  it("renders forecast heading and observed chart shell", () => {
    render(
      <ForecastChart
        timeseries={timeseries}
        ensembleForecast={ensembleForecast}
        neuralOdeForecast={null}
        viewMode="ensemble"
        regionName="Illinois"
      />,
    );

    expect(screen.getByText("Short-horizon forecast")).toBeInTheDocument();
    expect(screen.getAllByTestId("chart-mock").length).toBeGreaterThan(0);
  });
});
