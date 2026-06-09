/** User-facing explanations for Neural ODE (Phase 7). */

export const neuralOdeIntro = {
  title: "Learned dynamics forecast",
  subtitle:
    "A small neural network learns how wastewater activity tends to change week to week, then projects that pattern a few weeks ahead.",
  disclaimer:
    "Forecasts describe a wastewater activity index, not confirmed COVID case counts. Neural ODE outputs are experimental until they pass promotion gates; the ensemble baseline remains the trusted production forecast.",
  productionNote:
    "The ensemble baseline is the default production forecast. Neural ODE appears here only after manual promotion to production status.",
};

export const neuralOdeHowItWorks = [
  {
    step: "01",
    title: "Observe the signal",
    body: "We use the same weekly weighted activity index as the rest of COVID Flow, a normalized measure of viral RNA in community wastewater.",
  },
  {
    step: "02",
    title: "Learn a dynamical law",
    body: "A Neural ODE fits a smooth rate-of-change function to historical weeks. Think of it as learning “if activity is here today, how fast is it moving?” rather than memorizing one fixed rule.",
  },
  {
    step: "03",
    title: "Project forward",
    body: "The model integrates that law up to four weeks ahead, producing point forecasts, uncertainty bands, and an instantaneous rate-of-change curve you can read on the dashboard.",
  },
];

export const derivativeExplainer = {
  title: "Rate of change (learned dynamics)",
  lead: "This chart shows the model’s estimated speed of change in activity index units per week, not a measured lab value.",
  bullets: [
    "Above zero (shaded warm): the model thinks activity is rising at that moment along the forecast path.",
    "Below zero: the model thinks activity is falling.",
    "Near zero: relatively flat trajectory in the short term.",
    "The curve is stitched from daily steps between the forecast origin and four weeks out; it is most reliable in the first one to two weeks.",
  ],
  caution:
    "Sharp spikes can mean the learned law is extrapolating aggressively. Compare with the level forecast and observed history before drawing conclusions.",
};

export const forecastModelOptions = {
  ensemble: {
    label: "Ensemble baseline",
    short: "Baseline",
    description:
      "Average of four simple rules (persistence, moving average, trend, seasonal). Default for honest short-horizon comparison.",
  },
  neural_ode: {
    label: "Learned dynamics (research)",
    short: "Research",
    description:
      "Research layer only, not the production forecast. Shown on dashboards only after explicit promotion; default is ensemble.",
  },
  both: {
    label: "Compare both",
    short: "Compare",
    description:
      "Overlay baseline ensemble and Neural ODE on the same axes to see whether learned dynamics diverge from simple rules.",
  },
} as const;

