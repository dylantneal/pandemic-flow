-- Phase 1 foundation: app health / metadata for connectivity checks

create table if not exists public.app_status (
  id text primary key default 'default',
  environment text not null default 'local',
  message text not null default 'Pandemic Flow foundation online',
  updated_at timestamptz not null default now()
);

insert into public.app_status (id, environment, message)
values ('default', 'local', 'Pandemic Flow foundation online')
on conflict (id) do nothing;

alter table public.app_status enable row level security;

create policy "app_status_public_read"
  on public.app_status
  for select
  to anon, authenticated
  using (true);

comment on table public.app_status is 'Minimal health/metadata table for Phase 1 Supabase connectivity checks.';
