-- Migration 002 — à exécuter une fois dans Supabase SQL Editor si tu as
-- déjà exécuté schema.sql avant cette date (sinon inutile, schema.sql à
-- jour inclut déjà ces changements sur un projet neuf).

-- Plan de match (4 points clés archivés par match, remplace la pratique du jour)
alter table games add column if not exists plan_point_1 text;
alter table games add column if not exists plan_point_2 text;
alter table games add column if not exists plan_point_3 text;
alter table games add column if not exists plan_point_4 text;

-- Raison d'absence normalisée (menu déroulant plutôt que texte libre)
alter table absences drop constraint if exists absences_reason_check;
alter table absences add constraint absences_reason_check
  check (reason in ('malade', 'blesse', 'ecole', 'remplacement_m18', 'non_justifie'));

-- Suivi du popup quotidien d'absences (évite qu'il ne réapparaisse une fois complété)
create table if not exists daily_checks (
  check_date date primary key,
  completed_at timestamptz not null default now()
);
alter table daily_checks enable row level security;
drop policy if exists "authenticated - daily_checks" on daily_checks;
create policy "authenticated - daily_checks" on daily_checks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
