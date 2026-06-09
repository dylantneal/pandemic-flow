# How the Neural ODE Works

A plain-language guide to COVID Flow’s learned-dynamics model: what it predicts, how it is built, and how to read it on the dashboard.

For operator commands and promotion gates, see [PHASE7.md](PHASE7.md). For schema, pipeline wiring, and implementation checklist, see [PHASE7_DESIGN.md](PHASE7_DESIGN.md).

---

## What this model is (and is not)

**It predicts:** the weekly **wastewater activity index** for a region (Illinois or Cook County). That index is a normalized measure of SARS-CoV-2 RNA in community wastewater — a surveillance signal, not a clinical count.

**It does not predict:** confirmed COVID cases, hospitalizations, deaths, or site-level measurements.

**Product role:** the **ensemble baseline** (average of simple statistical forecasts) is the trusted production forecast on region dashboards. The Neural ODE is a **research track** — a constrained experiment in learned dynamics that may selectively improve short-horizon forecasts. The canonical frozen research candidate is **`1.7.5-shrinkage-conservative`**.

---

## One-sentence summary

The Neural ODE learns a smooth “velocity field” for how wastewater activity tends to change over time, but is only allowed to **nudge** a strong baseline forecast — and only on horizons where validation shows the nudge helps.

---

## The big idea

Classical epidemiology often writes dynamics as a differential equation:

```
dx/dt = f(t, x)
```

where `x` is activity level and `f` describes how fast it is changing.

A **Neural ODE** replaces the hand-written `f` with a small neural network. Starting from this week’s activity, the model **integrates** that learned law forward to predict next week, the week after, and so on.

COVID Flow goes one step further. The integrated trajectory is **not** the final forecast. Instead:

```
final forecast = baseline anchor + gate × bounded correction
```

| Term | Meaning |
|------|---------|
| **Baseline anchor** | What simple rules already predict (persistence at 1 week, ensemble at 2–4 weeks) |
| **Correction** | What the Neural ODE learned to add or subtract |
| **Gate** | A per-horizon knob in `[0, 1]` that can shrink the correction toward zero (“abstain”) |
| **Bounded** | Hard caps on how large a correction can be at each horizon |

This design keeps the model honest on noisy weekly wastewater data. Early free-form Neural ODE runs could hallucinate large swings; v1.7.5 mostly stays near the ensemble and only opens corrections when they help on validation.

---

## End-to-end flow

```text
CDC NWSS wastewater samples
        │
        ▼
weekly_region_metrics          ← weighted_activity_index per region/week
        │
        ├─► Phase 6 baselines    ← persistence, MA, trend, seasonal, ensemble
        │
        └─► Neural ODE (Phase 7)
                  │
                  ├─ train: fit small MLP + gates on rolling origins
                  │         └─► checkpoint → Supabase Storage (model-artifacts)
                  │
                  └─ infer: integrate from each origin week
                            ├─► predictions           (weekly point + uncertainty band)
                            └─► prediction_derivatives (sub-week dx/dt samples)
                                      │
                                      ▼
                            Dashboard / Model Lab
```

**Weekly pipeline order:** ingest → clean → weekly metrics → evaluate baselines → generate baseline forecasts → infer Neural ODE (production runs only; candidates are manual).

---

## Step 1: Input data

Each region gets its own model (`neural_ode_IL`, `neural_ode_17031`). Training reads the same weekly series as Phase 6 baselines:

- **Target:** `weighted_activity_index`
- **Origin context (optional):** data quality score, active site count, population represented, week-over-week change
- **Calendar hints:** sin/cos of week-of-year (seasonality)

Values are **standardized** using train-set mean and standard deviation so the network sees stable numbers.

### Chronological splits

| Split | Typical size | Purpose |
|-------|--------------|---------|
| Train | Early history | Fit weights |
| Validation | ~12 weeks | Early stopping, gate tuning |
| Holdout | ~16 weeks | Honest evaluation and promotion checks |

Forecasting uses **rolling origins**: for many past weeks, pretend that week is “today,” predict 1–4 weeks ahead, and score against what actually happened. This matches how Phase 6 evaluates baselines.

---

## Step 2: The neural network (the law of motion)

Implementation: `scripts/lib/neural_ode/model.py` — class `ODEFunc`.

The network is intentionally small (2 hidden layers, 12 units in reliability mode, `tanh` activations). At each integration step it receives:

