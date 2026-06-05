# Data and Database Guide

This document describes how COVID Flow stores, transforms, and serves wastewater surveillance data from the CDC National Wastewater Surveillance System (NWSS). It is written for developers, data scientists, and anyone preparing machine learning or analytics on top of the Supabase database.

For deployment and environment setup, see [DEPLOYMENT.md](DEPLOYMENT.md). For product architecture and roadmap, see [pandemic-flow-architecture-plan.md](pandemic-flow-architecture-plan.md).

---

## Overview

COVID Flow ingests public CDC NWSS data weekly, cleans and filters it for Illinois and Cook County, rolls observations up to weekly metrics, and serves them through a Next.js dashboard. The database is the system of record: raw samples, cleaned observations, precomputed weekly aggregates, baseline and ensemble forecasts, Neural ODE research candidates, and scored prediction actuals.

```text
CDC NWSS CSV/API
        │
        ▼
┌───────────────────┐     ┌─────────────────────────────┐
│ ingestion_runs    │────▶│ raw_cdc_wastewater_samples  │  (national, all states)
│ data_sources      │     │ + Supabase Storage snapshots│
└───────────────────┘     └─────────────────────────────┘
        │
        ▼
┌───────────────────┐     ┌─────────────────────────────┐
│ sites             │◀────│ clean_observations          │  (Illinois-focused cleaning)
└───────────────────┘     └─────────────────────────────┘
        │
        ├──────────────────────────────┐
        ▼                              ▼
┌───────────────────┐     ┌─────────────────────────────┐
│ weekly_site_      │     │ weekly_region_metrics       │  (Cook County + Illinois)
│ metrics           │     │ (dashboard time series)     │
└───────────────────┘     └─────────────────────────────┘
        │
        ▼ (Phase 6–7 forecasting)
┌───────────────────┐     ┌─────────────────────────────┐
│ model_runs        │────▶│ predictions                 │
│ (baselines +      │     │ prediction_actuals          │
│  neural_ode       │     │ prediction_derivatives      │
│  candidates)      │     │ (Neural ODE research)       │
└───────────────────┘     └─────────────────────────────┘
```

---

## Geographic scope

| Scope | How it is defined in the database |
|-------|----------------------------------|
| **Raw ingestion** | All U.S. states and territories in the CDC file (`state_territory` on each row) |
| **Cleaning & sites** | Illinois (`state_territory` = `il`) |
| **Cook County** | `is_cook_county` on `clean_observations` and `is_cook_county_site` on `sites` |
| **Dashboard** | Illinois state + Cook County region metrics; county map uses site-level weekly data aggregated to counties |

The product is intentionally narrow in v1: Illinois statewide signal plus Cook County metro focus, not full national modeling.

---

## Supabase project layout

| Location | Purpose |
|----------|---------|
| `packages/database/supabase/migrations/` | SQL migrations applied via `supabase db push` |
| `packages/database/supabase/config.toml` | Local Supabase CLI settings |
| Supabase Storage | Raw CSV snapshots, future model artifacts |
| GitHub Actions secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` for pipeline writes |

Local development uses `apps/web/.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and keys. The service role key must never be exposed to the browser.

---

## Tables

### `app_status`

Minimal connectivity metadata for health checks. Not part of the epidemiological pipeline.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Always `'default'` |
| `environment` | text | e.g. `local`, `production` |
| `message` | text | Human-readable status line |
| `updated_at` | timestamptz | Last update |

Public read via RLS. Used by `/api/health`.

---

### `data_sources`

Catalog of external datasets ingested into the system.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Internal ID |
| `name` | text | Display name (e.g. CDC Wastewater Data for SARS-CoV-2) |
| `provider` | text | e.g. `CDC` |
| `dataset_slug` | text unique | Socrata dataset ID, e.g. `j9g8-acpt` |
| `source_url` | text | Download URL for ingestion |
| `update_cadence` | text | e.g. weekly |
| `last_checked_at` | timestamptz | Last pipeline check |
| `last_successful_ingest_at` | timestamptz | Last successful ingest |
| `latest_source_updated_at` | timestamptz | Latest `date_updated` seen in source |
| `schema_hash` | text | Hash of expected CSV schema |

