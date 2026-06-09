# Phase 7 — Neural ODE

Learned-dynamics forecasts on top of Phase 6 baselines.

- **How the model works (plain language):** [NEURAL_ODE_EXPLAINED.md](NEURAL_ODE_EXPLAINED.md)
- **Design detail (schema, pipeline, decisions):** [PHASE7_DESIGN.md](PHASE7_DESIGN.md)

## Research framing

Phase 7 asks: **can learned dynamics improve on strong simple baselines for wastewater activity under noisy weekly surveillance?**

Important clarifications:

- Models predict a **wastewater activity index**, not confirmed COVID case counts.
- The **ensemble baseline remains the trusted production forecast** on region dashboards.
- Neural ODE is a **research/candidate track** until it passes promotion gates on held-out weeks.
- Older candidates through **v1.6.0** do **not** beat persistence/ensemble on core holdout metrics — a useful negative result.
- **Canonical research candidate (frozen):** `1.7.5-shrinkage-conservative` — see [Research conclusion](#research-conclusion-v175-frozen) below.

## Research conclusion (v1.7.5, frozen)

The Neural ODE is **no longer broken**, but it is **not a production replacement** for the ensemble. That is a good research outcome for Phase 7.

**What v1.7.5 established**

| Area | Result |
|------|--------|
| **H1** | Protected (hard-bound); competitive with persistence |
| **Gates** | h2/h4 mostly abstain instead of hallucinating dynamics |
| **Intervals** | ~79% empirical coverage on 80% nominal bands (calibrated) |
| **vs ensemble** | Improves on many origins — especially **h2** (IL ~59–79% improved by slice; Cook ~71%) |

**Why production promotion still fails**

Only **4-week MAE** misses the ensemble slack on the holdout slice:

| Region | Candidate 4w MAE | Allowed (ensemble × 1.05) |
|--------|------------------|----------------------------|
| Illinois | 0.773 | 0.746 |
| Cook (17031) | 0.739 | 0.722 |

**Conclusion in plain language**

The model can sometimes help, knows when to mostly stay quiet, and produces calibrated uncertainty. At four weeks, simple ensemble baselines are still hard to beat.

**How to frame the project**

- Neural ODE = **selective learned correction layer** under noisy weekly wastewater data, not a wholesale forecasting model.
- Short/medium-horizon signal (especially h1/h2) is scientifically interesting; reliable 4-week dynamics are not enough to replace or modify the production ensemble forecast.
- Phase 7 = experiment in **constrained dynamics learning**, not a failed bet on replacing baselines.

Promotion gates and this narrative are **frozen** at v1.7.5. `promote_model.py` **refuses** to promote `1.7.5-shrinkage-conservative` (frozen research reference). Optional `1.7.6-shrinkage-h4-abstain` is a one-shot h4 experiment only; if it fails, stop forcing h4.

**Product framing:** ensemble-first dashboards; Neural ODE = learned dynamics **research layer** in Model Lab; future work emphasizes h1/h2 correction and richer data, not aggressive 4-week tuning.

## What users see

| Surface | Content |
|---------|---------|
| **Illinois / Cook dashboards** | Forecast model selector (**ensemble default**). Neural ODE and compare modes appear only after manual promotion to production. |
| **Model Lab → Neural ODE** | Research banner, explainer, candidate run cards, holdout vs baseline table, interval coverage, regime breakdown, operator workflow. |

Neural ODE dashboard views appear only after a **production** run exists for that region (`neural_ode_IL`, `neural_ode_17031`).

## Operator commands

```bash
# Train reliability-first candidate (recommended default profile)
npm run train:neural-ode

# Explicit reliability profile (per-region, constrained baseline correction)
python scripts/train_neural_ode.py --profile reliability_correction_v1 --version 1.8.0-reliability

# Full optimization loop: train → infer candidate version → evaluate → promotion check
npm run train:neural-ode:gate

# Legacy gate-first pooled profile (ablation / comparison only)
python scripts/train_neural_ode.py --profile gate_first_v8_balanced_turnpoint_pooled --version 1.7.0

# Check promotion gate (region-scoped + holdout parity)
npm run promote:neural-ode:check -- --all-candidates

# Promote to production (only when gate passes)
npm run promote:neural-ode -- --entity-type state --entity-id IL --version 1.8.0-reliability

# Rolling inference (weekly pipeline includes this; no-op without production model)
npm run infer:neural-ode
```

Weekly pipeline order: evaluate baselines → generate baseline forecasts → infer Neural ODE (production only).

## Reliability-first training (recommended)

Default profile: **`reliability_correction_v1`**

| Property | Value |
|----------|--------|
| Topology | Per-region (pooled disabled by default) |
| State | 1-D observed activity with baseline-anchored correction head |
| Hidden size | 12 (smaller than gate-first profiles) |
| Correction caps | Tight at 1w/2w (`0.25` / `0.35` activity-index units) |
| Goal | Learn small corrections around persistence/ensemble, not free-form dynamics |

Legacy pooled gate-first profiles remain available for ablation via `--profile gate_first_v8_balanced_turnpoint_pooled`.

## Evaluation metrics (rolling origin + holdout)

`evaluate_forecasts` and `model_runs.metrics` now include:

| Metric block | Meaning |
|--------------|---------|
| `by_horizon` | MAE, RMSE, trend accuracy at 1–4 weeks |
| `by_regime` | Error on rising / falling / stable / turn-point origin weeks |
| `by_quality_segment` | Error on high vs low quality origin weeks |
| `interval_coverage` | Empirical coverage of nominal 80% forecast bands |
| `improvement_vs_ensemble` | Per-origin MAE vs ensemble (Neural ODE) |
| `correction_gates_by_horizon` | Learned shrinkage gates at inference (Neural ODE) |
| `promotion` | Last `promote_model.py --check-only` snapshot (`production_status`, tiers) |

Re-run `npm run forecast:evaluate` after new predictions arrive to refresh these blocks. Run `npm run promote:neural-ode:check` after infer to refresh holdout-scoped promotion fields.

## Promotion gate (summary)

A candidate must pass **all** of:

| Check | Rule |
|-------|------|
| 1w MAE | ≤ persistence |
| 2w MAE | ≤ ensemble |
| 4w MAE | ≤ ensemble × 1.05 |
| 1w trend accuracy | ≥ persistence − 5 pp |
| RMSE (each horizon) | ≤ ensemble × 1.20 |
| Interval coverage | Empirical 80% band coverage in 55–98% range |
| Regime MAE | No severe degradation vs ensemble in rising/falling/stable/turn-point buckets |
| Reproducibility | seed, data hash, artifact path, git commit present |

Promotion is manual via `promote_model.py`. Production promotion requires `production_status=pass`. **v1.7.5-shrinkage-conservative** is a **near miss** (safe, research-positive, 4w MAE slightly high). Legacy v1.6 candidates remain **fail** (unsafe / broad underperformance).

```bash
# Canonical conservative candidate (frozen reference — promotion logic stable)
python scripts/run_neural_ode_gate_loop.py --version 1.7.5-shrinkage-conservative --profile shrinkage_correction_v2
npm run promote:neural-ode:check -- --version 1.7.5-shrinkage-conservative --entity-type state --entity-id IL

# Narrow h4-abstention experiment (optional; compare only 4w MAE, h4 gate/improvement, h1/h2 stability)
npm run train:neural-ode:h4-abstain
npm run compare:neural-ode:h4-abstain
```

**Phase narrative (frozen):** early Neural ODE → unsafe free correction; reliability profile → safe h1 + calibrated intervals; shrinkage → learned abstention; **1.7.5** → safe, interpretable, research-positive, **not** an ensemble replacement (4w near-miss only).

## Derivatives on the dashboard

Each weekly inference writes 28 `prediction_derivatives` rows per origin (7 daily steps × 4 horizons). The UI orders by `t_offset_days` (1–28 from origin). Values are unconstrained in the database; the app displays four decimal places.

## Out of scope (Phase 7)

- Direct COVID case-count prediction (requires clinical targets + lag modeling)
- Automated promotion
- Weekly fine-tuning / retraining in the production pipeline
