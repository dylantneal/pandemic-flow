"""Frozen Neural ODE version labels (research vs optional experiments)."""

from __future__ import annotations

# Canonical research reference — do not promote or re-tune against the holdout slice.
CANONICAL_RESEARCH_VERSION = "1.7.5-shrinkage-conservative"
CANONICAL_RESEARCH_PROFILE = "shrinkage_correction_v2"

# One-shot h4 abstention experiment (optional; not the product story).
H4_ABSTAIN_EXPERIMENT_VERSION = "1.7.6-shrinkage-h4-abstain"
H4_ABSTAIN_EXPERIMENT_PROFILE = "shrinkage_correction_h4_abstain"

FROZEN_RESEARCH_VERSIONS = frozenset({CANONICAL_RESEARCH_VERSION})

VERSION_TO_PROFILE: dict[str, str] = {
    CANONICAL_RESEARCH_VERSION: CANONICAL_RESEARCH_PROFILE,
    H4_ABSTAIN_EXPERIMENT_VERSION: H4_ABSTAIN_EXPERIMENT_PROFILE,
}

DEFAULT_GATE_LOOP_VERSION = CANONICAL_RESEARCH_VERSION
DEFAULT_GATE_LOOP_PROFILE = CANONICAL_RESEARCH_PROFILE
