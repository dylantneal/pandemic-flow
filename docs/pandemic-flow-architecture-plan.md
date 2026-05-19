# Pandemic Flow Architecture Plan

A code-first architecture for a web-based COVID wastewater dynamics platform using CDC wastewater data, Supabase, Vercel, GitHub Actions, and a Neural ODE modeling layer.

---

## 1. Project Summary

**Pandemic Flow** is a web-based biological surveillance visualization system that ingests public CDC wastewater data, transforms it into interpretable COVID activity signals, trains forecasting and continuous-dynamics models, and presents the hidden motion of COVID activity through maps, graphs, model explanations, and uncertainty-aware predictions.

The core thesis:

> COVID leaves a biological trace in wastewater. This system turns that trace into a visual, continuously updated model of community viral activity.

The first full iteration should be narrow, deep, and polished:

> **Pandemic Flow v1: Illinois / Cook County COVID Wastewater Dynamics**

This first version focuses on Illinois and Cook County because that gives the project local relevance, keeps the scope manageable, and still provides enough data to build a meaningful product.

---

## 2. First Full Iteration Scope

### Included in v1

- CDC wastewater data ingestion
- Illinois and Cook County filtering
- Supabase raw data storage
- Supabase cleaned observation tables
- Weekly site-level metrics
- Weekly region-level metrics
- Data quality scoring
- Baseline forecasts
- Neural ODE prototype
- Forecast and prediction tables
- Model run tracking
- Interactive dashboard
- Methods and explanation pages
- Automated Saturday update pipeline

### Not included in v1

- Full national production-scale modeling
- Exact wastewater treatment plant map pins
- User accounts
- Alerts or notifications
- Variant sequencing layer
- Hospitalization/death overlays
- Graph Neural ODE
- Real-time streaming
- Mobile app

---

## 3. Recommended Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts, Visx, D3, or Observable Plot
- MapLibre or Mapbox
- Vercel

### Database and Platform

- Supabase Postgres
- Supabase Storage
- Supabase CLI
- Supabase generated TypeScript types
- Supabase Row Level Security

### Pipelines and Automation

- Python
- pandas or Polars
- NumPy
- scikit-learn
- PyTorch
- torchdiffeq or torchdyn
- GitHub Actions

### Optional Later Additions

- FastAPI backend
- MLflow
- Prefect or Dagster
- Sentry
- Axiom / Logtail
- Supabase Edge Functions
- Supabase Cron

---

## 4. High-Level System Architecture

```text
CDC Data API / CSV
        ↓
GitHub Actions weekly pipeline
        ↓
Raw snapshot saved to Supabase Storage
        ↓
Raw records upserted into Supabase Postgres
        ↓
Validation + cleaning + feature engineering
        ↓
Weekly site/county metrics
        ↓
Baseline forecasts + Neural ODE predictions
        ↓
Prediction tables + model run tables
        ↓
Next.js frontend on Vercel
        ↓
Interactive dashboard
```

Detailed architecture:

```text
                        ┌──────────────────────────┐
                        │ CDC Wastewater Dataset    │
                        │ CSV / Socrata API         │
                        └─────────────┬────────────┘
                                      │
                                      │ Saturday GitHub Action
                                      ▼
                        ┌──────────────────────────┐
                        │ Python Pipeline           │
                        │ ingest / validate / clean │
                        └─────────────┬────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
┌──────────────────────────┐                    ┌──────────────────────────┐
│ Supabase Storage          │                    │ Supabase Postgres         │
│ raw CSV snapshots         │                    │ raw + clean + metrics     │
│ model artifacts           │                    │ predictions + model runs  │
└──────────────────────────┘                    └─────────────┬────────────┘
                                                              │
                                                              │ SQL/API reads
                                                              ▼
                                                ┌──────────────────────────┐
                                                │ Next.js API Routes        │
                                                │ dashboard endpoints       │
                                                └─────────────┬────────────┘
                                                              │
                                                              ▼
                                                ┌──────────────────────────┐
                                                │ Vercel Frontend           │
                                                │ maps / charts / model lab │
                                                └──────────────────────────┘
```

---

## 5. Major Architectural Layers

### 5.1 User Interface Layer

The UI is the product experience. It should show users:

- Current wastewater activity
- Whether activity is rising, falling, or stable
- Model predictions
- Forecast uncertainty
- Signal quality
- Biological interpretation
- Differential equation / Neural ODE explanation

### 5.2 API / Data Access Layer

For v1, use Next.js API routes and Supabase queries.

Avoid a separate FastAPI backend until there is a clear need.

Example endpoints:

