-- Migration 013 — à exécuter dans l'éditeur SQL de Supabase.
-- Ajoute un type de match (Hors Concours / Saison régulière / Séries /
-- Tournois) pour filtrer l'onglet Résultats.

alter table games add column if not exists category text
  check (category in ('hors_concours', 'saison_reguliere', 'series', 'tournoi'))
  not null default 'saison_reguliere';

-- Les 4 matchs préparatoires d'août (avant le début officiel de saison) sont
-- en réalité des matchs hors concours.
update games set category = 'hors_concours' where game_date in ('2026-08-19', '2026-08-20', '2026-08-21', '2026-08-23');
