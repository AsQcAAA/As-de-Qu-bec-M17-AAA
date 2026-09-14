-- Migration 029 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Rapport de statistiques avancées TPE (portal.tpeteam.com), téléversé après
-- chaque match dans la case « Rapport de statistiques avancées » déjà
-- présente sur la fiche du match. Remplace la prise de +/- à la main (photo
-- du « Sommaire du match ») : le +/- vient maintenant de ce rapport, comme le
-- reste des statistiques individuelles qu'il contient.
--
-- Les buts et passes restent lus sur la feuille de match officielle (+ les
-- corrections du coach) : ce rapport n'en est jamais la source.

-- Une ligne par joueur des As de Québec, par match.
create table if not exists player_game_advanced_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  -- Temps de jeu — absent pour les gardiens, qui ne sont pas suivis par ce rapport.
  toi_seconds integer,
  shots_on_goal integer,
  faceoffs_won integer,
  faceoffs_lost integer,
  plus_minus integer,
  -- Les 6 statistiques xG : cachées sur la fiche de base du joueur, visibles
  -- seulement dans la fenêtre de statistiques avancées.
  on_ice_xg_for numeric,
  on_ice_xg_against numeric,
  on_ice_xg_for_per20 numeric,
  on_ice_xg_against_per20 numeric,
  xg numeric,
  xg_per20 numeric,
  created_at timestamptz not null default now(),
  unique (game_id, player_id)
);

create index if not exists idx_player_game_advanced_stats_game on player_game_advanced_stats (game_id);
create index if not exists idx_player_game_advanced_stats_player on player_game_advanced_stats (player_id);

alter table player_game_advanced_stats enable row level security;
create policy "authenticated - player_game_advanced_stats" on player_game_advanced_stats for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Statistiques d'équipe du même rapport : tirs (les deux équipes, pour le
-- futur heat map) et mises au jeu (nous seulement — le rapport n'a pas
-- besoin de conserver le détail de l'adversaire à ce niveau).
alter table games add column if not exists shots_on_goal_us integer;
alter table games add column if not exists shots_on_goal_opponent integer;
-- Détail tirs/tirs au but/buts par période et par situation (PP/PK/égalité),
-- pour les deux équipes — voir src/lib/tpeReport.ts pour la forme exacte.
alter table games add column if not exists shots_breakdown jsonb;
alter table games add column if not exists faceoffs_us_won integer;
alter table games add column if not exists faceoffs_us_lost integer;
-- Détail des mises au jeu (période, situation, zone) — nous seulement.
alter table games add column if not exists faceoff_breakdown jsonb;
alter table games add column if not exists team_xg_us numeric;
alter table games add column if not exists team_xg_opponent numeric;