```text
GET /api/health
GET /api/metadata/latest-update

GET /api/regions
GET /api/regions/illinois/summary
GET /api/regions/illinois/timeseries
GET /api/regions/cook-county/summary
GET /api/regions/cook-county/timeseries
GET /api/regions/cook-county/predictions

GET /api/sites?region=cook-county
GET /api/sites/[siteId]/summary
GET /api/sites/[siteId]/timeseries
GET /api/sites/[siteId]/predictions
GET /api/sites/[siteId]/quality

GET /api/model-runs/latest
GET /api/model-runs/[id]
GET /api/model-runs/[id]/metrics
```

### 5.3 Data Layer

Supabase is the system of record.

It stores:

- External source metadata
- Ingestion runs
- Raw CDC records
- Clean observations
- Weekly site metrics
- Weekly region metrics
- Model runs
- Predictions
- Prediction actuals
- Quality flags
- Model artifacts and raw snapshots through Supabase Storage

### 5.4 Pipeline Layer

GitHub Actions should run the main weekly Python pipeline.

The pipeline should:

1. Fetch CDC data
2. Save the raw snapshot
3. Validate schema
4. Upsert raw rows
5. Clean and transform observations
6. Build weekly metrics
7. Generate baseline predictions
8. Run Neural ODE inference
9. Store predictions
10. Evaluate previous predictions
11. Trigger Vercel cache revalidation

### 5.5 Modeling Layer

The modeling layer should include:

- Observed trend model
- Persistence baseline
- Moving-average baseline
- Optional statistical baseline
- Neural ODE model

The Neural ODE should not be the only model. It should be compared honestly against simple baselines.

---

## 6. Product Pages

### `/`

Homepage.

Purpose:

- Explain the project
- Show high-level Illinois/Cook County signal
- Show latest update date
- Invite users into the dashboard

### `/illinois`

Illinois-wide wastewater activity dashboard.

Shows:

- State-level activity
- Weekly trends
- Active site count
- Region-level model forecast
- Data quality summary

### `/cook-county`

Cook County focused dashboard.

Shows:

- Current activity
- Trend
- Weekly change
- Forecast
- Signal quality
- Time-series chart
- Rate-of-change chart
- Site comparison panel

### `/sites/[siteId]`

Individual anonymized site page.

Shows:

- Site-level time series
- Sample history
- Data quality
- Forecast
- Inclusion/exclusion details
- Method consistency warnings

### `/model-lab`

Technical model page.

Shows:

- Latest model run
- Baseline vs Neural ODE performance
- Forecast error by horizon
- Model artifacts
- Model cards
- Training window
- Validation window

### `/methods`

Scientific and technical explanation.

Covers:

- Wastewater biology
- CDC data source
- What viral RNA in wastewater means
- What it does not mean
- Differential equations
- Neural ODEs
- Data cleaning
- Quality scoring
- Limitations

### `/about`

Project overview.

Covers:

- Motivation
- Disclaimer
- Data source
- Update schedule
- Technical stack
- GitHub link

---

## 7. User Experience Strategy

The app should feel:

- Scientific
- Calm
- Biological
- Technical
- Visual
- Trustworthy
- Slightly cinematic
- Not alarmist

Avoid:

- Panic aesthetics
- Red everywhere
- Skull/danger styling
- Fake medical precision
- Overclaiming predictions

Suggested visual palette:

- Deep navy
- Slate
- Cyan
- Teal
- Violet
- Soft amber for caution
- Muted red only for high/rising states

---

## 8. Core Dashboard Components

### Summary Cards

Display:

- Current activity
- Trend
- Weekly change
- Forecast
- Signal quality
- Latest sample date
- Sites represented
- Population represented

Example:

```text
Cook County, IL

Current activity: Moderate
Trend: Rising
Weekly change: +14%
Forecast: Likely rising over next 2 weeks
Signal quality: Good
Latest sample: 2026-05-12
Sites represented: 19
```

### Map Panel

For v1, use county-level mapping.

The CDC data uses anonymized site IDs and provides county/state metadata, but not exact public plant coordinates. Therefore, do not invent exact pins.

Recommended map hierarchy:

```text
United States
→ State
→ County
→ Anonymized site panel
```

For v1:

```text
Illinois county map
Cook County highlighted
Active anonymized sites listed in side panel
```

### Main Time-Series Chart

Layers:

```text
Raw samples = dots
Weekly median = thin line
Normalized activity index = main line
Neural ODE trajectory = glowing curve
Forecast = dashed curve
Uncertainty = shaded band
Quality warnings = markers
```

### Rate-of-Change Chart

This is where differential equations become visible.

```text
x-axis: time
y-axis: estimated d(activity)/dt
```

Interpretation:

```text
above 0 = activity rising
near 0 = stable
below 0 = activity falling
```

### Model Comparison Panel

Show:

- Persistence baseline
- Moving-average baseline
- Statistical baseline
- Neural ODE

The Neural ODE should earn its place by being compared to simpler methods.

### Data Quality Panel

Display:

- Recent sample coverage
- Missing values
- Method changes
- Limit of detection issues
- Unit consistency
- Sample matrix consistency
- Signal quality score

---

## 9. Repository Architecture