Default CDC source URL (if `CDC_WASTEWATER_CSV_URL` is unset):

`https://data.cdc.gov/api/views/j9g8-acpt/rows.csv?accessType=DOWNLOAD`

---

### `ingestion_runs`

One row per pipeline execution (manual, scheduled, or backfill).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Run identifier |
| `data_source_id` | uuid FK → `data_sources` | Which source was ingested |
| `started_at`, `finished_at` | timestamptz | Run timing |
| `status` | text | `running`, `success`, `failed`, `partial` |
| `trigger_type` | text | `manual`, `schedule`, `backfill` |
| `git_commit` | text | Git SHA when run from CI |
| `source_row_count` | integer | Rows read from CDC file |
| `inserted_count`, `updated_count`, `skipped_count` | integer | Upsert stats |
| `error_message` | text | Failure details |
| `raw_snapshot_path` | text | Storage path(s) for raw CSV snapshot |

Scheduled runs use GitHub Actions workflow **Weekly Data Update** (Saturdays ~13:30 UTC).

---

### `raw_cdc_wastewater_samples`

Mirror of the CDC open dataset. One row per lab result / sample record. National scope (all states).

| Column group | Examples | Notes |
|--------------|----------|-------|
| Identity | `record_id`, `site`, `state_territory`, `source` | `site` is CDC’s anonymized site ID |
| Geography | `county_fips`, `counties_served`, `population_served` | Comma-separated lists allowed |
| Sample | `sample_id`, `sample_collect_date`, `sample_type`, `sample_matrix`, `sample_location`, `flow_rate` | |
| Lab | `concentration_method`, `pcr_type`, `extraction_method`, `major_lab_method` | |
| QC flags | `inhibition_detect`, `inhibition_adjust`, `ntc_amplify` | CDC text fields |
| PCR | `pcr_target`, `pcr_gene_target_agg`, `pcr_target_avg_conc`, `pcr_target_units`, `lod_sewage`, `pcr_target_detect` | Target is SARS-CoV-2 |
| Linearized | `pcr_target_avg_conc_lin`, `pcr_target_flowpop_lin`, `pcr_target_mic_lin` | Preferred for modeling when present |
| Metadata | `date_updated`, `ingestion_run_id`, `row_hash` | `row_hash` for idempotent upserts |

Unique constraint: `(record_id)` via upsert on ingest.

**Not queried by the dashboard directly.** Downstream tables are built from this layer.

---

### `sites`

One row per anonymized CDC sewershed (`site_id` = CDC `site` field).

| Column | Type | Description |
|--------|------|-------------|
| `site_id` | text PK | CDC site identifier |
| `state_territory` | text | e.g. `il` |
| `county_fips` | text | FIPS codes (may be multi-county) |
| `counties_served` | text | County names served |
| `population_served` | numeric | Population represented |
| `first_sample_date`, `last_sample_date` | date | Span of samples |
| `sample_count` | integer | Total samples seen |
| `active_status` | text | `active`, `recent`, `stale`, `inactive` |
| `is_cook_county_site` | boolean | True if site serves Cook County |
| `dominant_units`, `dominant_sample_matrix`, `dominant_sample_location` | text | Mode of dominant lab metadata |

