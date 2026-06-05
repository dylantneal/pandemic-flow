# Deployment

## Vercel

**Production:** https://web-five-sandy-7ewgvhnvpx.vercel.app  
**GitHub:** https://github.com/dylantneal/pandemic-flow

The project is linked to Vercel with Git push deploys. Root deployment uses the repository root with [`vercel.json`](../vercel.json) (builds `apps/web` via npm workspaces).

1. Import or use the existing Vercel project `web` (or rename to `pandemic-flow`).
2. Ensure **Root Directory** is the repository root (`.`). Do not set `apps/web` unless you adjust install/build commands.
3. Framework preset: **Next.js** (auto-detected).
4. Add environment variables for **Production** and **Preview**:

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon / publishable key (browser-safe) |
| `NEXT_PUBLIC_APP_URL` | e.g. `https://your-app.vercel.app` |

5. Enable **Deploy on push** for the `main` branch.

The included [`apps/web/vercel.json`](../apps/web/vercel.json) runs install/build from the monorepo root when needed.

## Supabase cloud

1. Create a project at [supabase.com](https://supabase.com).
2. Link the CLI: `supabase link --workdir packages/database`
3. Push migrations: `supabase db push --workdir packages/database`
4. Copy project URL and anon key into Vercel env vars.

## Local Supabase

Requires Docker with sufficient disk space.

```bash
npm run db:start
npm run db:reset   # apply migrations
```

Default local keys are documented in [`.env.example`](../.env.example).

## CDC raw ingestion (Phase 2)

1. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set (server-only; use `apps/web/.env.local` locally).
2. Apply migrations: `supabase db push --workdir packages/database`
3. Install Python deps: `pip install -r requirements.txt`
4. Run: `python scripts/ingest_cdc.py`

Large CSV files are split into ~45MB parts for Supabase Storage (50MB upload limit). Raw rows upsert into `raw_cdc_wastewater_samples` keyed by `record_id`.

## Cleaning (Phase 3)

After `ingest_cdc.py`:

```bash
python scripts/refresh_sites.py
python scripts/transform_clean_observations.py
```

Populates `sites` and `clean_observations` for Illinois with `is_cook_county` tagging. Query Cook County modeling rows:

```sql
select * from clean_observations
where is_cook_county and include_in_model
order by sample_date desc;
```

## Weekly metrics (Phase 4)

After cleaning scripts:

```bash
python scripts/build_weekly_metrics.py
```

Dashboard charts can query precomputed tables:

```sql
select * from weekly_region_metrics
where region_type = 'county' and region_id = '17031'
order by week_start;

select * from weekly_region_metrics
where region_type = 'state' and region_id = 'IL'
order by week_start;
```

## Weekly automated pipeline (GitHub Actions)

The full data refresh runs via [`.github/workflows/weekly-data-update.yml`](../.github/workflows/weekly-data-update.yml):

1. Download CDC NWSS CSV and upsert raw rows + Storage snapshot
2. Refresh `sites` and `clean_observations`
3. Build `weekly_site_metrics` and `weekly_region_metrics`
4. Evaluate past forecasts (`prediction_actuals`, update `model_runs.metrics`)
5. Generate latest baseline/ensemble predictions
6. Infer Neural ODE rolling forecasts (no-op when no `status=production` Neural ODE run exists for a region)
7. Optionally revalidate Vercel cache (when configured)

**Production forecast on dashboards:** ensemble baselines only. Neural ODE runs are stored as `candidate` for Model Lab research unless explicitly promoted. Archive stale production Neural ODE rows (e.g. legacy v1.0.0) if they predate the current research framing.

**Schedule:** Saturday `13:30 UTC` (`cron: 30 13 * * 6`) — after the CDC’s typical Friday update.

**Manual trigger:** GitHub → Actions → **Weekly Data Update** → **Run workflow**.

### GitHub repository secrets

Add under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|--------|
| `SUPABASE_URL` | `https://penbaupjdcowtjiglvap.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (never commit) |

Optional:

| Secret | Notes |
|--------|--------|
| `CDC_WASTEWATER_CSV_URL` | Override CDC download URL |
| `VERCEL_REVALIDATE_URL` | Cache revalidation endpoint (Phase 5) |
| `VERCEL_REVALIDATE_SECRET` | Bearer token for revalidation |

### Local run (same as CI)

```bash
pip install -r requirements.txt
# Uses apps/web/.env.local or repo .env.local for Supabase credentials
python scripts/run_weekly_pipeline.py
```

For a manual local run (not scheduled):

```bash
INGESTION_TRIGGER_TYPE=manual python scripts/run_weekly_pipeline.py
```

## Baseline forecasts (Phase 6)

See [PHASE6.md](PHASE6.md) for models, UI, and verification. Apply migration `20260521120000_phase6_forecasting.sql`, then:

```bash
npm run forecast:backfill    # rolling-origin history (~60 weeks)
npm run forecast:evaluate    # score + update model_runs.metrics
npm run forecast:generate    # latest origin only
```

No new GitHub secrets required. Forecast tables use the same `SUPABASE_SERVICE_ROLE_KEY` as the data pipeline.

## Neural ODE (Phase 7)

See [PHASE7.md](PHASE7.md) and [PHASE7_DESIGN.md](PHASE7_DESIGN.md). Training, inference, promotion gates, and Model Lab research UI live in the repo; **deploy to Vercel requires pushing `main`** (or your production branch) so the Next.js app includes `/model-lab/neural-ode`.

Apply migration `20260521130000_phase7_neural_ode.sql`:

```bash
supabase db push --workdir packages/database
```

Verify in Supabase dashboard:

- Table `public.prediction_derivatives` exists (RLS public read)
- Storage bucket `model-artifacts` exists (`public = false`)

Install Python deps (CPU PyTorch to avoid CUDA wheels):

```bash
source .venv/bin/activate
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

No new GitHub secrets. Artifacts use the same `SUPABASE_SERVICE_ROLE_KEY` as the data pipeline.

### Train Neural ODE (Step 4)

```bash
source .venv/bin/activate
npm run train:neural-ode:dry    # local fit only, no Storage/DB write
npm run train:neural-ode        # both IL and Cook; uploads to model-artifacts, status=candidate
# Single region:
.venv/bin/python scripts/train_neural_ode.py --entity-type state --entity-id IL --version 1.0.0
```

Training is manual/monthly (~5–15 min per region on CPU). Does not run on the Saturday weekly cron.

### Infer Neural ODE (Step 5)

Requires a **production** `model_runs` row per region (promote after training). The weekly pipeline runs this automatically after baseline `generate_forecasts`.

```bash
npm run infer:neural-ode              # latest origin only
npm run infer:neural-ode:backfill   # ~60 rolling origins
# Dev: use candidate model if not promoted yet
.venv/bin/python scripts/infer_neural_ode.py --allow-candidate
```

Then score with `npm run forecast:evaluate` (same path as baselines).

### Promote Neural ODE (Step 6)

After training (`status=candidate`), check the numeric gate against production baselines:

```bash
npm run promote:neural-ode:check -- --entity-type state --entity-id IL --version 1.0.0
npm run promote:neural-ode -- --entity-type state --entity-id IL --version 1.0.0
# Or check all candidates:
.venv/bin/python scripts/promote_model.py --all-candidates --check-only
```

Gate compares holdout metrics from training to `persistence_v1` and `ensemble_v1` (see [PHASE7_DESIGN.md](PHASE7_DESIGN.md) §10). Use `--force` only to override a failed gate. Previous production runs for the same `model_name` are archived automatically.

### Verify after a run

```sql
select status, trigger_type, source_row_count, inserted_count, finished_at, error_message
from ingestion_runs
order by started_at desc
limit 5;

select region_type, region_id, count(*)::int as weeks
from weekly_region_metrics
group by 1, 2;
```

Expect `trigger_type = 'schedule'` for GitHub Actions runs and recent `finished_at` on success.

### Failure behavior

- Any step failure stops the pipeline and marks the GitHub Action as failed.
- Ingestion failures are recorded in `ingestion_runs` with `status = 'failed'`.
- If only one of `VERCEL_REVALIDATE_URL` / `VERCEL_REVALIDATE_SECRET` is set, the pipeline fails (incomplete config).