Recommended monorepo:

```text
pandemic-flow/
  apps/
    web/
      app/
      components/
      lib/
      hooks/
      types/
      public/
      package.json

  packages/
    database/
      supabase/
        migrations/
        seed.sql
        config.toml
      types/
        supabase.ts

    pipeline/
      pandemic_flow/
        __init__.py
        config.py
        ingest/
        transform/
        features/
        models/
        evaluation/
        predictions/
        quality/
        db/
        storage/
      scripts/
        ingest_cdc.py
        build_features.py
        train_baselines.py
        train_neural_ode.py
        generate_predictions.py
        run_weekly_pipeline.py
      tests/
      pyproject.toml

  .github/
    workflows/
      ci.yml
      weekly-data-update.yml
      train-model.yml

  docs/
    architecture.md
    data-dictionary.md
    model-card.md
    methodology.md

  README.md
```

---

## 10. Supabase Database Schema

### 10.1 `data_sources`

Tracks external datasets.

```sql
create table data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null,
  dataset_slug text,
  source_url text not null,
  update_cadence text,
  last_checked_at timestamptz,
  last_successful_ingest_at timestamptz,
  latest_source_updated_at timestamptz,
  schema_hash text,
  created_at timestamptz default now()
);
```

Example source:

```text
name = CDC Wastewater Data for SARS-CoV-2
provider = CDC
dataset_slug = j9g8-acpt
update_cadence = weekly_friday
```

### 10.2 `ingestion_runs`

Every pipeline run gets a row.

```sql
create table ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid references data_sources(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed', 'partial')),
  trigger_type text not null check (trigger_type in ('manual', 'schedule', 'backfill')),
  git_commit text,
  source_row_count integer,
  inserted_count integer,
  updated_count integer,
  skipped_count integer,
  error_message text,
  raw_snapshot_path text,
  created_at timestamptz default now()
);
```

### 10.3 `raw_cdc_wastewater_samples`

Mirrors the CDC file closely.

```sql
create table raw_cdc_wastewater_samples (
  id uuid primary key default gen_random_uuid(),

  site text not null,
  state_territory text,
  county_fips text,
  counties_served text,
  population_served numeric,
  source text,

  sample_id text,
  sample_collect_date date not null,
  sample_type text,
  sample_matrix text,
  sample_location text,
  flow_rate numeric,

  concentration_method text,
  extraction_method text,
  pcr_type text,
  major_lab_method text,

  inhibition_detect text,
  inhibition_adjust text,
  ntc_amplify text,

  pcr_target text,
  pcr_gene_target_agg text,
  pcr_target_avg_conc numeric,
  pcr_target_units text,
  lod_sewage numeric,
  pcr_target_detect text,

  pcr_target_avg_conc_lin numeric,
  pcr_target_flowpop_lin numeric,
  pcr_target_mic_lin numeric,

  date_updated timestamptz,
  ingestion_run_id uuid references ingestion_runs(id),
  row_hash text not null,
  ingested_at timestamptz default now(),

  unique (site, sample_id, sample_collect_date, pcr_gene_target_agg, row_hash)
);
```

This table should remain close to the original source.

### 10.4 `sites`

One row per anonymized CDC site.