1. Current standardized activity `x`
2. Time `t` (weeks forward from the forecast origin)
3. Optional calendar features (sin/cos of week-of-year)
4. Optional origin covariates frozen at forecast week (quality, sites, population, WoW change)

It outputs **dx/dt** — the instantaneous rate of change.

### Integration

The `NeuralODE` class integrates with `torchdiffeq.odeint` using **RK4** and a fixed step size of **1/7 week** (~one day per substep):

```python
# model.py — simplified
odeint(self.func, state0, t_eval, method="rk4", options={"step_size": 1/7})
```

So the model learns: *given where activity is now and what week it is, how fast is it changing?* — then rolls that forward in time.

---

## Step 3: Baseline anchor (the safety rail)

Before applying any neural correction, the system builds a **baseline anchor path** from Phase 6 forecasts (`build_baseline_anchor_series` in `dataset.py`):

| Horizon | Anchor source |
|---------|---------------|
| 1 week | **Persistence** — next week ≈ this week |
| 2–4 weeks | **Ensemble** — average of persistence, moving average, trend, and seasonal naive |

The Neural ODE never starts from a blank slate. It only learns **adjustments** relative to forecasts the product already trusts.

---

## Step 4: Shrinkage gates and hard bounds (v1.7.5)

The canonical profile **`shrinkage_correction_v2`** (version `1.7.5-shrinkage-conservative`) adds two safety mechanisms on top of the anchor.

### Per-horizon gates

Four learnable logits pass through sigmoid to produce gates `g₁…g₄ ∈ [0, 1]`:

```
output = anchor + g_h × bounded_correction
```

- Gate **0** → forecast equals the anchor exactly (full abstention)
- Gate **1** → forecast uses the full bounded correction

v1.7.5 initializes gates **biased toward closed** (logits −3, −2, −1, −0.5). Training adds an **abstention penalty** that discourages opening gates unless validation loss improves. Penalties are strongest at **h1** (protect the one-week forecast).

Holdout inference typically shows gates near **0.03 at h2** and **~0.10 at h4** — the model mostly abstains unless it has evidence a correction helps.

### Hard correction caps

Even when a gate is open, correction magnitude is capped per horizon (activity-index units, before standardization):

| Horizon | Max correction |
|---------|----------------|
| h1 (1 week) | 0.25 |
| h2 (2 weeks) | 0.35 |
| h3 (3 weeks) | 0.50 |
| h4 (4 weeks) | 0.65 |

Caps are enforced with a `tanh` bound in standardized space so corrections cannot explode on sparse weekly data.

---

## Step 5: Training

Training loops over many forecast origins in the train slice. For each origin week:

1. Set `x₀` = standardized activity at that week
2. Integrate the ODE to times `t = 1, 2, 3, 4` weeks
3. Apply anchor + gates + bounds (`apply_baseline_anchor`)
4. Compare to **actual** future weeks
5. Backpropagate loss and update weights

### Loss components

| Component | Role |
|-----------|------|
| **Weighted Huber loss** | Robust level error at each horizon (δ = 1.0 on standardized target) |
| **Gate abstention penalty** | Penalize open gates so corrections must earn their place |
| **Trend loss (weak)** | Encourage correct direction at h1 |
| **Turn-point upweighting** | Weight origins near regime changes more heavily |
| **Correction cap regularization** | Soft pressure to stay inside caps during training |

Training runs **per region** with early stopping on validation. Best checkpoint, metrics, and reproducibility metadata are stored in Supabase as a **`candidate`** run (`status ≠ production` until manual promotion).

Default training profile for new work: **`reliability_correction_v1`**. The frozen research reference uses **`shrinkage_correction_v2`**.

---

## Step 6: Inference and uncertainty

Implementation: `scripts/lib/neural_ode/inference.py` — `forecast_at_origin`.

For each origin week:

1. Read current activity and standardize to `x₀`
2. Set origin context (week index, optional covariates)
3. Integrate on a fine daily grid (7 substeps × 4 horizons = 28 derivative samples)
4. At each weekly horizon, compute:
   - **Point forecast** = anchor + gated bounded correction → unstandardize to activity index
   - **Uncertainty band** = point ± `k × σ`, where `σ` comes from **rolling holdout residual statistics** (calibrated for ~80% nominal coverage)
5. Write rows to `predictions` and `prediction_derivatives`

### Derivatives (rate of change)

