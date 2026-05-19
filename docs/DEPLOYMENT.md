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
4. Optionally revalidate Vercel cache (when configured)

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
