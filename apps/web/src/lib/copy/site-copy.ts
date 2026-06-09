/** Shared user-facing copy for COVID Flow. */

export const siteName = "COVID Flow";

/** Official CDC program name (keep when citing the data source). */
export const nwssOfficialName =
  "U.S. CDC National Wastewater Surveillance System (NWSS)";

export const siteDescription =
  "Community COVID wastewater monitoring for Illinois and Cook County. Weekly trends, data quality notes, and activity indices from CDC NWSS.";

export const footerDisclaimer =
  "Educational research visualization. Not a medical diagnostic tool. Data from CDC NWSS.";

export const heroEyebrow = "Wastewater monitoring · Illinois";

export const heroHook =
  "See how COVID is moving through Illinois communities this week.";

export const mission = {
  title: "What this project does",
  lede:
    "COVID Flow turns CDC NWSS wastewater data into weekly activity indices for Illinois and Cook County. The focus is clear public data, not case counts or personal risk scores.",
  what: "SARS-CoV-2 RNA in wastewater. Each sample reflects viral shedding from everyone connected to that sewer network.",
  how: "Indices near zero mean typical shedding for that location. Trends show whether levels are rising, falling, or stable week to week.",
  why: "Not a case count, hospital forecast, or tool to judge your individual risk. Use it for community context alongside official health guidance.",
} as const;

export const homePlainTerms = [
  "Wastewater measures viral shedding from a whole community, not individual infections. Levels can shift before clinical testing catches up in some outbreaks.",
  "COVID Flow publishes weekly activity indices and trend labels from CDC NWSS. We do not estimate case counts, hospital burden, or personal risk. For medical decisions, follow official public health guidance.",
] as const;

export const aboutPlainTerms =
  "This platform is not a medical diagnostic and does not estimate individual infection risk. Wastewater trends describe viral shedding at the sewershed level. Use them alongside hospital and clinic reporting and public health guidance, not instead of them.";

export const about = {
  eyebrow: "About the project",
  headline: "Community COVID signal, made visible",
  lede:
    "COVID Flow is an open research dashboard that translates wastewater monitoring data into weekly trends anyone can read. We built it for Illinois and Cook County first because sewershed coverage is strong and the public deserves a clear view of community viral activity.",
  whyTitle: "Why wastewater belongs on your radar",
  whyBody:
    "When people use the sewer system, they leave behind traces of SARS-CoV-2 RNA. Sampling is continuous and population-wide, so the signal can shift before case counts move in some outbreaks. It cannot tell you who is sick or how risky a gathering is for you personally. It can show whether viral shedding in a community is rising, falling, or holding steady.",
  pillars: [
    {
      title: "Early community signal",
      body: "Wastewater can reflect changes in viral load across everyone connected to a sewershed, not only people who seek tests.",
    },
    {
      title: "Honest interpretation",
      body: "We publish methods, quality flags, and limits up front so the index is read as a population trend, not a personal score.",
    },
    {
      title: "Open, repeatable data",
      body: "Metrics are rebuilt each week from CDC NWSS open releases through a documented pipeline anyone can inspect.",
    },
  ],
  publishTitle: "What you can explore today",
  publishItems: [
    "Statewide and Cook County activity indices with week-over-week trends",
    "An Illinois county map with hover detail for reporting sewersheds",
    "Historical charts, data quality panels, and sewershed-level tables",
    "Automated weekly refresh from public NWSS releases",
  ],
  roadmapTitle: "What we are building next",
  roadmapBody:
    "We are developing a Neural ODE modeling layer for short-horizon projections with uncertainty bands. Forecasts will ship only after held-out validation and clear documentation of model limits. National coverage will follow once regional workflows are stable.",
} as const;

export const methodsPlainTerms = [
  "Wastewater measures the whole community, not individuals. Levels can rise before clinics see more cases in some outbreaks. They can fall as immunity or behavior changes. The data cannot tell you your personal risk.",
  "Use these dashboards for community context alongside official public health guidance and clinical reporting. They are not a substitute for medical advice.",
] as const;

