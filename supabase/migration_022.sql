-- Migration 022 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Type de blessure, saisi à la main sur le bandeau de la chronologie.
--
-- Les blessures elles-mêmes ne sont pas stockées : elles sont déduites des
-- absences et des alignements (voir src/lib/injuries.ts). Seule la nature de
-- la blessure ne peut pas se déduire — d'où cette table, dont la clé est le
-- couple joueur + date de début de l'épisode.

create table if not exists injury_notes (
  player_id uuid not null references players(id) on delete cascade,
  start_date date not null,
  injury_type text,
  updated_at timestamptz not null default now(),
  primary key (player_id, start_date)
);

alter table injury_notes enable row level security;
create policy "authenticated - injury_notes" on injury_notes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
