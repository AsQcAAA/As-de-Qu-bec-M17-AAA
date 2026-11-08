-- Migration 063 — joueurs habillés selon la feuille de match officielle.
--
-- Le nombre de matchs joués d'un joueur se calcule sur les feuilles de match importées
-- (tous les joueurs inscrits, pointeurs ou non), plutôt que sur les alignements.
-- Un match sans feuille importée retombe sur l'alignement du jour.

create table if not exists game_sheet_players (
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  primary key (game_id, player_id)
);
create index if not exists idx_game_sheet_players_player on game_sheet_players (player_id);

alter table game_sheet_players enable row level security;
create policy "authenticated - game_sheet_players" on game_sheet_players for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete on game_sheet_players to authenticated;
grant select, insert, update, delete on game_sheet_players to service_role;