export const methodsSections = [
  {
    id: "measures",
    number: "01",
    title: "What wastewater measures",
    body: "Each NWSS sample reflects SARS-CoV-2 RNA in wastewater from a sewershed: the area served by a wastewater treatment plant or sewer network. The signal integrates shedding from the connected population. It is not a case count, hospitalization estimate, or diagnostic test result.",
  },
  {
    id: "index",
    number: "02",
    title: "Weekly activity index",
    body: "For each sewershed and region we compare the current week to that location's own historical baseline. The index is centered near zero (roughly −1 below typical to +1 above). Values are aggregated across sites using population-informed weighting where available. The index describes relative viral load, not absolute prevalence.",
  },
  {
    id: "trends",
    number: "03",
    title: "Trend labels",
    body: "Rising, falling, and stable labels apply week-over-week changes only after minimum sample and coverage thresholds are met. When data are sparse or quality is low, we label trends as insufficient data rather than forcing a direction.",
  },
  {
    id: "quality",
    number: "04",
    title: "Quality review",
    body: "Quality scores incorporate detection limits, sample type, missing flow or population normalization, and reporting gaps. A large index change paired with a low quality score should be interpreted cautiously. Hydrology, industrial inflow, and sewershed boundary changes can move readings without a true epidemic shift.",
  },
] as const;

export const methodsForecastsSection = {
  id: "forecasts",
  number: "05",
  title: "Forecasts and model evaluation",
  body: "Region dashboards include short-horizon projections with uncertainty bands. The production forecast is an ensemble baseline trained on historical weekly indices. It tracks wastewater activity, not confirmed case counts or hospital burden.",
  detail:
    "For holdout accuracy tables, baseline comparisons, and documentation of the experimental Neural ODE research layer, see the model evaluation pages linked below.",
  baselineLinkLabel: "Baseline forecast evaluation",
  baselineLinkDescription: "Ensemble benchmarks, MAE tables, and model run history",
  neuralOdeLinkLabel: "Learned dynamics (research)",
  neuralOdeLinkDescription:
    "Neural ODE experiments, promotion criteria, and why research models stay off production dashboards",
} as const;

export const methodsPullQuote =
  "The activity index compares this week to each sewershed's own history. It describes relative change in viral RNA, not how many people are infected.";

export const methodsLede =
  "COVID Flow ingests CDC NWSS data each week, cleans Illinois sewershed records, and publishes indices you can read on the regional dashboards. This page documents what we compute and how to interpret it.";

export const methodsCitation =
  "COVID Flow (2026). Community COVID wastewater dynamics dashboard. Data: U.S. CDC National Wastewater Surveillance System (NWSS). Accessed via public NWSS releases.";

export const indexExplainer = {
  tiles: [
    {
      label: "Near zero",
      body: "Typical shedding for that sewershed compared with its own history.",
    },
    {
      label: "Below zero",
      body: "Less viral RNA than the historical baseline for that location.",
    },
    {
      label: "Above zero",
      body: "More viral RNA than the historical baseline for that location.",
    },
  ],
  footer:
    "Week-over-week change shows direction only. Trend labels (rising, falling, stable) apply only when enough samples meet our quality thresholds.",
} as const;

export const regionalDashboardsIntro =
  "Weekly indices, historical charts, and data quality notes from the public NWSS pipeline.";

export const illinoisMapIntro =
  "Activity index by county for sewersheds reporting this week. Hover or focus a county for detail. Neutral fill means no NWSS coverage in that county.";

export const cookCountyDescription =
  "Cook County and Chicago-area sewersheds. A metro-focused view of community viral shedding in wastewater.";

/** Canonical metric definitions used across dashboards and help tooltips. */
export const metricHelp = {
  activityIndex: {
    title: "Activity index",
    body: "Compares this week's viral RNA level to each sewershed's own historical baseline. Near zero means a typical week for that location. The index describes relative community shedding, not case counts or personal risk.",
  },
  weekOverWeek: {
    title: "Week-over-week change",
    body: "Percent change in the activity index from the prior reporting week. Trend labels (rising, falling, stable) apply only when enough samples meet quality thresholds.",
  },
  qualityScore: {
    title: "Data quality score",
    body: "Composite score for the latest week based on sample completeness, lab flags, and reporting coverage. Lower scores mean more caution when interpreting trends. See the quality panel for specific flags.",
  },
  sitesReporting: {
    title: "Sites reporting",
    body: "Number of wastewater monitoring locations with data for the latest NWSS reporting week in this region.",
  },
} as const;

export const qualityPanelDescription =
  "How complete and reliable the underlying wastewater samples are for the latest reporting week. Lower scores mean more caution when interpreting trends.";

export const qualityPanelFooter =
  "Wastewater monitoring reflects community shedding, not individual diagnoses. Gaps in sampling, lab methods, or sewershed coverage can shift the index without a true epidemic change.";

export const qualityPanelNoFlags =
  "No quality flags for the latest week. Reporting looks routine.";

export const activityIndexHint =
  "Compared to each sewershed's own history (0 = typical week)";

export const dataProvenanceDescription =
  "Metrics are rebuilt each week from CDC NWSS open data. We harmonize sewershed identifiers, apply Illinois cleaning rules, and roll samples up to site and region level.";
