-- Migration 061 — un alignement distinct par match quand une journée compte plusieurs matchs (tournoi).
--
-- lineups.game_id : renseigné seulement pour les dates à 2 matchs ou plus ; les journées
-- ordinaires gardent un alignement « de journée » (game_id nul), comme avant.
-- L'unicité par date devient : un seul alignement de journée par date, un seul par match.

alter table lineups add column if not exists game_id uuid references games(id) on delete set null;

drop index if exists idx_lineups_date;
create unique index if not exists idx_lineups_date_day on lineups (lineup_date) where game_id is null;
create unique index if not exists idx_lineups_game on lineups (game_id) where game_id is not null;

-- 5 novembre 2026 : l'alignement existant est rattaché au premier match (celui de 8 h 00).
update lineups
set game_id = (select id from games where game_date = '2026-11-05' order by created_at limit 1)
where lineup_date = '2026-11-05' and game_id is null;
