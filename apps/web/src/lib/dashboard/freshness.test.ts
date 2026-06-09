import { describe, expect, it } from "vitest";

import { buildDataFreshness, getFreshnessStatus } from "@/lib/dashboard/freshness";

describe("getFreshnessStatus", () => {
  it("marks recent weeks as current", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    const iso = recent.toISOString().slice(0, 10);
    expect(getFreshnessStatus(iso)).toBe("current");
  });

  it("returns unknown without a week", () => {
    expect(getFreshnessStatus(null)).toBe("unknown");
  });
});

describe("buildDataFreshness", () => {
  it("includes a formatted week label", () => {
    const freshness = buildDataFreshness("2026-05-26");
    expect(freshness.weekLabel).toContain("2026");
    expect(freshness.statusLabel.length).toBeGreaterThan(0);
  });
});
