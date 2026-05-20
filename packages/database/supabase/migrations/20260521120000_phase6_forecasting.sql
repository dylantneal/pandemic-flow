-- Phase 6: baseline forecasting — model_runs, predictions, prediction_actuals

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (reuse if already exists)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- model_runs
-- ---------------------------------------------------------------------------
create table if not exists public.model_runs (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  model_type text not null
    check (model_type in (
      'persistence',
      'moving_average',
      'trend',
      'seasonal_naive',
      'ensemble',
      'neural_ode'
    )),
  version text not null,
  status text not null default 'production'
    check (status in ('training', 'candidate', 'production', 'failed', 'archived')),

  training_start_date date,
  training_end_date date,
  validation_start_date date,
  validation_end_date date,

  git_commit text,
  artifact_path text,
  hyperparameters jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint model_runs_name_version_key unique (model_name, version)
);

create index if not exists model_runs_type_status_idx
  on public.model_runs (model_type, status);

drop trigger if exists model_runs_set_updated_at on public.model_runs;
create trigger model_runs_set_updated_at
  before update on public.model_runs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- predictions
-- ---------------------------------------------------------------------------
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  model_run_id uuid not null references public.model_runs (id) on delete cascade,

  entity_type text not null check (entity_type in ('site', 'county', 'state')),
  entity_id text not null,

  forecast_origin_week date not null,
  target_date date not null,
  horizon_weeks integer not null check (horizon_weeks between 1 and 12),

  predicted_activity_index numeric,
  lower_bound numeric,
  upper_bound numeric,
  predicted_trend text
    check (predicted_trend in ('rising', 'falling', 'stable', 'insufficient_data')),
  confidence_label text
    check (confidence_label in ('low', 'medium', 'high')),

  created_at timestamptz not null default now(),

  constraint predictions_unique_key
    unique (model_run_id, entity_type, entity_id, forecast_origin_week, horizon_weeks),

  constraint predictions_target_date_check
    check (target_date = forecast_origin_week + (horizon_weeks * 7)),

  constraint predictions_bounds_check
    check (
      lower_bound is null
      or upper_bound is null
      or predicted_activity_index is null
      or (lower_bound <= predicted_activity_index and predicted_activity_index <= upper_bound)
    )
);

create index if not exists predictions_latest_idx
  on public.predictions (entity_type, entity_id, forecast_origin_week desc);

create index if not exists predictions_eval_idx
  on public.predictions (entity_type, entity_id, target_date);

create index if not exists predictions_model_origin_idx
  on public.predictions (model_run_id, forecast_origin_week desc);

-- ---------------------------------------------------------------------------
-- prediction_actuals
-- ---------------------------------------------------------------------------
create table if not exists public.prediction_actuals (
  prediction_id uuid primary key references public.predictions (id) on delete cascade,
  actual_activity_index numeric not null,
  absolute_error numeric not null,
  squared_error numeric not null,
  trend_correct boolean,
  scored_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: public read for dashboard; writes via service role
-- ---------------------------------------------------------------------------
alter table public.model_runs enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_actuals enable row level security;

create policy "model_runs_public_read"
  on public.model_runs
  for select
  to anon, authenticated
  using (true);

create policy "predictions_public_read"
  on public.predictions
  for select
  to anon, authenticated
  using (true);

create policy "prediction_actuals_public_read"
  on public.prediction_actuals
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Seed canonical baseline model runs (idempotent)
-- ---------------------------------------------------------------------------
insert into public.model_runs (model_name, model_type, version, status, hyperparameters)
values
  (
    'persistence_v1',
    'persistence',
    '1.0.0',
    'production',
    '{"description": "Next week equals current week"}'::jsonb
  ),
  (
    'moving_average_v1',
    'moving_average',
    '1.0.0',
    'production',
    '{"window_weeks": 4}'::jsonb
  ),
  (
    'trend_v1',
    'trend',
    '1.0.0',
    'production',
    '{"lookback_weeks": 8}'::jsonb
  ),
  (
    'seasonal_naive_v1',
    'seasonal_naive',
    '1.0.0',
    'production',
    '{"season_lag_weeks": 52}'::jsonb
  ),
  (
    'ensemble_v1',
    'ensemble',
    '1.0.0',
    'production',
    '{"components": ["persistence", "moving_average", "trend", "seasonal_naive"]}'::jsonb
  )
on conflict (model_name, version) do nothing;

comment on table public.model_runs is 'Tracked model fits and evaluation metrics.';
comment on table public.predictions is 'Region/site forecasts keyed by forecast origin week and horizon.';
comment on table public.prediction_actuals is 'Scored predictions once actual weekly data is available.';
