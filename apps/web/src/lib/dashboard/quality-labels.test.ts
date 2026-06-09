import { describe, expect, it } from "vitest";

import {
  formatQualityFlag,
  formatQualityFlags,
} from "@/lib/dashboard/quality-labels";

describe("formatQualityFlag", () => {
  it("returns canonical labels for known flags", () => {
    expect(formatQualityFlag("below_lod")).toBe(
      "Some samples below limit of detection",
    );
    expect(formatQualityFlag("few_recent_samples")).toBe(
      "Fewer than three samples in the last 28 days",
    );
  });

  it("title-cases unknown flags", () => {
    expect(formatQualityFlag("custom_lab_flag")).toBe("Custom Lab Flag");
  });
});

describe("formatQualityFlags", () => {
  it("maps arrays to readable labels", () => {
    expect(formatQualityFlags(["below_lod", "grab_sample"])).toEqual([
      "Some samples below limit of detection",
      "Grab sample rather than composite collection",
    ]);
  });
});