`active_status` is derived from how recently the site reported relative to the latest CDC sample date in the database (see [Site activity](#site-active-status)).

Illinois has on the order of **~100 sites**; **~19** are flagged as Cook County sites.

---

### `clean_observations`

Modeling-ready rows derived from Illinois raw samples. Linked to `raw_cdc_wastewater_samples` and `sites`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `raw_sample_id` | uuid FK → `raw_cdc_wastewater_samples` | Provenance |
| `site_id` | text FK → `sites` | |
| `sample_date` | date | Collection date |
| `week_start` | date | ISO week start (Monday) for aggregation |
| `state_territory` | text | |
| `county_fips`, `counties_served` | text | |
| `is_cook_county` | boolean | Cook County sewershed |
| `raw_concentration` | numeric | Linear concentration used |
| `log_concentration` | numeric | `log1p(linear concentration)` |
| `normalized_concentration` | numeric | Reserved for future normalization |
| `concentration_source` | text | e.g. `pcr_target_avg_conc_lin` |
| `units`, `detected`, `below_lod` | text/boolean | |
| `sample_matrix`, `sample_type`, `sample_location` | text | |
| `lab_method_group` | text | Pipe-delimited lab metadata |
| `include_in_model` | boolean | **Primary gate for ML training** |
| `exclusion_reason` | text | Why excluded when `include_in_model = false` |
| `quality_score` | numeric | 0–1 composite quality |
| `quality_flags` | jsonb | Array of string flags (see below) |

**Inclusion rules** (see `scripts/lib/cleaning_rules.py`):

- Valid `sample_date`, `site`, `record_id`
- Expected PCR target (SARS-CoV-2), units (`copies/l wastewater`), matrix (`raw wastewater`), location (`wwtp`) when enforced
- Quality score must meet threshold unless excluded for another reason
- Recent sample count per site (last 28 days) — sites with fewer than 3 recent samples get penalized

**Common `exclusion_reason` values:**

| Reason | Meaning |
|--------|---------|
| `inconsistent_units` | Units differ from expected NWSS units |
| `low_quality_score` | Composite score below threshold (0.4) |

**Common `quality_flags`:**

| Flag | Effect on score |
|------|-----------------|
| `below_lod` | Below limit of detection |
| `inhibition_detected` | PCR inhibition flagged |
| `ntc_amplify` | No-template control amplification |
| `few_recent_samples` | Fewer than 3 samples in last 28 days |
| `inconsistent_units` | Units mismatch |

As of production data (approximate):

| Metric | Count |
|--------|-------|
| Total IL clean rows | ~33,400 |
| `include_in_model = true` | ~32,350 |
| `include_in_model = false` | ~1,100 (mostly `inconsistent_units`) |

**Date range (model-ready):** 2021-11-01 through 2026-05-07.

---

### `weekly_site_metrics`

One row per **site** per **week** (Illinois sites with any data that week).

| Column | Type | Description |
|--------|------|-------------|
| `site_id` | text FK | |
| `week_start` | date | Monday of ISO week |
| `state_territory` | text | |
| `county_fips` | text | |
| `sample_count` | integer | Observations in that week |
| `median_log_concentration` | numeric | Median log concentration for the week |
| `mean_log_concentration` | numeric | Mean log concentration |
| `activity_index` | numeric | **Site-normalized activity signal** (see below) |
| `week_over_week_change` | numeric | Change vs prior week at same site |
| `two_week_change`, `four_week_change` | numeric | Longer-horizon changes |
| `estimated_growth_rate` | numeric | Derived growth estimate |
| `trend_label` | text | `rising`, `falling`, `stable`, `insufficient_data` |
| `quality_score` | numeric | Week-level quality rollup |
| `quality_flags` | jsonb | |
| `latest_sample_date` | date | Latest sample in the week bucket |

Unique: `(site_id, week_start)`.

**Activity index** is computed per site by comparing the week’s median log concentration to that site’s own history (z-score style within site). It is a project-derived index, not the CDC’s official Wastewater Viral Activity Level. Values are comparable across sites only in a relative sense; the dashboard color scale runs roughly from about **-1.75 to +3.0**.

**Trend labels** (site level):

- `rising`: week-over-week change ≥ +0.25
- `falling`: week-over-week change ≤ -0.25
- `stable`: otherwise, if enough history
- `insufficient_data`: fewer than 2 weeks of history or missing change

Illinois has **~100 sites** with at least one weekly row; many sites have **130–236 weeks** of history.

---

### `weekly_region_metrics`

Aggregated region time series for the dashboard (Cook County and Illinois state).

| Column | Type | Description |
|--------|------|-------------|
| `region_type` | text | `county`, `state`, or `national` |
| `region_id` | text | e.g. `17031` (Cook FIPS), `IL` |
| `region_name` | text | e.g. `Cook County`, `Illinois` |
| `week_start` | date | |
| `site_count` | integer | Sites contributing |
| `active_site_count` | integer | Sites considered active |
| `population_represented` | numeric | Sum of population weights |
| `median_activity_index` | numeric | Median of site indices |
| `weighted_activity_index` | numeric | Population-weighted mean of site indices |
| `week_over_week_change` | numeric | Region-level WoW change |
| `estimated_growth_rate` | numeric | |
| `trend_label` | text | Same enum as site level |
| `quality_score` | numeric | |
| `quality_flags` | jsonb | |

Unique: `(region_type, region_id, week_start)`.

**Production coverage (Cook County, `region_id = 17031`):**

| Metric | Value |
|--------|-------|
| Weeks | 236 continuous weeks |
| Date range | 2021-11-01 → 2026-05-04 |
| Gaps in weekly sequence | 0 |
| NULL `weighted_activity_index` | 0 |
| Weeks `insufficient_data` | 1 (first week only) |
| Active sites per week | Typically 15 (of 15 Cook sites) |

Illinois state (`region_id = IL`) has the same 236-week span with the same quality characteristics.

The dashboard reads **region** metrics for summary cards and charts, and **site** metrics (via historical fetch) for the county chloropleth map.

---

### Phase 6 tables (forecasting)

Migration: `20260521120000_phase6_forecasting.sql`

#### `model_runs`

| Column | Type | Description |
|--------|------|-------------|
| `model_name` | text | e.g. `persistence_v1`, `ensemble_v1` |
| `model_type` | text | `persistence`, `moving_average`, `trend`, `seasonal_naive`, `ensemble`, `neural_ode` |
| `version` | text | Semantic version string |
| `status` | text | `training`, `candidate`, `production`, `failed`, `archived` |
| `training_start_date`, `training_end_date` | date | Fit window (optional for baselines) |
| `validation_start_date`, `validation_end_date` | date | Holdout window |
| `git_commit` | text | Code version |
| `artifact_path` | text | Storage path for saved model checkpoint (Neural ODE) |
| `hyperparameters` | jsonb | Training config |
| `metrics` | jsonb | MAE, RMSE, trend accuracy, `residual_sigma_by_horizon` |

Seeded baselines: `persistence_v1`, `moving_average_v1`, `trend_v1`, `seasonal_naive_v1`, `ensemble_v1`.

#### `predictions`

| Column | Type | Description |
|--------|------|-------------|
| `model_run_id` | uuid FK → `model_runs` | |
| `entity_type` | text | `site`, `county`, `state` (Phase 6 uses `state`/`county` only) |
| `entity_id` | text | `IL`, `17031`, or site ID |
| `forecast_origin_week` | date | “As of” Monday for the forecast |
| `target_date` | date | `forecast_origin_week + horizon_weeks * 7 days` |
| `horizon_weeks` | integer | 1–4 for baselines |
| `predicted_activity_index` | numeric | Point forecast |
| `lower_bound`, `upper_bound` | numeric | ~80% interval from residual sigma |
| `predicted_trend` | text | Trend label for target week |
| `confidence_label` | text | `low`, `medium`, `high` |

Unique key: `(model_run_id, entity_type, entity_id, forecast_origin_week, horizon_weeks)`.

#### `prediction_actuals`

Filled after actual data arrives to score past forecasts.

| Column | Type | Description |
|--------|------|-------------|
| `prediction_id` | uuid FK → `predictions` | |
| `actual_activity_index` | numeric | Observed index |
| `absolute_error`, `squared_error` | numeric | |
| `trend_correct` | boolean | Did trend direction match |

#### `prediction_derivatives` (Phase 7, Neural ODE)

Migration: `20260521130000_phase7_neural_ode.sql`. Sub-week Neural ODE trajectory samples.

| Column | Type | Description |
|--------|------|-------------|
| `prediction_id` | uuid FK → `predictions` | Parent horizon row |
| `step_idx` | integer | Local 0..6 within this prediction’s 7-day segment |
| `t_offset_days` | numeric | Absolute days from `forecast_origin_week` (1..28) |
| `predicted_value` | numeric | Activity index at step (app rounds to 4 decimals) |
| `predicted_derivative` | numeric | dx/dt at step (app rounds to 4 decimals) |

UI stitches derivatives for one origin by ordering on `t_offset_days`. See [PHASE7_DESIGN.md](PHASE7_DESIGN.md).

---

## Supabase Storage

| Bucket | Contents |
|--------|----------|
| `raw-cdc-wastewater-snapshots` | Versioned CSV snapshots per ingest (multi-part if large) |
| `model-artifacts` | Saved Neural ODE checkpoints and related artifacts |
| `exports` | Optional precomputed JSON for the dashboard |

Paths look like: `cdc-wastewater/YYYY/MM/DD/cdc_wastewater_<timestamp>_partNNofNN.csv`

---

## Row-level security (RLS)

| Table | Public read (anon key) | Service role write |
|-------|------------------------|-------------------|
| `app_status` | Yes | N/A |
| `sites` | Yes | Pipeline |
| `clean_observations` | Yes | Pipeline |
| `weekly_site_metrics` | Yes | Pipeline |
| `weekly_region_metrics` | Yes | Pipeline |
| `model_runs` | Yes | Pipeline |
| `predictions` | Yes | Pipeline |
| `prediction_actuals` | Yes | Pipeline |
| `prediction_derivatives` | Yes | Pipeline |
| `raw_cdc_wastewater_samples` | No | Pipeline |
| `ingestion_runs`, `data_sources` | No | Pipeline |

The Next.js app uses the **anon/publishable** key for reads. All writes go through GitHub Actions with the **service role** key.

---

## Python pipeline scripts

| Script | Role |
|--------|------|
| `scripts/ingest_cdc.py` | Download CDC CSV → `raw_cdc_wastewater_samples` + Storage |
| `scripts/refresh_sites.py` | Build/update `sites` from raw IL rows |
| `scripts/transform_clean_observations.py` | Raw IL → `clean_observations` |
| `scripts/build_weekly_metrics.py` | `clean_observations` → weekly tables |
| `scripts/generate_forecasts.py` | Baseline + ensemble predictions → `predictions` |
| `scripts/evaluate_forecasts.py` | Score past predictions → `prediction_actuals`, update `model_runs.metrics` |
| `scripts/run_weekly_pipeline.py` | Orchestrates ingest → clean → metrics → evaluate → generate (scheduled weekly) |

Illinois raw rows are paginated from Supabase in year chunks (`scripts/lib/raw_il_fetch.py`) because PostgREST returns at most 1000 rows per request.

Weekly metrics use `include_in_model = true` observations and aggregate by `(site_id, week_start)` then roll up to Cook County and Illinois regions.

---

## Site activity status

Computed when sites are refreshed (`compute_active_status` in `cleaning_rules.py`):

| Status | Condition (days since last sample vs reference date) |
|--------|--------------------------------------------------|
| `active` | ≤ 14 |
| `recent` | ≤ 30 |
| `stale` | ≤ 90 |
| `inactive` | > 90 |

Reference date is the maximum `sample_collect_date` seen in the Illinois raw batch.

---

## Indexes (query performance)

Important indexes for dashboard and ML prep:

| Table | Index | Use |
|-------|-------|-----|
| `clean_observations` | `(is_cook_county, sample_date) WHERE include_in_model` | Cook County model pulls |
| `clean_observations` | `(site_id, sample_date)` | Site history |
| `clean_observations` | `(state_territory, week_start)` | State/week grouping |
| `weekly_site_metrics` | `(week_start)`, `(state_territory, week_start)` | Time series, map history |
| `weekly_region_metrics` | `(region_type, week_start)`, `(region_id, week_start)` | Regional dashboards |
| `sites` | `(state_territory, active_status)`, `(is_cook_county_site, active_status)` | Filters |

---

## Query patterns

### Dashboard (Next.js / Supabase JS client)

| Need | Table | Typical filter |
|------|-------|------------------|
| Latest IL state summary | `weekly_region_metrics` | `region_type=state`, `region_id=IL`, order by `week_start` desc, limit 1 |
| IL timeseries | `weekly_region_metrics` | `region_type=state`, `region_id=IL`, order `week_start` asc |
| Cook summary | `weekly_region_metrics` | `region_type=county`, `region_id=17031` |
| Latest site metrics | `weekly_site_metrics` | `state_territory=il`, latest `week_start` |
| County map history | `getSiteHistoricalMetrics()` | All IL site weeks since `fromDate` (paginated server-side) |
| Site list | `sites` | `state_territory=il` |

### Machine learning (recommended)

| Need | Source | Notes |
|------|--------|-------|
| Training matrix (region) | `weekly_region_metrics` | Filter `region_id IN ('17031','IL')`, all weeks |
| Training matrix (site) | `weekly_site_metrics` | Join `sites` for Cook flag; filter `include_in_model` via clean_observations or trust weekly rollups |
| Point-in-time features | `clean_observations` | `include_in_model = true`, date range, optional `is_cook_county` |
| Labels for evaluation | `weekly_region_metrics` + future `prediction_actuals` | Hold out last N weeks per rolling-origin validation |

Use **count + parallel range** when pulling more than 1000 rows from `weekly_site_metrics` or `clean_observations` (PostgREST default page size is 1000).

---

## Data quality checklist for modeling

Before training baselines or Neural ODE models, confirm:

1. **Entity choice**: Region-level (Cook + IL) is simplest; 236 complete weeks, no null targets.
2. **Holdout**: Reserve the last 8–12 weeks (or use rolling-origin validation); never train on the same weeks you evaluate for horizon forecasts.
3. **Sparse sites**: Drop or exclude sites with fewer than ~26 weeks of `weekly_site_metrics`.
4. **First weeks**: Drop the first 1–2 weeks per series (`insufficient_data` trend).
5. **Exclusions**: Re-run grouped counts on `exclusion_reason` for IL `include_in_model = false` before trusting the training set size.
6. **Schema**: Phase 6 migration applied for `model_runs`, `predictions`, and `prediction_actuals`.

---

## Forecast query patterns

| Need | Table | Typical filter |
|------|-------|----------------|
| Latest ensemble forecast | `predictions` join `model_runs` | `model_name=ensemble_v1`, latest `forecast_origin_week` |
| Model lab metrics | `model_runs` | Read `metrics.by_horizon` JSON |
| Unscored predictions | `predictions` left join `prediction_actuals` | `target_date <= latest_week` |

---

## Related documentation

| Document | Topic |
|----------|--------|
| [PHASE6.md](PHASE6.md) | Baseline forecasting: models, pipeline, UI, verification |
| [PHASE7_DESIGN.md](PHASE7_DESIGN.md) | Neural ODE technical design (Step 2: schema + deps) |
| [CDC_DataAnalysis.md](CDC_DataAnalysis.md) | Source dataset and column semantics |
| [BiologicalPerspective.md](BiologicalPerspective.md) | Wastewater biology and interpretation limits |
| [pandemic-flow-architecture-plan.md](pandemic-flow-architecture-plan.md) | Full system design and phase plan |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Vercel, Supabase, secrets, CI |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05 | Phase 6 forecasting: model_runs, predictions, prediction_actuals, baseline pipeline — see [PHASE6.md](PHASE6.md) |