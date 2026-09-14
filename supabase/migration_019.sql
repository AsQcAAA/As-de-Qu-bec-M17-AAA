-- Migration 019 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Sommaire du match : buts et punitions des DEUX équipes, une ligne par
-- évènement, dans l'ordre où ils sont survenus.
--
-- Une seule table plutôt qu'une pour les buts et une pour les punitions : le
-- sommaire les affiche mêlés, triés par période et par temps, et les deux
-- partagent les mêmes colonnes (qui, quand, quel numéro).
--
-- Les joueurs adverses n'existent pas dans `players` : on conserve donc leur
-- NOM tel qu'inscrit sur la feuille. player_id n'est rempli que pour les nôtres,
-- ce qui permet de rattacher punitions et points à une fiche.
--
-- Le code de punition est conservé entier (« A22 ») : c'est lui qui porte le
-- type d'infraction. Les minutes se recalculent — voir src/lib/penalties.ts.

create table if not exists game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  -- 'us' = As de Québec, 'opponent' = l'autre équipe.
  side text not null check (side in ('us', 'opponent')),
  event_type text not null check (event_type in ('goal', 'penalty')),
  period text,
  time text,

  player_id uuid references players(id) on delete set null,
  player_name text,
  jersey_number int,

  -- Buts seulement : les deux aides, telles qu'inscrites sur la feuille.
  assist1_name text,
  assist1_jersey int,
  assist1_player_id uuid references players(id) on delete set null,
  assist2_name text,
  assist2_jersey int,
  assist2_player_id uuid references players(id) on delete set null,

  -- Punitions seulement.
  penalty_code text,

  created_at timestamptz not null default now()
);
create index if not exists idx_game_events_game on game_events (game_id);
create index if not exists idx_game_events_player on game_events (player_id);

alter table game_events enable row level security;
create policy "authenticated - game_events" on game_events for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
