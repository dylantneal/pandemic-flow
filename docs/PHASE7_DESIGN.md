# Phase 7: Neural ODE — Technical Design

**Status:** Approved for implementation (Step 2 complete: deps + migration + bucket).

Phase 7 adds a vanilla Neural ODE on weekly region activity. The goal is **scientific honesty and infrastructure quality**, not vanity metric gains on ~470 weekly observations. Neural ODE must beat baselines on held-out rolling-origin evaluation before promotion to production dashboards.

For a plain-language model walkthrough see [NEURAL_ODE_EXPLAINED.md](NEURAL_ODE_EXPLAINED.md). For Phase 6 baselines see [PHASE6.md](PHASE6.md). For schema see [DATA.md](DATA.md). For deployment see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 0. Locked decisions

| # | Decision | Value |
|---|----------|-------|
| 1 | Model | Vanilla Neural ODE, 1-D `weighted_activity_index` |
| 2 | Covariates | Off in v1; behind `--with-covariates` ablation flag |
| 3 | Regions | Separate per-region models (IL, Cook); pooled deferred to Phase 8 |
| 4 | Solver | `rk4` fixed step, `step_size = 1/7` (~1 day per step) |
| 5 | Loss | Huber (δ=1.0) on standardized target |
| 6 | Training | Manual / monthly; **not** weekly retrain |
| 7 | Evaluation | Rolling-origin via existing Phase 6 `evaluate_forecasts` |
| 8 | Reproducibility | 6-point contract (§7) — all required |
| 9 | Derivatives | Table `prediction_derivatives` (§3) |
| 10 | Promotion | Numeric gate (§10); manual status flip |

---

## 1. Scope and non-goals

### In scope (v1)

- Train / infer vanilla NODE per region
- Save checkpoint to Supabase Storage (`model-artifacts`)
- Write `predictions` + `prediction_derivatives`
- Model Lab comparison (automatic via `model_runs.metrics`)
- Derivative chart + Neural ODE explainer page (Step 10+)
- Optional overlay on forecast chart

### Non-goals (Phase 8+)

- Pooled multi-region model
- Site-level Neural ODE
- Latent ODE / VAE
- Automated hyperparameter search or promotion
- Weekly fine-tuning
- Bayesian uncertainty (use residual sigma like Phase 6)

---

## 2. Architecture

```text
weekly_region_metrics
        │
        ├─► train_neural_ode.py (monthly, manual)
        │         ├─► model-artifacts Storage
        │         └─► model_runs (status=candidate)
        │
        └─► infer_neural_ode.py (weekly, after evaluate_forecasts)
                  ├─► predictions
                  └─► prediction_derivatives
                            │
                            ▼
              evaluate_forecasts.py (unchanged)
                            │
                            ▼
              Next.js: ForecastChart, DerivativeChart, /model-lab/neural-ode
```

**Weekly pipeline order** (after Phase 7 inference wired):

```text
… → build_weekly_metrics → evaluate_forecasts → generate_forecasts
  → infer_neural_ode → vercel_revalidate
```

`infer_neural_ode` is a no-op when no production Neural ODE `model_runs` row exists.

---

## 3. Database (Step 2)

Migration: [`packages/database/supabase/migrations/20260521130000_phase7_neural_ode.sql`](../packages/database/supabase/migrations/20260521130000_phase7_neural_ode.sql)

### `prediction_derivatives`

| Column | Type | Notes |
|--------|------|-------|
| `prediction_id` | uuid FK | Parent `predictions` row |
| `step_idx` | int | **Local** index 0..6 within this prediction’s segment |
| `t_offset_days` | numeric | **Absolute** days from `forecast_origin_week` |
| `predicted_value` | numeric | De-standardized activity index |
| `predicted_derivative` | numeric | dx/dt (activity-index per week) |

**PK:** `(prediction_id, step_idx)`

### `step_idx` convention (locked)