```sql
create table sites (
  site_id text primary key,
  state_territory text,
  county_fips text,
  counties_served text,
  population_served numeric,
  first_sample_date date,
  last_sample_date date,
  sample_count integer default 0,
  active_status text check (active_status in ('active', 'recent', 'stale', 'inactive')),
  dominant_units text,
  dominant_sample_matrix text,
  dominant_sample_location text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 10.5 `clean_observations`

Modeling-ready observations.

```sql
create table clean_observations (
  id uuid primary key default gen_random_uuid(),
  raw_sample_id uuid references raw_cdc_wastewater_samples(id),
  site_id text references sites(site_id),

  sample_date date not null,
  week_start date not null,

  state_territory text,
  county_fips text,
  counties_served text,

  raw_concentration numeric,
  log_concentration numeric,
  normalized_concentration numeric,

  units text,
  detected boolean,
  below_lod boolean,

  sample_matrix text,
  sample_type text,
  sample_location text,
  lab_method_group text,

  include_in_model boolean default true,
  exclusion_reason text,

  quality_score numeric,
  quality_flags jsonb default '[]'::jsonb,

  created_at timestamptz default now()
);
```

### 10.6 `weekly_site_metrics`

One row per site per week.

```sql
create table weekly_site_metrics (
  id uuid primary key default gen_random_uuid(),
  site_id text references sites(site_id),
  week_start date not null,

  state_territory text,
  county_fips text,

  sample_count integer not null,
  median_log_concentration numeric,
  mean_log_concentration numeric,
  activity_index numeric,

  week_over_week_change numeric,
  two_week_change numeric,
  four_week_change numeric,

  estimated_growth_rate numeric,
  trend_label text check (trend_label in ('rising', 'falling', 'stable', 'insufficient_data')),

  quality_score numeric,
  quality_flags jsonb default '[]'::jsonb,

  latest_sample_date date,

  created_at timestamptz default now(),

  unique (site_id, week_start)
);
```

### 10.7 `weekly_region_metrics`

Aggregated region metrics.

```sql
create table weekly_region_metrics (
  id uuid primary key default gen_random_uuid(),

  region_type text not null check (region_type in ('county', 'state', 'national')),
  region_id text not null,
  region_name text not null,
  week_start date not null,

  site_count integer,
  active_site_count integer,
  population_represented numeric,

  median_activity_index numeric,
  weighted_activity_index numeric,

  week_over_week_change numeric,
  estimated_growth_rate numeric,
  trend_label text,

  quality_score numeric,
  quality_flags jsonb default '[]'::jsonb,

  created_at timestamptz default now(),

  unique (region_type, region_id, week_start)
);
```

### 10.8 `model_runs`

Tracks model training and evaluation.

```sql
create table model_runs (
  id uuid primary key default gen_random_uuid(),

  model_name text not null,
  model_type text not null check (
    model_type in ('persistence', 'moving_average', 'statistical_baseline', 'neural_ode')
  ),

  version text not null,
  status text not null check (status in ('training', 'candidate', 'production', 'failed', 'archived')),

  training_started_at timestamptz,
  training_finished_at timestamptz,

  training_start_date date,
  training_end_date date,
  validation_start_date date,
  validation_end_date date,

  git_commit text,
  data_snapshot_path text,
  artifact_path text,

  hyperparameters jsonb,
  metrics jsonb,
  notes text,

  created_at timestamptz default now()
);
```

### 10.9 `predictions`

Stores model forecasts.

```sql
create table predictions (
  id uuid primary key default gen_random_uuid(),

  model_run_id uuid references model_runs(id),

  entity_type text not null check (entity_type in ('site', 'county', 'state')),
  entity_id text not null,
  entity_name text,

  forecast_created_at timestamptz not null default now(),
  target_date date not null,
  horizon_days integer not null,

  predicted_activity_index numeric,
  lower_bound numeric,
  upper_bound numeric,

  predicted_trend text,
  confidence_label text check (confidence_label in ('low', 'medium', 'high')),
  quality_flags jsonb default '[]'::jsonb,

  created_at timestamptz default now()
);
```

### 10.10 `prediction_actuals`

Evaluates predictions after actual data arrives.

```sql
create table prediction_actuals (
  id uuid primary key default gen_random_uuid(),

  prediction_id uuid references predictions(id),
  actual_activity_index numeric,
  actual_trend text,
  absolute_error numeric,
  squared_error numeric,
  trend_correct boolean,

  evaluated_at timestamptz default now()
);
```

---

## 11. Supabase Storage Buckets

Use these buckets:

```text
raw-snapshots
model-artifacts
exports
```

Example paths:

```text
raw-snapshots/
  cdc-wastewater/
    2026-05-23/
      raw.csv
      metadata.json
      schema.json

model-artifacts/
  neural-ode/
    2026-05-23/
      model.pt
      config.json
      metrics.json

exports/
  dashboard/
    cook-county-latest.json
```

---

## 12. Ingestion Pipeline

Recommended weekly schedule:

```text
Saturday 7:30 AM America/Chicago
```

Pipeline flow:

```text
1. Start ingestion_run
2. Download CDC CSV/API data
3. Save raw snapshot to Supabase Storage
4. Validate schema
5. Compute row hashes
6. Upsert raw records
7. Refresh sites table
8. Generate clean observations
9. Generate weekly site metrics
10. Generate weekly region metrics
11. Train/update baselines
12. Run Neural ODE inference
13. Save predictions
14. Mark ingestion_run success
15. Trigger Vercel cache revalidation
```

---

## 13. Python Pipeline Scripts

Recommended scripts:

```text
packages/pipeline/scripts/
  run_weekly_pipeline.py
  ingest_cdc.py
  validate_raw.py
  transform_clean_observations.py
  build_weekly_metrics.py
  train_baselines.py
  train_neural_ode.py
  generate_predictions.py
  evaluate_predictions.py
  publish_dashboard_cache.py
```

The main workflow should call:

```bash
python scripts/run_weekly_pipeline.py --scope illinois
```

---

## 14. GitHub Actions

### 14.1 CI Workflow

`.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test

  pipeline:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/pipeline
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -e ".[dev]"
      - run: pytest
```

### 14.2 Weekly Data Update Workflow

`.github/workflows/weekly-data-update.yml`

```yaml
name: Weekly Data Update

