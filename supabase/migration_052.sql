-- Migration 052 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Onglet Power Play : une unité (ex. PP1 du 22 octobre) a maintenant trois phases —
-- en zone, sortie de zone (breakout) et mise au jeu (faceoff). L'en-zone d'une unité
-- saisie dans l'alignement du jour reste dans lineups ; le breakout et le faceoff sont
-- ici. Une seule ligne par date et par nom d'unité.

alter table pp_units add column if not exists bo_map jsonb;
alter table pp_units add column if not exists fo_map jsonb;
alter table pp_units alter column kind set default 'inzone';
create unique index if not exists pp_units_date_label on pp_units (unit_date, label);
notify pgrst, 'reload schema';
