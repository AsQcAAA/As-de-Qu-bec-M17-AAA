-- Migration 050 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Alignement du jour : 3e unité de power play (PP3, chandail bleu).
-- Colonne ajoutée à une table existante : aucun GRANT supplémentaire requis.

alter table lineups add column if not exists pp3_map jsonb;
notify pgrst, 'reload schema';
