/** Display helpers aligned with scripts/lib/neural_ode/promotion.py */

/** Frozen canonical research model — never production-promoted. */
export const CANONICAL_CONSERVATIVE_VERSION = "1.7.5-shrinkage-conservative";
export const H4_ABSTAIN_EXPERIMENT_VERSION = "1.7.6-shrinkage-h4-abstain";

export type PromotionProductionStatus = "pass" | "near_miss" | "fail";
export type PromotionResearchStatus = "pass" | "h4_abstention" | "fail";

export type PromotionMetricsBlock = {
  production_status?: PromotionProductionStatus;
  production_passed?: boolean;
  research_status?: PromotionResearchStatus;
  research_passed?: boolean;
  promote?: boolean;
  holdout_scoped?: boolean;
  failed_production_checks?: string[];
  failed_research_checks?: string[];
};

export function promotionBlockFromMetrics(
  metrics: Record<string, unknown> | null | undefined,
): PromotionMetricsBlock | null {
  const block = metrics?.promotion;
  if (!block || typeof block !== "object") return null;
  return block as PromotionMetricsBlock;
}

export function researchStatusLabel(
  status: PromotionResearchStatus | undefined,
): string {
  switch (status) {
    case "pass":
      return "Research value";
    case "h4_abstention":
      return "Research (h4 abstention)";
    case "fail":
      return "Research weak";
    default:
      return "Research not checked";
  }
}

export function promotionStatusLabel(
  status: PromotionProductionStatus | undefined,
): string {
  switch (status) {
    case "pass":
      return "Production ready";
    case "near_miss":
      return "Near miss (safe; 4w lift short)";
    case "fail":
      return "Not production safe";
    default:
      return "Promotion not checked";
  }
}

export function isCanonicalConservativeCandidate(version: string): boolean {
  return version === CANONICAL_CONSERVATIVE_VERSION;
}
