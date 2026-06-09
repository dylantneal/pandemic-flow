import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SummaryCards } from "@/components/dashboard/summary-cards";
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
  quality_score: 0.82,
  quality_flags: null,
  created_at: "2026-05-30T00:00:00Z",
};

describe("SummaryCards", () => {
  it("renders core metric labels and values", () => {
    render(<SummaryCards latest={latest} totalSites={40} reportingThisWeek={32} />);

    expect(screen.getByText("Activity index")).toBeInTheDocument();
    expect(screen.getByText("-0.15")).toBeInTheDocument();
    expect(screen.getByText("Sites reporting")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText("Data quality")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText(/Week-over-week/)).toBeInTheDocument();
  });

  it("exposes metric help controls", () => {
    render(<SummaryCards latest={latest} totalSites={40} />);
    expect(screen.getAllByRole("button", { name: /About / }).length).toBeGreaterThan(
      0,
    );
  });
});
