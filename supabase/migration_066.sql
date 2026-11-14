-- Migration 066 — statistiques des joueurs ADVERSES, par match contre nous,
-- tirées du même rapport TPE (tableau « Player stats » de l'adversaire).
-- Sert au pre-scout : temps de glace moyen de chaque joueur adverse contre nous.
create table if not exists opponent_player_game_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  team_name text,
  jersey integer not null,
  sheet_name text not null,
  toi_seconds integer,
  shots_on_goal integer,
  plus_minus integer,
  faceoffs_won integer,
  faceoffs_lost integer,
  xg numeric,
  created_at timestamptz not null default now(),
  unique (game_id, jersey)
);
create index if not exists idx_opponent_player_game_stats_game on opponent_player_game_stats (game_id);
alter table opponent_player_game_stats enable row level security;
create policy "authenticated - opponent_player_game_stats" on opponent_player_game_stats for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on public.opponent_player_game_stats to authenticated;
grant select, insert, update, delete on public.opponent_player_game_stats to service_role;
