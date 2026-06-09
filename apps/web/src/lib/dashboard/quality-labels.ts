/** Human-readable labels for NWSS pipeline quality flags. */

export const QUALITY_FLAG_LABELS: Record<string, string> = {
  below_lod: "Some samples below limit of detection",
  few_recent_samples: "Fewer than three samples in the last 28 days",
  sparse_week: "Fewer than two samples in the week",
  stale_sample: "One or more samples are older than expected",
  stale_site: "One or more sites have not reported recently",
  inhibition_detected: "PCR inhibition flagged in lab results",
  grab_sample: "Grab sample rather than composite collection",
  missing_flowpop_norm: "Missing flow or population normalization",
  non_raw_matrix: "Non-raw sample matrix",
  non_wwtp_location: "Sample location is not a wastewater treatment plant",
  missing_concentration: "Missing concentration values",
  inconsistent_units: "Inconsistent concentration units",
  ntc_amplified: "No-template control amplification detected",
  low_quality_score: "Composite quality score below inclusion threshold",
};

export function formatQualityFlag(flag: string): string {
  return (
    QUALITY_FLAG_LABELS[flag] ??
    flag.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function formatQualityFlags(flags: unknown): string[] {
  if (!Array.isArray(flags)) return [];
  return flags
    .filter((flag): flag is string => typeof flag === "string")
    .map(formatQualityFlag);
}
