-- Migration 059 — historique « qui a écrit quoi » des notes de pre-scout.
create table if not exists scout_note_log (
  id uuid primary key default gen_random_uuid(),
  team_slug text not null,
  field text not null,
  author_id uuid,
  author_name text not null,
  text text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_scout_note_log_team on scout_note_log (team_slug, created_at desc);
alter table scout_note_log enable row level security;
create policy "authenticated - scout_note_log" on scout_note_log for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on public.scout_note_log to authenticated;
grant select, insert, update, delete on public.scout_note_log to service_role;