Each `predictions` row (one horizon) owns **7** derivative rows. `step_idx` is **per-prediction local** (0..6), not a global 0..28 index across the full forecast path.

| `horizon_weeks` | `step_idx` | `t_offset_days` (absolute) |
|-----------------|------------|----------------------------|
| 1 | 0..6 | 1..7 |
| 2 | 0..6 | 8..14 |
| 3 | 0..6 | 15..21 |
| 4 | 0..6 | 22..28 |

- **Day 0** (origin week) is **not** stored here; UI uses observed `weekly_region_metrics`.
- **UI stitching:** fetch all derivatives for `(model_run_id, entity_type, entity_id, forecast_origin_week)` and **order by `t_offset_days`** for one continuous curve.
- **Row counts:** 28 per (origin × region × model); ~3360 for 60-week backfill × 2 regions.

### Numeric precision policy (locked)

- Columns use unconstrained PostgreSQL `numeric` (same as Phase 6 `predictions`).
- **Application contract:** round to **4 decimal places** before insert (see `forecast_baselines._make_forecast_point`).
- Migration documents this via `comment on column`; no `numeric(p,s)` in DDL to avoid drift from existing forecast tables.

### Storage bucket `model-artifacts`

| Property | Value |
|----------|-------|
| Public | `false` |
| Limit | 100 MB per object |
| MIME | `application/octet-stream`, `application/json` |

Layout:

```text
model-artifacts/
  neural_ode/
    state_IL/v1.0.0/checkpoint.pt
    county_17031/v1.0.0/checkpoint.pt
```

Stored in `model_runs.artifact_path`.

### Unchanged from Phase 6

- `model_runs` already allows `model_type = 'neural_ode'`
- `predictions` / `prediction_actuals` unchanged

---

## 4. Python dependencies

```text
torch==2.4.1
torchdiffeq==0.2.5
numpy>=1.26,<2.3
```

**CPU install** (avoid CUDA wheels):

```bash
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

Supported Python: **3.10–3.12**.

---

## 5. File layout (Steps 3+)

```text
scripts/
  train_neural_ode.py
  infer_neural_ode.py
  promote_model.py
  lib/neural_ode/
    model.py
    dataset.py
    training.py
    inference.py
    artifacts.py
    reproducibility.py
  tests/
    test_neural_ode_model.py
    test_neural_ode_dataset.py
    test_neural_ode_reproducibility.py
