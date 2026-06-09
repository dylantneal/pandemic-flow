import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QualityPanel } from "@/components/dashboard/quality-panel";
import type { RegionMetricRow } from "@/lib/dashboard/types";

const latest: RegionMetricRow = {
  id: "1",
  region_type: "state",
  region_id: "IL",
  region_name: "Illinois",
  week_start: "2026-05-26",
  site_count: 40,
  active_site_count: 32,
  population_represented: 12_000_000,
  median_activity_index: -0.2,
  weighted_activity_index: -0.15,
  week_over_week_change: 0.08,
  estimated_growth_rate: null,
  trend_label: "rising",
  quality_score: 0.62,
  quality_flags: ["below_lod", "few_recent_samples"],
  created_at: "2026-05-30T00:00:00Z",
};

describe("QualityPanel", () => {
  it("renders normalized quality flags", () => {
    render(<QualityPanel latest={latest} />);

    expect(screen.getByText("Data quality")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(
      screen.getByText("Some samples below limit of detection"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fewer than three samples in the last 28 days"),
    ).toBeInTheDocument();
  });

  it("shows routine message when no flags are present", () => {
    render(
      <QualityPanel
        latest={{
          ...latest,
          quality_flags: [],
          quality_score: 0.95,
        }}
      />,
    );

    expect(
      screen.getByText(/No quality flags for the latest week/i),
    ).toBeInTheDocument();
  });
});
