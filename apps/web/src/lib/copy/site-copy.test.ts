import { describe, expect, it } from "vitest";

import {
  aboutPlainTerms,
  footerDisclaimer,
  homePlainTerms,
  methodsForecastsSection,
  methodsPlainTerms,
  metricHelp,
  qualityPanelFooter,
} from "@/lib/copy/site-copy";

const HOME_DISCLAIMER_PHRASES = [
  "not individual infections",
  "public health guidance",
  "do not estimate case counts",
] as const;

const METHODS_DISCLAIMER_PHRASES = [
  "not a substitute for medical advice",
  "public health guidance",
  "personal risk",
] as const;

describe("site copy QA guardrails", () => {
  it("keeps footer disclaimer non-diagnostic", () => {
    expect(footerDisclaimer.toLowerCase()).toContain("not a medical diagnostic");
    expect(footerDisclaimer.toLowerCase()).toContain("cdc nwss");
  });

  it("keeps home plain terms aligned with public-health limits", () => {
    const combined = homePlainTerms.join(" ").toLowerCase();
    for (const phrase of HOME_DISCLAIMER_PHRASES) {
      expect(combined).toContain(phrase);
    }
  });

  it("keeps methods plain terms aligned with public-health limits", () => {
    const combined = methodsPlainTerms.join(" ").toLowerCase();
    for (const phrase of METHODS_DISCLAIMER_PHRASES) {
      expect(combined).toContain(phrase);
    }
  });

  it("keeps about plain terms non-diagnostic", () => {
    expect(aboutPlainTerms.toLowerCase()).toContain("not a medical diagnostic");
  });

  it("defines methods forecast deep-link section", () => {
    expect(methodsForecastsSection.body.toLowerCase()).toContain("ensemble");
    expect(methodsForecastsSection.body.toLowerCase()).toContain("not confirmed case counts");
    expect(methodsForecastsSection.id).toBe("forecasts");
  });

  it("defines canonical metric help copy", () => {
    expect(metricHelp.activityIndex.body.toLowerCase()).toContain("baseline");
    expect(metricHelp.weekOverWeek.body.toLowerCase()).toContain("prior reporting week");
    expect(metricHelp.qualityScore.body.toLowerCase()).toContain("quality");
    expect(qualityPanelFooter.toLowerCase()).toContain("community shedding");
  });
});
