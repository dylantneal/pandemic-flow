-- Phase 7: Neural ODE — prediction_derivatives + model-artifacts storage bucket

-- ---------------------------------------------------------------------------
-- prediction_derivatives
-- Sub-week samples for Neural ODE forecasts. One row per (prediction, step_idx).
-- step_idx is LOCAL 0..6 within each predictions row's 7-day segment.
-- t_offset_days is ABSOLUTE from forecast_origin_week (UI orders by this).
-- ---------------------------------------------------------------------------
create table if not exists public.prediction_derivatives (
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  step_idx integer not null check (step_idx between 0 and 6),
  t_offset_days numeric not null
    check (t_offset_days > 0 and t_offset_days <= 28),
  predicted_value numeric not null,
  predicted_derivative numeric not null,
  primary key (prediction_id, step_idx)
);

comment on table public.prediction_derivatives is
  'Sub-week derivative samples for Neural ODE forecasts. Each predictions row owns 7 derivative rows (step_idx 0..6) covering its non-overlapping 7-day segment ending at target_date. t_offset_days is absolute days from forecast_origin_week. UI stitches all derivatives for one (model_run_id, entity, origin) ordered by t_offset_days for a continuous curve.';

comment on column public.prediction_derivatives.step_idx is
  'Local step index within this prediction row (0..6). Use t_offset_days for absolute time.';

comment on column public.prediction_derivatives.t_offset_days is
  'Absolute day offset from forecast_origin_week. horizon=1 -> 1..7, horizon=2 -> 8..14, horizon=3 -> 15..21, horizon=4 -> 22..28.';

comment on column public.prediction_derivatives.predicted_value is
  'De-standardized activity index at this sub-week step. numeric unconstrained; application rounds to 4 decimals before insert.';

comment on column public.prediction_derivatives.predicted_derivative is
  'Instantaneous dx/dt from the ODE function at this step. Units: activity-index per week. numeric unconstrained; application rounds to 4 decimals before insert.';

create index if not exists prediction_derivatives_prediction_idx
  on public.prediction_derivatives (prediction_id, step_idx);

-- ---------------------------------------------------------------------------
-- RLS: public read for dashboard; writes via service role
-- ---------------------------------------------------------------------------
alter table public.prediction_derivatives enable row level security;

create policy "prediction_derivatives_public_read"
  on public.prediction_derivatives
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Storage bucket for trained model checkpoints (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'model-artifacts',
  'model-artifacts',
  false,
  104857600,
  array['application/octet-stream', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
