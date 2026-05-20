# Database (Supabase)

Supabase project root for Pandemic Flow. Migrations live in `supabase/migrations/`.

## Commands (from repo root)

```bash
npm run db:start    # start local stack (Docker)
npm run db:reset    # reset DB and apply migrations
npm run db:stop
```

## Phase 1 schema

- `public.app_status` — health/metadata row for connectivity checks (RLS public read)

Phase 2 adds CDC wastewater tables per the architecture plan.

Phase 6 adds `model_runs`, `predictions`, and `prediction_actuals` for baseline forecasting.
