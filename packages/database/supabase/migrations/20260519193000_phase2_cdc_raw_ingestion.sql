-- Phase 2: CDC raw wastewater ingestion schema, RLS, and storage bucket

-- ---------------------------------------------------------------------------
-- data_sources
-- ---------------------------------------------------------------------------
create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null,
  dataset_slug text unique,
  source_url text not null,
  update_cadence text,
  last_checked_at timestamptz,
  last_successful_ingest_at timestamptz,
  latest_source_updated_at timestamptz,
  schema_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ingestion_runs
-- ---------------------------------------------------------------------------
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources (id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'failed', 'partial')),
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual', 'schedule', 'backfill')),
  git_commit text,
  source_row_count integer,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  raw_snapshot_path text,
  created_at timestamptz not null default now()
);

create index if not exists ingestion_runs_data_source_started_idx
  on public.ingestion_runs (data_source_id, started_at desc);

create index if not exists ingestion_runs_status_idx
  on public.ingestion_runs (status);

-- ---------------------------------------------------------------------------
-- raw_cdc_wastewater_samples (mirrors CDC CSV; 38 source columns + metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.raw_cdc_wastewater_samples (
  id uuid primary key default gen_random_uuid(),

  record_id text not null,
  site text not null,
  state_territory text,
  source text,
  county_fips text,
  counties_served text,
  population_served numeric,
  sample_id text,
  sample_collect_date date not null,
  sample_type text,
  sample_matrix text,
  sample_location text,
  flow_rate numeric,
  concentration_method text,
  pasteurized text,
  pcr_type text,
  extraction_method text,
  major_lab_method text,
  inhibition_detect text,
  inhibition_adjust text,
  ntc_amplify text,
  pcr_target text,
  pcr_gene_target_agg text,
  pcr_target_avg_conc numeric,
  pcr_target_units text,
  lod_sewage numeric,
  pcr_target_detect text,
  pcr_target_avg_conc_lin numeric,
  pcr_target_flowpop_lin numeric,
  pcr_target_mic_lin numeric,
  hum_frac_target_mic text,
  hum_frac_mic_conc numeric,
  hum_frac_mic_unit text,
  rec_eff_percent numeric,
  rec_eff_target_name text,
  rec_eff_spike_matrix text,
  rec_eff_spike_conc numeric,
  date_updated timestamptz,

  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  row_hash text not null,
  ingested_at timestamptz not null default now(),

  constraint raw_cdc_wastewater_samples_record_id_key unique (record_id)
);

create index if not exists raw_cdc_samples_site_collect_date_idx
  on public.raw_cdc_wastewater_samples (site, sample_collect_date);

create index if not exists raw_cdc_samples_state_collect_date_idx
  on public.raw_cdc_wastewater_samples (state_territory, sample_collect_date);

create index if not exists raw_cdc_samples_ingestion_run_idx
  on public.raw_cdc_wastewater_samples (ingestion_run_id);

-- ---------------------------------------------------------------------------
-- Seed CDC data source
-- ---------------------------------------------------------------------------
insert into public.data_sources (
  name,
  provider,
  dataset_slug,
  source_url,
  update_cadence
)
values (
  'CDC Wastewater Data for SARS-CoV-2',
  'CDC',
  'j9g8-acpt',
  'https://data.cdc.gov/api/views/j9g8-acpt/rows.csv?accessType=DOWNLOAD',
  'weekly_friday'
)
on conflict (dataset_slug)
do update set
  name = excluded.name,
  provider = excluded.provider,
  source_url = excluded.source_url,
  update_cadence = excluded.update_cadence,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- RLS: ingestion tables are service-role only (no anon/authenticated access)
-- ---------------------------------------------------------------------------
alter table public.data_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.raw_cdc_wastewater_samples enable row level security;

-- No policies for anon/authenticated — pipeline uses service role key.

comment on table public.data_sources is 'External dataset registry for ingestion pipelines.';
comment on table public.ingestion_runs is 'Audit log for each CDC/raw ingestion execution.';
comment on table public.raw_cdc_wastewater_samples is 'Raw CDC NWSS wastewater samples, close to source CSV.';

-- ---------------------------------------------------------------------------
-- Storage bucket for raw CSV snapshots (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'raw-cdc-wastewater-snapshots',
  'raw-cdc-wastewater-snapshots',
  false,
  524288000,
  array['text/csv', 'application/csv', 'text/plain', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
