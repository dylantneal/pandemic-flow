# COVID Flow

A web-based COVID wastewater dynamics platform. Phase 1 provides the application shell, Supabase foundation, CI, and deployment wiring.

## Monorepo layout

```text
apps/web/                 Next.js dashboard
packages/database/        Supabase config and migrations
docs/                     Research and architecture notes
```

## Links

- **Live app:** https://web-five-sandy-7ewgvhnvpx.vercel.app
- **GitHub:** https://github.com/dylantneal/pandemic-flow

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker with sufficient disk space (for local Supabase)

## Quick start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Fill in Supabase URL and publishable key

# Start local Supabase (from repo root)
npm run db:start

# Run the web app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If `npm run db:start` fails with **no space left on device**, free Docker disk space (`docker system prune`) and retry.

For production, create a [Supabase cloud](https://supabase.com) project, run `supabase db push --workdir packages/database`, and set env vars in Vercel (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run test` | Unit tests |
| `npm run db:start` | Start local Supabase |
| `npm run db:stop` | Stop local Supabase |
| `npm run db:reset` | Reset local DB and apply migrations |

## CDC ingestion (Phase 2)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Ensure apps/web/.env.local has SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL
python scripts/ingest_cdc.py
```

Use `--local-file CDC_Wastewater_Data_for_SARS-CoV-2.csv` to ingest from a local copy instead of downloading.

## Cleaning (Phase 3)

After raw ingestion:

```bash
python scripts/refresh_sites.py
python scripts/transform_clean_observations.py
# or both:
python scripts/run_cleaning.py
```

## Weekly metrics (Phase 4)

After cleaning:

```bash
python scripts/build_weekly_metrics.py
```

## Weekly automated pipeline

Run the full chain (ingest → clean → weekly metrics → evaluate → generate forecasts) locally:

```bash
pip install -r requirements.txt
python scripts/run_weekly_pipeline.py
# or: npm run pipeline:weekly
```

## Baseline forecasts (Phase 6)

After weekly metrics are built and Phase 6 migration is applied:

```bash
pip install -r requirements.txt
# Initial backfill of rolling-origin predictions (~60 weeks)
npm run forecast:backfill
npm run forecast:evaluate
# Latest-origin only (weekly default)
npm run forecast:generate
```

Dashboard shows ensemble forecasts on Illinois/Cook County pages. Model evaluation is at `/model-lab`.

## Neural ODE (Phase 7)

After Phase 7 migration and training:

```bash
# Reliability-first training (recommended default)
npm run train:neural-ode

npm run promote:neural-ode:check -- --all-candidates
npm run infer:neural-ode:backfill
```

Region dashboards default to **ensemble** forecasts. Neural ODE is a **research track** (canonical candidate `1.7.5-shrinkage-conservative`): safe selective correction and calibrated intervals, but **not** a production ensemble replacement — 4-week lift on holdout is narrowly below the promotion bar. Model Lab → `/model-lab/neural-ode`. See [`docs/NEURAL_ODE_EXPLAINED.md`](docs/NEURAL_ODE_EXPLAINED.md) for a full walkthrough, and [`docs/PHASE7.md`](docs/PHASE7.md#research-conclusion-v175-frozen) for operator commands and promotion gates.

**GitHub Actions** runs this automatically every **Saturday ~13:30 UTC** via [`.github/workflows/weekly-data-update.yml`](.github/workflows/weekly-data-update.yml). You can also trigger it manually from the Actions tab (`workflow_dispatch`).

Required GitHub repository secrets:

| Secret | Required |
|--------|----------|
| `SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `CDC_WASTEWATER_CSV_URL` | Optional (defaults to CDC Socrata URL) |
| `VERCEL_REVALIDATE_URL` | Optional (Phase 5 cache refresh) |
| `VERCEL_REVALIDATE_SECRET` | Optional (with revalidation URL) |

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for setup details.

## Documentation

Research and architecture documents live in [`docs/`](docs/). For database tables, pipeline layers, and modeling data, see [`docs/DATA.md`](docs/DATA.md). For Phase 6 baseline forecasting (models, pipeline, UI), see [`docs/PHASE6.md`](docs/PHASE6.md). For how the Neural ODE works, see [`docs/NEURAL_ODE_EXPLAINED.md`](docs/NEURAL_ODE_EXPLAINED.md). For Phase 7 operations and promotion gates, see [`docs/PHASE7.md`](docs/PHASE7.md). For design and schema, see [`docs/PHASE7_DESIGN.md`](docs/PHASE7_DESIGN.md).

## License

Private / portfolio project.
