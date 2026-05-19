-- Phase 3: sites registry and clean modeling observations (Illinois / Cook County)

-- ---------------------------------------------------------------------------
-- sites
-- ---------------------------------------------------------------------------
create table if not exists public.sites (
  site_id text primary key,
  state_territory text,
  county_fips text,
  counties_served text,
  population_served numeric,
  first_sample_date date,
  last_sample_date date,
  sample_count integer not null default 0,
  active_status text not null default 'inactive'
    check (active_status in ('active', 'recent', 'stale', 'inactive')),
  is_cook_county_site boolean not null default false,
  dominant_units text,
  dominant_sample_matrix text,
  dominant_sample_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sites_state_active_idx
  on public.sites (state_territory, active_status);

create index if not exists sites_cook_active_idx
  on public.sites (is_cook_county_site, active_status)
  where is_cook_county_site;

-- ---------------------------------------------------------------------------
-- clean_observations
-- ---------------------------------------------------------------------------
create table if not exists public.clean_observations (
  id uuid primary key default gen_random_uuid(),
  raw_sample_id uuid not null references public.raw_cdc_wastewater_samples (id) on delete cascade,
  site_id text not null references public.sites (site_id) on delete restrict,

  sample_date date not null,
  week_start date not null,

  state_territory text,
  county_fips text,
  counties_served text,
  is_cook_county boolean not null default false,

  raw_concentration numeric,
  log_concentration numeric,
  normalized_concentration numeric,
  concentration_source text,

  units text,
  detected boolean,
  below_lod boolean,

  sample_matrix text,
  sample_type text,
  sample_location text,
  lab_method_group text,

  include_in_model boolean not null default true,
  exclusion_reason text,

  quality_score numeric,
  quality_flags jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  constraint clean_observations_raw_sample_id_key unique (raw_sample_id)
);

create index if not exists clean_obs_cook_model_date_idx
  on public.clean_observations (is_cook_county, sample_date)
  where include_in_model;

create index if not exists clean_obs_site_date_idx
  on public.clean_observations (site_id, sample_date);

create index if not exists clean_obs_state_week_idx
  on public.clean_observations (state_territory, week_start);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sites enable row level security;
alter table public.clean_observations enable row level security;

create policy "sites_public_read"
  on public.sites
  for select
  to anon, authenticated
  using (true);

create policy "clean_observations_public_read"
  on public.clean_observations
  for select
  to anon, authenticated
  using (true);

comment on table public.sites is 'Illinois wastewater site rollups with active/stale status.';
comment on table public.clean_observations is 'Modeling-ready IL observations with quality flags and Cook County tagging.';
