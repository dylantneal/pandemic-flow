import { describe, expect, it } from "vitest";

import {
  formatActivityIndex,
  formatPercentChange,
  formatQualityScore,
  parseQualityFlags,
  trendLabelText,
} from "@/lib/dashboard/format";

describe("formatActivityIndex", () => {
  it("formats positive values with sign", () => {
    expect(formatActivityIndex(0.42)).toBe("+0.42");
  });

  it("formats negative values", () => {
    expect(formatActivityIndex(-0.15)).toBe("-0.15");
  });

  it("returns em dash for null", () => {
    expect(formatActivityIndex(null)).toBe("—");
  });
});

describe("formatPercentChange", () => {
  it("converts decimal to percent", () => {
    expect(formatPercentChange(0.125)).toBe("+12.5%");
  });
});

describe("formatQualityScore", () => {
  it("rounds to whole percent", () => {
    expect(formatQualityScore(0.847)).toBe("85%");
  });
});

describe("trendLabelText", () => {
  it("maps known labels", () => {
    expect(trendLabelText("rising")).toBe("Rising");
    expect(trendLabelText("insufficient_data")).toBe("Insufficient data");
  });
});

describe("parseQualityFlags", () => {
  it("filters non-string entries", () => {
    expect(parseQualityFlags(["below_lod", 1, null, "sparse_week"])).toEqual([
      "below_lod",
      "sparse_week",
    ]);
  });

  it("returns empty array for invalid input", () => {
    expect(parseQualityFlags(null)).toEqual([]);
  });
});
