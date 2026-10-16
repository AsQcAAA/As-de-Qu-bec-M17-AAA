-- Migration 047 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Alignement du jour : nos deux unités de avantage numérique (Power Play 1 et 2).
-- Même format que scout_notes.pp_map : { "markers": [...], "note": "…", "arrows": [...] }

alter table lineups add column if not exists pp1_map jsonb;
alter table lineups add column if not exists pp2_map jsonb;
notify pgrst, 'reload schema';

