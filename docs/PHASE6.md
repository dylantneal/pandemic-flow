# Phase 6: Baseline Forecasting

Phase 6 adds honest short-horizon forecasting to COVID Flow before Neural ODE modeling (Phase 7). The system tracks model runs, generates baseline and ensemble predictions for Illinois and Cook County, evaluates historical forecasts against actual weekly activity, and surfaces results on the dashboard and Model Lab.

For schema details see [DATA.md](DATA.md). For deployment and secrets see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Goals and scope

| In scope | Out of scope (Phase 7+) |
|----------|-------------------------|
| Region-level forecasts (IL state, Cook County) | Site-level forecasting |
| Four baselines + ensemble | Neural ODE |
| 1/2/3/4-week horizons | Hospitalization overlays |
| Rolling-origin backtest evaluation | Model artifact storage |
| Forecast chart on region pages | Derivative / phase-space charts |
| Model Lab performance page | Automated model promotion gates |

**Forecast target:** `weekly_region_metrics.weighted_activity_index` — the same signal used on Illinois and Cook County dashboards.

**Entities:**

| `entity_type` | `entity_id` | Region |
|---------------|-------------|--------|
| `state` | `IL` | Illinois statewide |
| `county` | `17031` | Cook County |

---

## Architecture

```text
weekly_region_metrics (IL, Cook)
        │
        ├─► generate_forecasts.py ──► predictions
        │         ▲
        │         │ residual sigma from model_runs.metrics
        │
        └─► evaluate_forecasts.py
                  │
                  ├─► prediction_actuals (scored rows)
                  └─► model_runs.metrics (MAE, RMSE, trend accuracy)
                            │
                            ▼
              Next.js (forecasts.ts) ──► ForecastChart, /model-lab
```

**Weekly pipeline order** (after metrics build):

1. `evaluate_forecasts` — score predictions whose target weeks now have actuals
2. `generate_forecasts` — write latest-origin (and optional backfill) predictions

Evaluation runs before generation so updated residual sigma feeds the next forecast’s uncertainty bands.

---

## Database

Migration: [`packages/database/supabase/migrations/20260521120000_phase6_forecasting.sql`](../packages/database/supabase/migrations/20260521120000_phase6_forecasting.sql)

### Tables

| Table | Purpose |
|-------|---------|
| `model_runs` | One row per model definition; stores `metrics` JSON from backtests |
| `predictions` | Point forecasts + intervals keyed by `forecast_origin_week` and `horizon_weeks` |
| `prediction_actuals` | Scored predictions once actual weekly data exists |

### Seeded model runs

| `model_name` | `model_type` | Role |
|--------------|--------------|------|
| `persistence_v1` | `persistence` | Next week equals current week |
| `moving_average_v1` | `moving_average` | 4-week moving average |
| `trend_v1` | `trend` | Linear extrapolation (8-week lookback) |
| `seasonal_naive_v1` | `seasonal_naive` | Same week last year (52-week lag) |
| `ensemble_v1` | `ensemble` | Mean of the four baselines (dashboard default) |

### Integrity constraints

- `target_date = forecast_origin_week + (horizon_weeks * 7)` days
- When bounds exist: `lower_bound <= predicted_activity_index <= upper_bound`
- Unique: `(model_run_id, entity_type, entity_id, forecast_origin_week, horizon_weeks)`

### RLS

All three tables allow public read (`anon`, `authenticated`). Writes use the service role key from Python scripts or GitHub Actions.

---

## Baseline models

Implementation: [`scripts/lib/forecast_baselines.py`](../scripts/lib/forecast_baselines.py)

| Model | Formula (at origin week *t*) |
|-------|------------------------------|
| **Persistence** | ŷ(t+h) = y(t) |
| **Moving average** | ŷ(t+h) = mean(y[t−3 … t]) |
| **Trend** | Linear fit on last 8 weeks, extrapolate h weeks |
| **Seasonal naive** | ŷ(t+h) = y(t+h−52) when history exists; else persistence |
| **Ensemble** | Mean of component point forecasts |

### Uncertainty intervals

- **Method:** Residual standard deviation from rolling-origin backtests, stored in `model_runs.metrics.residual_sigma_by_horizon`
- **Band:** ±1.28σ (~80% interval) around the point forecast
- **Fallback:** σ = 0.5 per horizon when no backtest data exists yet
- **Ensemble:** Pooled σ when available; otherwise mean of component bounds