```

---

## 6. Model (vanilla NODE)

- State: 1-D standardized `weighted_activity_index`
- `ODEFunc`: MLP `f(t, x) → dx/dt`, `Tanh`, Xavier init
- Integration: `torchdiffeq.odeint`, solver `rk4`, `step_size=1/7`
- Default hyperparameters: `hidden_dim=32`, `depth=2`, `lr=1e-3`, `window_weeks=8`, `epochs=800` (early stop patience 50)

---

## 7. Reproducibility contract (required)

| # | Requirement |
|---|-------------|
| 1 | `seed_everything` (Python, NumPy, PyTorch) |
| 2 | `torch.use_deterministic_algorithms(True)` |
| 3 | Pinned `torch` / `torchdiffeq` in requirements |
| 4 | `hyperparameters.data_hash` = SHA256 of training slice |
| 5 | `model_runs.git_commit` populated |
| 6 | Train-twice test: metrics identical within 1e-6 |

---

## 8. Inference

For each rolling origin:

1. Standardize `x0` from origin observation (mean/std from training slice only).
2. Integrate to weekly horizons → `predictions` rows (reuse `forecast_point_to_row`).
3. For each horizon prediction, sample 7 daily steps → `prediction_derivatives` with local `step_idx` 0..6 and absolute `t_offset_days`.
4. Intervals from `model_runs.metrics.residual_sigma_by_horizon` (same as baselines).

---

## 9. Training procedure

- Holdout: last **16** weeks
- Validation: prior **12** weeks (early stopping)
- Remainder: train
- Status after train: `candidate` (never auto-promote)

---

## 10. Promotion gate (numeric, per region, holdout)

Evaluated on the **same 16-week holdout origin slice** for candidate and baselines (`compute_model_run_region_metrics` + `holdout_origin_weeks_for_region`).

### Production safety (blocks `status=production`)

| Metric | Threshold |
|--------|-----------|
| 1w MAE | ≤ persistence 1w MAE |
| 2w MAE | ≤ ensemble 2w MAE |
| 4w MAE | ≤ ensemble 4w MAE × 1.05 |
| 1w trend accuracy | ≥ persistence 1w trend − 5 pp |
| RMSE | Not > 20% above ensemble at any horizon |
| Interval coverage | Empirical 80% band in 55–98% |
| Regime MAE | No severe degradation vs ensemble |
| Reproducibility | seed, data hash, artifact, git commit |

**Production status** (stored in `metrics.promotion.production_status`):

| Status | Meaning |
|--------|---------|
| `pass` | All production checks pass |
| `near_miss` | Only 4w MAE fails, excess ≤ 8% above ensemble×1.05 — safe but insufficient long-horizon lift |
| `fail` | Any other production failure (legacy unsafe / broad underperformance) |

### Research value (informational; does not block promotion)

| Check | Threshold |
|-------|-----------|
| `improvement_vs_ensemble` overall | ≥ 33% origins improved, mean delta ≥ 0 |
| `improvement_h2` | ≥ 35% origins improved at 2w |
| `improvement_h4` | ≥ 30% origins improved at 4w |
| `correction_gates_conservative` | h2 ≤ 0.35, h4 ≤ 0.45 |

**Research status** (informational):

| Status | Meaning |
|--------|---------|
| `pass` | All research checks pass |
| `h4_abstention` | Only h4 improvement fails; conservative gates pass (intentional abstention) |
| `fail` | Broader research underperformance |

Manual: `promote_model.py` flips `status` to `production` only when `production_status=pass`.

---

## 11. Frontend (Steps 10+)

| Piece | Purpose |
|-------|---------|
| `DerivativeChart` | dx/dt from `prediction_derivatives`, ordered by `t_offset_days` |
| `ModelSelector` | Ensemble / Neural ODE / both |
| `/model-lab/neural-ode` | Explainer + training curves |

---

## 12. Implementation task order

| Step | Status |
|------|--------|
| 1 Design sign-off | Done |
| 2 Deps + migration + bucket | Done |
| 3 model + dataset + reproducibility tests | Done |
| 4 training + artifacts + train CLI | **Done** |
| 5 infer + backfill + weekly pipeline hook | **Done** |
| 6 promotion gate + promote_model.py | **Done** |
| 7 frontend derivative + selector + explainer | **Done** |
| 9 `docs/PHASE7.md` user guide | **Done** |
| 8 Gate-first training optimization (v1.6 trend-class pooled) | **Done** |

### Gate-first optimization (implemented, legacy)

- Holdout: `trend_accuracy` (1w), `residual_sigma_by_horizon`
- Training: horizon-weighted loss, `val_gate_score` early stopping, shuffled origins, cosine LR
- Multi-seed CLI (`--seeds 42,43,44`), best by `val_gate_score`
- Model profile (v1.6–v1.7): augmented latent state (`state_dim=2`), log-target transform, baseline-anchor head
- Training topology: pooled multi-region shared model with region one-hot conditioning
- Baseline-anchor contract: 1w anchor = persistence, 2-4w anchor = ensemble, ODE learns correction on top
- Trend objective: gate-consistent 3-class trend loss (falling/stable/rising via same thresholds as promotion)
- Correction-cap regularization: soft cap on short-horizon anchor correction magnitude
- Validation gate score includes a 1w trend-miss penalty term for early stopping alignment
- Covariates (optional, default off): calendar + `quality_score`, `active_site_count`, `population_represented`, `week_over_week_change` from `weekly_region_metrics`
- Loop script: `scripts/run_neural_ode_gate_loop.py` → `npm run train:neural-ode:gate`

**Finding:** stored candidates through v1.6.0 underperform persistence and ensemble on holdout MAE/trend metrics. Gate-first complexity did not yield production-quality gains.

### Shrinkage / conservative abstention (v1.7.4–v1.7.5)

- Profiles: `shrinkage_correction_v1`, `shrinkage_correction_v2` (conservative gate init and penalties)
- Anchor contract: `prediction = anchor + gate × bounded_correction` with learnable per-horizon gates
- **Canonical research candidate (frozen):** `1.7.5-shrinkage-conservative` (`shrinkage_correction_v2`) — do not change promotion logic or re-tune against the holdout slice; use as the reference story for Model Lab and docs.
  - First candidate with correct end-to-end behavior: safe h1 (hard-bound), near-abstention h2/h4 gates, recalibrated intervals (~79% coverage on rolling evaluate)
  - **Production status: near miss** — only `4w_mae_vs_ensemble` fails on the holdout slice (IL ~3.6% above slack; Cook ~2.4%). All other production safety checks pass.
  - **Research status: `h4_abstention`** on holdout slice — overall/h2 improvement and conservative gates pass; h4 improvement fails as expected when the h4 gate abstains (wired in `compute_model_run_region_metrics` for promotion parity)
- Promotion report persists `metrics.promotion` (`production_status`, `research_passed`, …) when running `promote_model.py --check-only`
- **Narrow follow-up experiment:** `1.7.6-shrinkage-h4-abstain` (`shrinkage_correction_h4_abstain`) — h1–h3 identical to v2; h4 init `-2.5` (was `-0.5`); h4-only gate penalty `4.5`. Compare with `scripts/compare_shrinkage_h4_abstain.py`. Success = `production_status=pass` without h1/h2 regression or coverage loss vs 1.7.5; else conclude h4 should remain ensemble-like.

### Research conclusion (frozen at v1.7.5)

Phase 7 succeeded as a **research phase**, not as a production model swap:

1. **Not broken** — v1.7.5 is safe and interpretable: protected h1, working abstention gates, ~79% interval coverage.
2. **Not a production replacement** — 4w MAE narrowly exceeds ensemble×1.05 on holdout (IL 0.773 vs 0.746; Cook 0.739 vs 0.722).
3. **Scientifically useful** — selective corrections beat ensemble often at h2; the model learns when to stay quiet.
4. **Product framing** — Neural ODE is a **constrained dynamics experiment** on noisy wastewater surveillance; the **ensemble stays production**.

Do not re-tune promotion gates or the holdout slice to chase 4w MAE. Document and compare; optional 1.7.6 only tests whether stronger h4 abstention can clear the narrow 4w gap without harming h1/h2.

### Reliability-first optimization (recommended default)

- Profile: `reliability_correction_v1` (default in `train_neural_ode.py`)
- Per-region training by default (`state_dim=1`, `hidden_dim=12`)
- Tighter correction caps at short horizons
- Evaluation extended with `by_regime`, `by_quality_segment`, `interval_coverage` in `model_runs.metrics`
- Promotion gate extended with interval coverage sanity and regime degradation checks
- UI: Model Lab research banner, calibration/regime tables, explicit wastewater-not-cases copy
- Production dashboards remain ensemble-first; Neural ODE is candidate-only until manual promotion

---

## Related documentation

| Document | Topic |
|----------|--------|
| [PHASE6.md](PHASE6.md) | Baselines and evaluation contract |
| [DATA.md](DATA.md) | Full schema |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Migration and env setup |
| [pandemic-flow-architecture-plan.md](pandemic-flow-architecture-plan.md) | Roadmap |
