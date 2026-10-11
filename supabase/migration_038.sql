-- Migration 038 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Matchs de toute la ligue M17 AAA (calendrier PDF de la LHEQ, importé chaque
-- lundi) : sert à détailler les derniers matchs de chaque équipe adverse dans
-- le Pre-Scout (adversaire, pointage, domicile / visiteur).

create table if not exists league_games (
  game_date date not null,
  home text not null,
  away text not null,
  home_score int,
  away_score int,
  updated_at timestamptz not null default now(),
  primary key (game_date, home, away)
);
alter table league_games enable row level security;
create policy "authenticated - league_games" on league_games for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