### Trend and confidence labels

**Trend** (same thresholds as weekly metrics in `weekly_compute.py`):

- `rising` if predicted change ≥ +0.25
- `falling` if predicted change ≤ −0.25
- otherwise `stable`

**Confidence** (deterministic by horizon):

| Horizon | Default confidence |
|---------|-------------------|
| 1 week | high |
| 2 weeks | medium |
| 3–4 weeks | low |

Confidence is capped downward when the interval width exceeds 1.5 activity-index units.

---

## Python pipeline

| Script | Description |
|--------|-------------|
| [`scripts/generate_forecasts.py`](../scripts/generate_forecasts.py) | CLI wrapper for forecast generation |
| [`scripts/evaluate_forecasts.py`](../scripts/evaluate_forecasts.py) | CLI wrapper for scoring and metrics update |
| [`scripts/lib/forecast_runner.py`](../scripts/lib/forecast_runner.py) | Orchestrates generation per region/model |
| [`scripts/lib/forecast_eval.py`](../scripts/lib/forecast_eval.py) | Scores unscored predictions, updates `model_runs.metrics` |
| [`scripts/lib/forecast_db.py`](../scripts/lib/forecast_db.py) | Supabase I/O, upserts, history fetch |
| [`scripts/lib/forecast_baselines.py`](../scripts/lib/forecast_baselines.py) | Pure math (no DB) |

### Commands

```bash
# Activate venv and install deps
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Apply migration (once)
supabase db push --workdir packages/database

# Initial backfill (~60 rolling origins × 2 regions × 5 models × 4 horizons)
npm run forecast:backfill

# Score historical predictions and refresh model metrics
npm run forecast:evaluate

# Latest origin only (weekly default)
npm run forecast:generate
```

Or via npm aliases in root [`package.json`](../package.json):

| Script | Equivalent |
|--------|------------|
| `npm run forecast:backfill` | `generate_forecasts.py --backfill-weeks 60` |
| `npm run forecast:evaluate` | `evaluate_forecasts.py` |
| `npm run forecast:generate` | `generate_forecasts.py` (latest origin) |

### Rolling-origin backfill

With `--backfill-weeks 60`, the generator emits forecasts for the last 60 origin weeks (not just the latest). That populates `predictions` for historical evaluation so Model Lab has MAE/RMSE by horizon immediately.

Minimum history before forecasting: 56 weeks (52 for seasonal naive + buffer).

### Evaluation metrics

After `evaluate_forecasts`, each `model_runs` row gets a `metrics` JSON blob:

```json
{
  "by_horizon": {
    "1": { "mae": 0.12, "rmse": 0.15, "trend_accuracy": 0.68, "n_evaluations": 114 },
    "2": { "mae": 0.18, "rmse": 0.22, "trend_accuracy": 0.61, "n_evaluations": 114 }
  },
  "residual_sigma_by_horizon": { "1": 0.14, "2": 0.19, "3": 0.24, "4": 0.28 },
  "total_evaluations": 456
}
```

**Trend accuracy:** fraction of scored predictions where predicted trend (rising/falling/stable) matched actual trend vs. origin week.

---

## Frontend

### Data layer

[`apps/web/src/lib/supabase/forecasts.ts`](../apps/web/src/lib/supabase/forecasts.ts)

| Function | Use |
|----------|-----|
| `getLatestRegionForecast(regionType, regionId)` | Ensemble forecast for dashboard (default) |
| `getBaselinePerformance()` | Model Lab metrics table |
| `getAllModelRuns()` | Model run cards |

### UI

| Route / component | Description |
|-------------------|-------------|
| `/illinois`, `/cook-county` | [`ForecastChart`](../apps/web/src/components/dashboard/forecast-chart.tsx) — observed line + dashed forecast + 80% band |
| `/model-lab` | Baseline metrics table, MAE-by-horizon chart, model run status |
| Header | **Model Lab** nav link |

The forecast chart keeps the historical time series separate from the forecast extension. Observed data is solid; forecast is dashed with a translucent interval band.

**Dashboard default model:** `ensemble_v1`.

---

## Weekly automation