The derivative chart shows **dx/dt** along the Neural ODE path — how fast the model thinks activity is moving at each sub-week step. Values can look “steppy” because:

- Data arrives weekly, but integration runs daily
- Weekly anchoring and gates can snap corrections toward zero at horizon boundaries

Derivatives are a **research visualization**, not a clinical growth rate.

---

## What the research found (v1.7.5)

The Neural ODE is **no longer broken**, but it is **not a production replacement** for the ensemble. That is a useful Phase 7 outcome.

| Area | Result |
|------|--------|
| **H1** | Protected by tight caps; competitive with persistence |
| **Gates** | h2/h4 mostly abstain instead of hallucinating dynamics |
| **Intervals** | ~79% empirical coverage on 80% nominal bands |
| **vs ensemble** | Improves on many origins, especially **h2** |

**Why promotion still fails:** only **4-week MAE** narrowly misses the ensemble slack on holdout (~0.77 vs allowed ~0.75 for Illinois). Simple ensemble baselines remain hard to beat at four weeks on this dataset.

`1.7.5-shrinkage-conservative` is **frozen** as the canonical research reference — promotion logic refuses to promote it by design.

---

## Reading the dashboard

| View | What you see |
|------|--------------|
| **Default region dashboard** | Ensemble forecast only (production) |
| **Compare models (advanced)** | Ensemble + Neural ODE research candidate overlaid |
| **Learned dynamics** | Neural ODE only; observed history clipped at the forecast origin so the line connects cleanly |
| **Rate of change** | Sub-week dx/dt from `prediction_derivatives` |
| **Model Lab → Neural ODE** | Holdout metrics, gates, interval coverage, regime breakdown vs ensemble |

### Compare-mode quirks worth knowing

- The **ensemble** forecast usually uses the **latest** data week as its origin.
- The **Neural ODE research candidate** may use an **older** origin if inference has not been refreshed recently.
- When those origins differ, the chart shows two forks: full observed history plus each model’s path from its own starting week. A sharp visual turn is often **real signal** (e.g. a large WoW drop followed by an ensemble rebound), not a rendering bug.

When a production Neural ODE run exists, the weekly pipeline refreshes inference automatically. Research candidates require manual `npm run infer:neural-ode -- --allow-candidate`.

---

## How this differs from textbook Neural ODEs

| Textbook Neural ODE | COVID Flow v1.7.5 |
|--------------------|-------------------|
| Predict full trajectory freely | Predict **residual vs baseline** |
| One loss on levels | Gates + caps + abstention penalties |
| Often smooth continuous paths | Weekly surveillance + daily integration → steppy derivatives |
| Assumed production-ready | Explicitly **research candidate**; ensemble-first product |

---

## Code map

| File | Responsibility |
|------|----------------|
| `scripts/lib/neural_ode/model.py` | `ODEFunc`, `NeuralODE`, gates, integration |
| `scripts/lib/neural_ode/dataset.py` | Splits, standardization, baseline anchor, `apply_baseline_anchor` |
| `scripts/lib/neural_ode/training.py` | Training loop, holdout evaluation, loss assembly |
| `scripts/lib/neural_ode/inference.py` | Rolling-origin forecasts and derivative samples |
| `scripts/lib/neural_ode/train_runner.py` | CLI, optimization profiles, artifact upload |
| `scripts/lib/neural_ode/versions.py` | Frozen version labels (`1.7.5-shrinkage-conservative`) |
| `scripts/train_neural_ode.py` | Train entrypoint |
| `scripts/infer_neural_ode.py` | Inference entrypoint |
| `apps/web/src/lib/supabase/forecasts.ts` | Dashboard forecast bundle (ensemble + research overlay) |
| `apps/web/src/components/dashboard/forecast-chart.tsx` | Forecast visualization |
| `apps/web/src/components/dashboard/derivative-chart.tsx` | Rate-of-change visualization |

---

## Related documentation

- [PHASE6.md](PHASE6.md) — baseline and ensemble forecasts the Neural ODE builds on
- [PHASE7.md](PHASE7.md) — operator commands, promotion gates, research conclusion
- [PHASE7_DESIGN.md](PHASE7_DESIGN.md) — schema, pipeline, locked implementation decisions
- [DATA.md](DATA.md) — `predictions`, `prediction_derivatives`, `model_runs` tables
- [DEPLOYMENT.md](DEPLOYMENT.md) — training, inference, and weekly pipeline on Vercel/GitHub Actions
