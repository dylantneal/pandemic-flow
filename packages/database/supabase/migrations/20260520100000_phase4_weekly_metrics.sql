-- Phase 4: dashboard-ready weekly site and region metrics

-- ---------------------------------------------------------------------------
-- weekly_site_metrics
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_site_metrics (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.sites (site_id) on delete restrict,
  week_start date not null,

  state_territory text,
  county_fips text,

  sample_count integer not null,
  median_log_concentration numeric,
  mean_log_concentration numeric,
  activity_index numeric,

  week_over_week_change numeric,
  two_week_change numeric,
  four_week_change numeric,

  estimated_growth_rate numeric,
  trend_label text not null default 'insufficient_data'
    check (trend_label in ('rising', 'falling', 'stable', 'insufficient_data')),

  quality_score numeric,
  quality_flags jsonb not null default '[]'::jsonb,

  latest_sample_date date,

  created_at timestamptz not null default now(),

  constraint weekly_site_metrics_site_week_key unique (site_id, week_start)
);

create index if not exists weekly_site_metrics_week_idx
  on public.weekly_site_metrics (week_start);

create index if not exists weekly_site_metrics_state_week_idx
  on public.weekly_site_metrics (state_territory, week_start);

-- ---------------------------------------------------------------------------
-- weekly_region_metrics
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_region_metrics (
  id uuid primary key default gen_random_uuid(),

  region_type text not null check (region_type in ('county', 'state', 'national')),
  region_id text not null,
  region_name text not null,
  week_start date not null,

  site_count integer,
  active_site_count integer,
  population_represented numeric,

  median_activity_index numeric,
  weighted_activity_index numeric,

  week_over_week_change numeric,
  estimated_growth_rate numeric,
  trend_label text not null default 'insufficient_data'
    check (trend_label in ('rising', 'falling', 'stable', 'insufficient_data')),

  quality_score numeric,
  quality_flags jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  constraint weekly_region_metrics_region_week_key unique (region_type, region_id, week_start)
);

create index if not exists weekly_region_metrics_type_week_idx
  on public.weekly_region_metrics (region_type, week_start);

create index if not exists weekly_region_metrics_region_week_idx
  on public.weekly_region_metrics (region_id, week_start);

-- ---------------------------------------------------------------------------
-- RLS: public read for dashboard; writes via service role
-- ---------------------------------------------------------------------------
alter table public.weekly_site_metrics enable row level security;
alter table public.weekly_region_metrics enable row level security;

create policy "weekly_site_metrics_public_read"
  on public.weekly_site_metrics
  for select
  to anon, authenticated
  using (true);

create policy "weekly_region_metrics_public_read"
  on public.weekly_region_metrics
  for select
  to anon, authenticated
  using (true);

comment on table public.weekly_site_metrics is 'Per-site weekly rollups for dashboard charts.';
comment on table public.weekly_region_metrics is 'Cook County and Illinois weekly aggregates for dashboard charts.';
