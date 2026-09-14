-- Migration 005 — à exécuter dans l'éditeur SQL de Supabase.
-- Ajoute : notes éditables par jour pour l'export mensuel du calendrier.

create table if not exists calendar_day_notes (
  day date primary key,
  notes text,
  updated_at timestamptz not null default now()
);

alter table calendar_day_notes enable row level security;
create policy "authenticated - calendar_day_notes" on calendar_day_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
