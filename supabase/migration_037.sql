-- Migration 037 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Alignement de l'équipe adverse, saisi à la main après chaque match
-- (numéros par position ; les noms s'ajoutent ensuite).

create table if not exists game_opponent_lineups (
  game_id uuid primary key references games(id) on delete cascade,
  -- { "F1-AG": { "n": "71", "name": "Samuel Pinel" }, "D1-G": {...}, "G1": {...} }
  slots jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table game_opponent_lineups enable row level security;
create policy "authenticated - game_opponent_lineups" on game_opponent_lineups for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
