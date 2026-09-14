-- Migration 018 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Statistiques de gardien, tirées de la feuille de match : buts alloués et
-- minutes jouées. La feuille de la ligue (PDF) donne les deux par gardien
-- (champs totalGoalLoc / totalMinLoc), et la feuille papier les inscrit dans
-- la bande « GARDIENS » du bas.
--
-- Elles vivent dans player_game_stats, à côté des buts et passes : un gardien
-- est un joueur, et cela évite une table et une jointure de plus.
-- toi_minutes existe déjà et sert de temps de glace.

alter table player_game_stats add column if not exists goals_against int;

comment on column player_game_stats.goals_against is
  'Buts alloués (gardiens seulement). NULL pour un patineur.';
comment on column player_game_stats.toi_minutes is
  'Minutes jouées. Pour un gardien, sert au calcul de la moyenne de buts alloués.';