export const modelLabNeuralOde = {
  pageTitle: "Learned dynamics research layer",
  pageSubtitle: "Neural ODE · Phase 7",
  pageLead:
    "COVID Flow keeps the ensemble on region dashboards. This page documents the Neural ODE research track: a constrained correction experiment on wastewater activity, not a replacement production forecaster.",
  whyNotPromoted: {
    title: "Why this is not on production dashboards",
    lead:
      "v1.7.5-shrinkage-conservative is frozen as the canonical research model. It is calibrated and research-positive, but the promotion gate blocks it for one clear reason.",
    reason:
      "Four-week MAE is slightly above the allowed ensemble slack on the holdout slice (Illinois 0.773 vs 0.746 allowed; Cook 0.739 vs 0.722). Every other production safety check passes.",
    stillValuable:
      "That is a useful finding, not a failure: the model learned selective h1/h2 corrections, knows when to abstain on longer horizons, and produces ~79% coverage on nominal 80% bands.",
    productDecision:
      "We do not promote this run and do not keep tuning the same gate to chase 4-week MAE. Simple ensemble rules remain stronger at four weeks on noisy weekly surveillance.",
  },
  futureWork: {
    title: "Where modeling goes next",
    lead: "The next product step is honest communication in Model Lab, not more aggressive 4-week Neural ODE tuning.",
    items: [
      "Short-horizon selective correction (h1/h2) with richer wastewater context, including site quality, coverage, and regime labels.",
      "Better data and evaluation hygiene before new architectures.",
      "Optional one-shot h4-abstention experiment (1.7.6). If it cannot clear the narrow 4w gap without hurting h1/h2, stop forcing h4 and treat week-4 as ensemble territory.",
    ],
  },
  dashboardNote: {
    title: "On Illinois and Cook dashboards",
    body:
      "The default forecast is always the ensemble baseline. Neural ODE overlays appear only after an explicit manual promotion, which we do not plan for the frozen v1.7.5 research reference.",
  },
  researchConclusion: {
    title: "Research conclusion (v1.7.5)",
    plainSummary:
      "The model can sometimes help, knows when to mostly stay quiet, and produces calibrated uncertainty. At four weeks, simple ensemble baselines are still hard to beat, so COVID Flow keeps the ensemble on production dashboards.",
    works: [
      "H1 is protected and competitive with persistence.",
      "Correction gates work: h2 and h4 mostly abstain instead of inventing dynamics.",
      "80% intervals land near ~79% empirical coverage after recalibration.",
      "Beats ensemble on many origins, especially at 2 weeks (IL ~59–79% improved by slice; Cook ~71%).",
    ],
    notProduction: [
      "4-week MAE is just above the promotion slack vs ensemble: IL 0.773 vs allowed 0.746; Cook 0.739 vs allowed 0.722.",
      "Useful as a selective correction layer, not as a wholesale forecasting model.",
      "Short/medium-horizon signal is scientifically interesting; reliable 4-week dynamics are not.",
    ],
    framing:
      "Frame Neural ODE as constrained dynamics learning under noisy weekly wastewater data: a positive research result, not a failed product bet.",
  },
  researchBanner:
    "The ensemble remains the trusted production forecast. v1.7.5 is the frozen canonical research candidate: safe, interpretable, and near-miss on 4-week lift only.",
  canonicalCandidate: {
    version: "1.7.5-shrinkage-conservative",
    profile: "shrinkage_correction_v2",
    title: "Canonical research candidate (v1.7.5, frozen)",
    bullets: [
      "Not broken: bounded h1, shrinkage gates, and ~79% interval coverage with interpretable end-to-end behavior.",
      "Not a production replacement: 4w MAE narrowly misses ensemble×1.05 (IL +3.6%, Cook +2.4% above slack on holdout).",
      "Scientifically interesting at h2: large share of origins beat ensemble when the gate allows a correction.",
      "Frozen reference run; optional 1.7.6 only tests stronger h4 abstention.",
    ],
  },
  h4AbstainExperiment: {
    version: "1.7.6-shrinkage-h4-abstain",
    profile: "shrinkage_correction_h4_abstain",
    title: "Optional: h4-abstention experiment (1.7.6)",
    summary:
      "Same as 1.7.5 on h1–h3; lower h4 gate init and higher h4-only penalty. Success is converting production near-miss to pass without h1/h2 regression. If it fails, h4 should stay ensemble-like.",
  },
  promotionTiersTitle: "Promotion tiers",
  promotionTiers: [
    "Production safe: all held-out production checks pass (manual promote only).",
    "Near miss: model is safe on h1, intervals, and regimes, but 4w MAE is slightly above ensemble×1.05 (not enough long-horizon lift).",
    "Not production safe: fails persistence, interval, regime, or multi-horizon checks (legacy v1.6-style behavior).",
    "Research value: selective correction beats ensemble on enough origins at h2 with conservative gates (separate from production).",
    "h4 abstention (research): when only h4 improvement fails but gates are conservative, that is expected abstention, not a broken model.",
  ],
  targetClarification:
    "All models here predict a weekly wastewater activity index derived from NWSS surveillance. They do not directly forecast confirmed COVID cases, hospitalizations, or deaths.",
  promotionTitle: "Promotion gate (held-out weeks)",
  promotionBullets: [
    "1-week error must beat or match persistence (hard to beat at short horizon).",
    "2-week error must beat or match the ensemble baseline.",
    "4-week error may be up to 5% above ensemble MAE.",
    "Trend direction at 1 week must stay within 5 percentage points of persistence.",
    "RMSE at each horizon must not exceed ensemble by more than 20%.",
    "80% interval coverage must stay within a sane band (not empty, not trivially wide).",
    "No severe degradation vs ensemble in rising, falling, stable, or turn-point regimes.",
    "Training metadata (seed, data hash, artifact) must be recorded for reproducibility.",
  ],
  vsBaselines:
    "Holdout metrics from training are compared to production baseline metrics in Model Lab. Rolling-origin scores after inference use the same evaluation pipeline as baselines.",
};