[`scripts/run_weekly_pipeline.py`](../scripts/run_weekly_pipeline.py) runs:

```text
ingest_cdc → refresh_sites → transform_clean_observations → build_weekly_metrics
    → evaluate_forecasts → generate_forecasts → vercel_revalidate (optional)
```

GitHub Actions workflow: [`.github/workflows/weekly-data-update.yml`](../.github/workflows/weekly-data-update.yml) (Saturdays ~13:30 UTC).

No new secrets are required beyond existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

## Verification checklist

After migration and first backfill:

1. **Migration applied**
   ```bash
   supabase db push --workdir packages/database
   ```

2. **Tables populated** (example counts after initial backfill):
   - `model_runs`: 5
   - `predictions`: ~2400 (60 origins × 2 regions × 5 models × 4 horizons)
   - `prediction_actuals`: ~2300 (most historical targets with actuals)

3. **Scripts succeed**
   ```bash
   npm run forecast:backfill
   npm run forecast:evaluate
   npm run forecast:generate
   ```

4. **Dashboard**
   - `/illinois` and `/cook-county` show forecast card (not placeholder)
   - `/model-lab` shows baseline performance table

5. **Tests**
   ```bash
   .venv/bin/python -m pytest scripts/tests/test_forecast_baselines.py -q
   npm run typecheck && npm run lint && npm run test
   ```

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Could not find table 'public.model_runs'` | Migration not applied or stale PostgREST cache | Run `supabase db push`; hard-refresh browser |
| Forecast placeholder still shown | No predictions for latest origin | Run `npm run forecast:generate` |
| Model Lab empty metrics | No backfill/evaluate yet | Run `forecast:backfill` then `forecast:evaluate` |
| `evaluate_forecasts` fails on large ID lookup | PostgREST URL limit | Chunk size reduced in `forecast_db.py` (150 IDs per request) |

---

## File inventory (Phase 6)

### Database

- `packages/database/supabase/migrations/20260521120000_phase6_forecasting.sql`

### Python

- `scripts/generate_forecasts.py`
- `scripts/evaluate_forecasts.py`
- `scripts/lib/forecast_baselines.py`
- `scripts/lib/forecast_db.py`
- `scripts/lib/forecast_eval.py`
- `scripts/lib/forecast_runner.py`
- `scripts/tests/test_forecast_baselines.py`

### Frontend

- `apps/web/src/lib/supabase/forecasts.ts`
- `apps/web/src/lib/dashboard/types.ts` (forecast types)
- `apps/web/src/components/dashboard/forecast-chart.tsx`
- `apps/web/src/components/model-lab/*`
- `apps/web/src/app/model-lab/page.tsx`

### Modified

- `scripts/run_weekly_pipeline.py` — evaluate + generate steps
- `apps/web/src/components/dashboard/region-dashboard.tsx` — ForecastChart
- `apps/web/src/components/layout/header.tsx` — Model Lab link
- `package.json` — `forecast:*` scripts
- `requirements.txt` — pytest

---

## Design principles

1. **Separate observation from forecast** — Charts distinguish observed activity, point forecast, and uncertainty band.
2. **Honest baselines first** — Neural ODE (Phase 7) must beat persistence, moving average, trend, and seasonal naive on held-out weeks.
3. **Rolling-origin evaluation** — Backtests use historical origin weeks, not random splits.
4. **Region-first** — IL and Cook County only; site-level forecasting deferred.
5. **Idempotent pipeline** — Upserts on `(model_run_id, entity_type, entity_id, forecast_origin_week, horizon_weeks)`.

---

## What's next (Phase 7)

Phase 7 adds a Neural ODE model trained on weekly region activity, saves artifacts to Supabase Storage, writes predictions to the same `predictions` table, and compares performance against these baselines in Model Lab.

See [pandemic-flow-architecture-plan.md](pandemic-flow-architecture-plan.md) § Phase 7.

---

## Related documentation

| Document | Topic |
|----------|--------|
| [DATA.md](DATA.md) | Full schema, RLS, query patterns |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Migration, env vars, CI |
| [pandemic-flow-architecture-plan.md](pandemic-flow-architecture-plan.md) | Full phase roadmap |
| [HighLevelArchitecture.md](HighLevelArchitecture.md) | Product vision and modeling ladder |