on:
  workflow_dispatch:
  schedule:
    - cron: "30 12 * * 6"

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 120

    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      CDC_WASTEWATER_CSV_URL: ${{ secrets.CDC_WASTEWATER_CSV_URL }}
      VERCEL_REVALIDATE_URL: ${{ secrets.VERCEL_REVALIDATE_URL }}
      VERCEL_REVALIDATE_SECRET: ${{ secrets.VERCEL_REVALIDATE_SECRET }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install pipeline
        working-directory: packages/pipeline
        run: pip install -e ".[prod]"

      - name: Run weekly pipeline
        working-directory: packages/pipeline
        run: python scripts/run_weekly_pipeline.py --scope illinois

      - name: Revalidate Vercel cache
        run: |
          curl -X POST "$VERCEL_REVALIDATE_URL" \
            -H "Authorization: Bearer $VERCEL_REVALIDATE_SECRET"
```

---

## 15. Why GitHub Actions Instead of Vercel Cron for the Main Pipeline?

Vercel Cron is useful for lightweight scheduled functions, but the main pipeline involves:

- Downloading a large CSV
- Transforming hundreds of thousands of rows
- Writing to Supabase
- Running Python feature engineering
- Training or loading ML models
- Generating predictions

That is better handled by GitHub Actions because:

- It is Python-native
- It is visible in the repo
- It is easy to run manually
- It can handle longer-running jobs
- It works naturally with secrets and CI/CD

Use Vercel Cron later for:

- Lightweight cache refreshes
- Health checks
- Calling a small revalidation endpoint

---

## 16. Feature Engineering

### 16.1 Raw Signal

Use:

```text
pcr_target_avg_conc_lin
```

Then compute:

```text
log_concentration = log1p(pcr_target_avg_conc_lin)
```

The log transform is important because wastewater viral concentration values are often highly skewed.

### 16.2 Filtering

For v1, use a clean subset:

```text
state_territory = IL
county includes Cook
pcr_target = SARS-CoV-2
sample_location = wwtp where available
consistent pcr_target_units
valid sample_collect_date
valid concentration
```

### 16.3 Weekly Aggregation

For each site/week:

```text
weekly_value = median(log_concentration)
```

Median is robust against noisy spikes.

### 16.4 Activity Index

Create an educational activity index:

```text
activity_index = site-normalized current level relative to historical baseline
```

Possible implementation:

```text
activity_index = z-score of weekly log concentration within site
```

or:

```text
activity_index = percentile rank of current weekly value within site history
```

Important caveat:

> Unless directly using the CDC’s official Wastewater Viral Activity Level, label this as a model-derived or project-derived activity index.

---

## 17. Data Quality Scoring

A quality score should be computed from 0 to 1.

Factors:

- Recent sample available
- Enough samples in the last 4 weeks
- Consistent units
- Consistent sample matrix
- Concentration not missing
- Not below limit of detection
- No PCR inhibition flag
- No negative-control amplification flag
- Stable lab method
- Site has enough historical data

Example scoring:

```python
score = 1.0

if latest_sample_age_days > 14:
    score -= 0.20

if samples_last_4_weeks < 3:
    score -= 0.20

if method_changed_recently:
    score -= 0.15

if units_inconsistent:
    score -= 0.20

if many_below_lod:
    score -= 0.10

score = max(0, min(score, 1))
```

Suggested labels:

```text
0.80–1.00: Good
0.60–0.79: Moderate
0.40–0.59: Weak
<0.40: Use caution
```

---

## 18. Modeling Strategy

The model stack should be a ladder.

### Model 0: Observed Trend

No ML.

Uses:

- Current weekly activity
- Week-over-week change
- Rolling median

### Model 1: Persistence Baseline

```text
next week = this week
```

This is the sanity check.

### Model 2: Moving Average Baseline

```text
next week = average of previous N weeks
```

### Model 3: Statistical Baseline

Optional for v1.

Possibilities:

- Linear trend over recent weeks
- Seasonal regression
- Gradient boosting
- ARIMA-like baseline

### Model 4: Neural ODE

The Neural ODE learns a continuous hidden state:

```math
\frac{dz(t)}{dt} = f_\theta(z(t), t, c)
```

Where:

```text
z(t) = hidden COVID/wastewater activity state
t = continuous time
c = context features such as site, region, season
fθ = neural network that learns dynamics
```

Output:

- Predicted activity index
- Uncertainty band
- Estimated derivative
- Trend label

---

## 19. Neural ODE Scope for v1

Use a region-level Neural ODE first.

Input:

```text
weekly Cook County activity index
```

Output:

```text
1-week, 2-week, 3-week, and 4-week forecast
learned continuous trajectory
estimated derivative
```

Do not start with:

- all U.S. sites
- multi-site embeddings
- spatial graph ODE
- variant-aware model

Those are later versions.

---

## 20. Model Evaluation

Use rolling-origin validation.

Example:

```text
Train through 2024-12-31
Predict next 4 weeks
Move forward one week
Repeat
```

Metrics:

- MAE
- RMSE
- Trend accuracy
- Forecast interval coverage
- 1-week error
- 2-week error
- 4-week error

Trend accuracy is especially important:

```text
Did the model correctly predict rising/falling/stable?
```

---

## 21. Prediction Output

Each forecast should include:

- Predicted activity index
- Lower bound
- Upper bound
- Predicted trend
- Confidence label
- Quality flags
- Forecast horizon

Example:

```json
{
  "region": "Cook County, IL",
  "forecast_created_at": "2026-05-23T10:00:00Z",
  "horizon_days": 14,
  "predicted_activity_index": 2.7,
  "lower_bound": 1.9,
  "upper_bound": 3.8,
  "trend": "rising",
  "growth_rate_weekly": 0.18,
  "confidence": "medium",
  "warnings": [
    "Recent samples are sparse",
    "One site changed lab method within the last 8 weeks"
  ]
}
```

The app should not claim exact case counts.

Use language like:

> Wastewater activity is predicted to rise.

Avoid:

> COVID cases will be X.

---

## 22. Frontend Component Architecture

```text
components/
  layout/
    AppShell.tsx
    Header.tsx
    Sidebar.tsx

  dashboard/
    SummaryCards.tsx
    RegionOverview.tsx
    ActivityMap.tsx
    TrendNarrative.tsx

  charts/
    WastewaterTimeSeriesChart.tsx
    ForecastChart.tsx
    DerivativeChart.tsx
    ModelComparisonChart.tsx
    SiteComparisonChart.tsx

  maps/
    IllinoisCountyMap.tsx
    RegionMap.tsx

  model/
    NeuralOdeExplainer.tsx
    PhasePortrait.tsx
    ModelMetricsTable.tsx
    ModelRunBadge.tsx

  quality/
    DataQualityPanel.tsx
    QualityFlagBadge.tsx
    SampleCoverageTable.tsx

  methods/
    BiologyExplainer.tsx
    DifferentialEquationExplainer.tsx
    DataSourceCard.tsx
```

---

## 23. Frontend Types

```ts
export type TrendLabel = "rising" | "falling" | "stable" | "insufficient_data";

export type ConfidenceLabel = "low" | "medium" | "high";

export interface RegionSummary {
  regionId: string;
  regionName: string;
  regionType: "county" | "state" | "national";
  latestWeek: string;
  activityIndex: number | null;
  trendLabel: TrendLabel;
  weeklyChange: number | null;
  qualityScore: number | null;
  activeSiteCount: number;
  populationRepresented: number | null;
  latestSampleDate: string | null;
}

export interface TimeseriesPoint {
  date: string;
  rawValue?: number | null;
  logConcentration?: number | null;
  activityIndex?: number | null;
  trend?: TrendLabel;
  qualityScore?: number | null;
}

export interface PredictionPoint {
  targetDate: string;
  horizonDays: number;
  predictedActivityIndex: number;
  lowerBound: number | null;
  upperBound: number | null;
  predictedTrend: TrendLabel;
  confidenceLabel: ConfidenceLabel;
}
```

---

## 24. Environment Variables

### Vercel

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
REVALIDATE_SECRET
```

### GitHub Actions Secrets

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CDC_WASTEWATER_CSV_URL
VERCEL_REVALIDATE_URL
VERCEL_REVALIDATE_SECRET
```

### Local `.env`

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CDC_WASTEWATER_CSV_URL=https://data.cdc.gov/api/views/j9g8-acpt/rows.csv?accessType=DOWNLOAD
```

Never expose the Supabase service role key to the browser.

---

## 25. Security Model

For v1:

- Public dashboard reads only public aggregated tables or views.
- Service role key is used only by GitHub Actions.
- Raw tables are not directly exposed to the client.
- Raw snapshots are private.
- Model artifacts are private unless explicitly exported.
- Public reads use Supabase anon key or controlled Next.js API routes.
- Writes are service-role-only.

Use Supabase Row Level Security:

```text
public can read dashboard views
public cannot write anything
public cannot read raw tables unless explicitly exposed
service role can run ingestion
```

---

## 26. Caching Strategy

The data updates weekly, so aggressive caching is fine.

Use:

- Static generation where possible
- Cached API responses
- Precomputed dashboard tables
- Vercel revalidation after weekly pipeline

The frontend should load:

- Region summary
- Weekly time series
- Predictions
- Quality flags

It should not load hundreds of thousands of raw CDC rows.

---

## 27. Testing Strategy

### Frontend Tests

- Type checks
- Component smoke tests
- Chart transform tests
- API route tests

### Pipeline Tests

- Schema validation tests
- Cleaning rule tests
- Feature engineering tests
- Quality score tests
- Small sample ingestion test
- Forecast output shape tests

### Model Tests

- Model trains on tiny fixture
- Prediction output has no NaN
- Forecast horizons are correct
- Model artifact saves and loads

### Data Tests

- Concentrations are non-negative
- Dates are valid
- Site IDs are present
- Weekly metrics are unique by site/week
- Region metrics are unique by region/week

---

## 28. Observability

For v1, keep it simple:

- `ingestion_runs` table
- `model_runs` table
- GitHub Actions logs
- Vercel logs
- Supabase logs

Possible later additions:

- Sentry
- Axiom
- Logtail
- Slack/email failure notifications

Admin/status card:

```text
Latest ingestion: success
Latest model run: success
Latest source update: May 15, 2026
Latest app refresh: May 16, 2026
Rows ingested: 566,757
Cook County clean observations: 8,xxx
```

---

## 29. Build Phases

### Phase 1: Project Foundation

Goal:

```text
Set up the repo, tools, Supabase, Vercel, and basic app shell.
```

Tasks:

- Create GitHub repo
- Create Next.js app
- Install Tailwind/shadcn
- Create Supabase project
- Initialize Supabase CLI locally
- Create migrations folder
- Set up Vercel project
- Add environment variables
- Create CI workflow
- Create basic homepage
- Create methods/about placeholder pages

Deliverable:

```text
A deployed empty app with working Supabase connection.
```

Definition of done:

- Vercel deploys on push
- Supabase local dev works
- CI runs lint/typecheck/tests
- Database migrations are committed

---

### Phase 2: Database Schema and Raw Ingestion

Goal:

```text
Get CDC data into Supabase reproducibly.
```

Tasks:

- Create `data_sources`
- Create `ingestion_runs`
- Create `raw_cdc_wastewater_samples`
- Create Supabase Storage bucket for raw snapshots
- Write CDC downloader
- Write schema validator
- Write row hashing/upsert logic
- Write ingestion run logging
- Run ingestion manually from Cursor

Deliverable:

```text
Raw CDC wastewater data is saved to Storage and loaded into Supabase.
```

Definition of done:

- Can run `python scripts/ingest_cdc.py`
- Raw snapshot appears in Storage
- Raw rows appear in Supabase
- Ingestion run status is recorded
- Errors are logged cleanly

---

### Phase 3: Cleaning and Illinois/Cook Filtering

Goal:

```text
Turn raw CDC rows into usable modeling observations.
```

Tasks:

- Create `sites`
- Create `clean_observations`
- Write site refresh script
- Write cleaning rules
- Filter Illinois/Cook County
- Compute log concentrations
- Flag missing/bad rows
- Generate quality flags
- Mark `include_in_model` true/false

Deliverable:

```text
Clean observations table for Illinois/Cook County.
```

Definition of done:

- Can query clean Cook County observations
- Rows have log concentration
- Rows have quality flags
- Bad rows are excluded with reasons
- Sites table has active/stale status

---

### Phase 4: Weekly Metrics

Goal:

```text
Create dashboard-ready metrics.
```

Tasks:

- Create `weekly_site_metrics`
- Create `weekly_region_metrics`
- Compute weekly medians
- Compute activity index
- Compute weekly/two-week/four-week changes
- Compute trend labels
- Compute quality scores
- Aggregate Cook County and Illinois

Deliverable:

```text
Clean weekly time series for dashboard charts.
```

Definition of done:

- Cook County has weekly values
- Illinois has weekly values
- Charts can be built without raw queries
- Activity/trend/quality are precomputed

---

### Phase 5: Frontend Dashboard v1

Goal:

```text
Make the project visually real before the ML gets complicated.
```

Tasks:

- Build homepage
- Build Illinois page
- Build Cook County page
- Build summary cards
- Build time-series chart
- Build forecast placeholder
- Build data quality panel
- Build site list
- Build methods explainer

Deliverable:

```text
A polished dashboard showing actual wastewater trends.
```

Definition of done:

- User can visit the app
- User can see current activity/trend
- User can see historical time series
- User can understand what wastewater means
- User can see data quality caveats

---

### Phase 6: Baseline Models

Goal:

```text
Add honest forecasting before Neural ODE.
```

Tasks:

- Create `model_runs`
- Create `predictions`
- Implement persistence baseline
- Implement moving average baseline
- Implement trend baseline
- Generate 1/2/3/4-week forecasts
- Evaluate historical forecasts
- Display forecasts in frontend
- Display baseline metrics in model lab

Deliverable:

```text
The app has basic forecasts and model evaluation.
```

Definition of done:

- Predictions table is populated
- Model runs are tracked
- Forecast chart displays prediction band
- Model lab shows baseline performance

---

### Phase 7: Neural ODE Prototype

Goal:

```text
Add the learned-dynamics model.
```

Tasks:

- Create PyTorch dataset from weekly Cook County metrics
- Implement Neural ODE model
- Train on historical weekly activity
- Evaluate rolling forecasts
- Save model artifact to Supabase Storage
- Write model_run row
- Generate predictions
- Generate derivative estimates
- Add Neural ODE layer to chart
- Add Neural ODE explainer page

Deliverable:

```text
A working Neural ODE model whose output appears in the dashboard.
```

Definition of done:

- Neural ODE trains reproducibly
- Artifact is saved
- Predictions are saved
- Frontend shows learned trajectory
- Frontend shows derivative/rate-of-change chart
- Model lab compares Neural ODE against baselines

---

### Phase 8: Automated Weekly Update

Goal:

```text
Make the system update itself.
```

Tasks:

- Create GitHub Actions weekly workflow
- Add Supabase secrets
- Run pipeline every Saturday
- Write failure handling
- Write success/failure logs
- Trigger Vercel cache revalidation
- Evaluate previous predictions
- Optionally create GitHub issue on failure

Deliverable:

```text
The project updates automatically every week.
```

Definition of done:

- Saturday job runs
- New data ingested
- Metrics updated
- Predictions updated
- Dashboard refreshed
- Failures do not corrupt production data

---

### Phase 9: Polish, Documentation, and Public Release

Goal:

```text
Make it portfolio-quality.
```

Tasks:

- Write README
- Write methodology page
- Write data dictionary
- Write model card
- Write limitations section
- Add source citations
- Add disclaimers
- Improve responsive design
- Add loading/error states
- Add Open Graph image
- Add project screenshots
- Record demo video

Deliverable:

```text
A complete public portfolio project.
```

Definition of done:

- A recruiter can understand the project in 2 minutes
- A technical interviewer can inspect the architecture
- A user can understand the visuals
- A skeptical reader can understand the limitations

---

## 30. Suggested Development Order in Cursor

Build in this order:

```text
1. Repo scaffold
2. Supabase migrations
3. Manual ingestion script
4. Clean transformation script
5. Weekly metrics script
6. Static frontend using real Supabase metrics
7. Baseline forecasts
8. Neural ODE notebook/prototype
9. Neural ODE production script
10. GitHub Actions automation
11. Model lab
12. Methods/documentation polish
```

Core principle:

> Build visible product value before chasing the hardest model.

---

## 31. First Release Requirements

The first release should let someone see:

1. COVID wastewater activity in Cook County over time
2. Whether the signal is rising/falling/stable
3. A short forecast
4. How confident the system is
5. The Neural ODE learned trajectory
6. The estimated rate of change
7. How the data was processed
8. Why wastewater matters biologically
9. How the model compares to simple baselines
10. What the limitations are

---

## 32. Key Architecture Decisions

### Decision 1: Supabase as System of Record

Supabase stores:

- Raw records
- Clean observations
- Weekly metrics
- Model runs
- Predictions
- Quality scores

### Decision 2: GitHub Actions for Data and ML Jobs

This keeps the pipeline:

- Visible
- Versioned
- Python-native
- Controlled by code
- Easy to run manually

### Decision 3: Next.js/Vercel for the App

Vercel serves:

- Frontend
- API routes
- Cache revalidation
- Public pages

It should not handle heavy ML jobs.

### Decision 4: Precompute Dashboard Data

The app should query clean, precomputed tables, not raw CDC rows.

### Decision 5: Neural ODE as One Layer

The Neural ODE is the intellectual centerpiece, but not the whole product.

The product should still be valuable if the Neural ODE only performs comparably to baselines.

---

## 33. Scientific Framing

Do not frame the app as:

> An AI COVID predictor.

Frame it as:

> A visual system for understanding the hidden dynamics of COVID activity through wastewater surveillance.

The app should not claim:

- Exact case counts
- Individual risk
- Medical diagnosis
- Certainty about future COVID levels

It should claim:

- Wastewater activity trends
- Community-level signal changes
- Model-estimated direction and uncertainty
- Educational interpretation of hidden dynamics

---

## 34. Guiding Philosophy

> The dashboard is the product.  
> The Neural ODE is the intellectual engine.  
> The data pipeline is the credibility layer.

If the dashboard is beautiful but the pipeline is sloppy, it is a toy.

If the model is fancy but the user experience is bad, no one will care.

If the data is clean, the visuals are clear, the model is honestly evaluated, and the biology is explained well, this becomes a genuinely impressive project.

---

## 35. Reference Links

- CDC Wastewater Data for SARS-CoV-2: https://catalog.data.gov/dataset/cdc-wastewater-data-for-sars-cov-2
- CDC Wastewater About Data: https://www.cdc.gov/wastewater/about-data/index.html
- CDC Wastewater Data Methods: https://www.cdc.gov/wastewater/about/data-methods.html
- CDC Open Data APIs: https://open.cdc.gov/apis.html
- Socrata API Paging: https://dev.socrata.com/docs/paging.html
- Supabase Docs: https://supabase.com/docs
- Supabase CLI Reference: https://supabase.com/docs/reference/cli
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Cron: https://supabase.com/docs/guides/cron
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- Vercel Functions Limits: https://vercel.com/docs/functions/limitations
- GitHub Actions Workflow Syntax: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
