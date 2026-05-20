import { describe, expect, it } from "vitest";

import { aggregateSitesToCounties } from "@/lib/dashboard/county-aggregate";
import type { SiteMetricRow } from "@/lib/dashboard/types";

function makeSite(overrides: Partial<SiteMetricRow> & { site_id: string }): SiteMetricRow {
  const { site_id, ...rest } = overrides;
  return {
    site_id,
    week_start: "2026-05-04",
    sample_count: 1,
    activity_index: -1,
    week_over_week_change: 0.1,
    trend_label: "rising",
    quality_score: 0.85,
    quality_flags: null,
    latest_sample_date: "2026-05-04",
    counties_served: "Cook",
    population_served: 1_000_000,
    active_status: "active",
    ...rest,
  };
}

describe("aggregateSitesToCounties", () => {
  it("aggregates a single-county site", () => {
    const sites = [
      makeSite({
        site_id: "1",
        counties_served: "Champaign",
        activity_index: -0.5,
        trend_label: "stable",
      }),
    ];
    const map = aggregateSitesToCounties(sites);
    const champaign = map.get("17019");
    expect(champaign).toBeDefined();
    expect(champaign!.name).toBe("Champaign");
    expect(champaign!.siteCount).toBe(1);
    expect(champaign!.activityIndex).toBe(-0.5);
    expect(champaign!.trendLabel).toBe("stable");
  });

  it("splits multi-county sites across counties", () => {
    const sites = [
      makeSite({
        site_id: "mwrd",
        counties_served: "Cook, Du Page",
        population_served: 2_000_000,
        activity_index: -1,
        trend_label: "rising",
      }),
    ];
    const map = aggregateSitesToCounties(sites);
    expect(map.get("17031")!.siteCount).toBe(1);
    expect(map.get("17043")!.siteCount).toBe(1);
    expect(map.get("17031")!.populationCovered).toBe(1_000_000);
    expect(map.get("17043")!.populationCovered).toBe(1_000_000);
  });

  it("uses insufficient_data trend when only one site in county", () => {
    const sites = [
      makeSite({
        site_id: "solo",
        counties_served: "Greene",
        trend_label: "rising",
      }),
    ];
    const map = aggregateSitesToCounties(sites);
    expect(map.get("17061")!.trendLabel).toBe("rising");
  });

  it("picks majority trend with multiple sites", () => {
    const sites = [
      makeSite({
        site_id: "a",
        counties_served: "Cook",
        trend_label: "rising",
        activity_index: -1,
      }),
      makeSite({
        site_id: "b",
        counties_served: "Cook",
        trend_label: "rising",
        activity_index: -0.8,
      }),
      makeSite({
        site_id: "c",
        counties_served: "Cook",
        trend_label: "falling",
        activity_index: -0.5,
      }),
    ];
    const map = aggregateSitesToCounties(sites);
    expect(map.get("17031")!.trendLabel).toBe("rising");
    expect(map.get("17031")!.siteCount).toBe(3);
  });

  it("skips unresolved county names", () => {
    const sites = [
      makeSite({
        site_id: "x",
        counties_served: "Not A Real County, Cook",
      }),
    ];
    const map = aggregateSitesToCounties(sites);
    expect(map.size).toBe(1);
    expect(map.has("17031")).toBe(true);
  });

  it("uses min quality score across sites", () => {
    const sites = [
      makeSite({
        site_id: "a",
        counties_served: "Kane",
        quality_score: 0.9,
      }),
      makeSite({
        site_id: "b",
        counties_served: "Kane",
        quality_score: 0.35,
      }),
    ];
    const map = aggregateSitesToCounties(sites);
    expect(map.get("17089")!.qualityScore).toBe(0.35);
  });
});
