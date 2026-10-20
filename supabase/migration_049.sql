-- Migration 049 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Tableau de tournoi (ex. Challenge M17 AAA St-Augustin, 5-8 nov. 2026) : un
-- pointage par match du tableau. Le calendrier du tournoi lui-même est dans le
-- code (src/lib/tournoiStAugustin.ts) ; ici, seulement les résultats saisis.

create table if not exists tournament_results (
  tournament text not null,
  game_no int not null,
  score_a int not null,
  score_b int not null,
  updated_at timestamptz not null default now(),
  primary key (tournament, game_no)
);
alter table tournament_results enable row level security;
create policy "authenticated - tournament_results" on tournament_results for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
notify pgrst, 'reload schema';
