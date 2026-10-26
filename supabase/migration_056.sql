-- Migration 056 — appliquée via le connecteur Supabase.
--
-- Power Play utilisé lors d'un match : liste des unités de l'onglet Power Play liées au match,
--   [{ "date": "2026-10-22", "label": "PP1" }, …]
-- Colonne ajoutée à une table existante : aucun GRANT supplémentaire requis.

alter table games add column if not exists pp_units jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
