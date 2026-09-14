-- Migration 007 — à exécuter dans l'éditeur SQL de Supabase.
-- Ajoute : thème de pratique sur le rapport quotidien, thème hebdomadaire de
-- pratique (popup du lundi 8h), et journal des thèmes/notes de Team Building.

alter table daily_reports add column if not exists practice_theme text;

create table if not exists weekly_themes (
  week_start date primary key,
  theme text,
  created_at timestamptz not null default now()
);

create table if not exists team_building_log (
  log_date date primary key,
  theme text,
  notes text,
  created_at timestamptz not null default now()
);

alter table weekly_themes enable row level security;
alter table team_building_log enable row level security;

create policy "authenticated - weekly_themes" on weekly_themes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - team_building_log" on team_building_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
