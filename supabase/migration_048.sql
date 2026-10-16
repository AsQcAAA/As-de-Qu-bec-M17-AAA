-- Migration 048 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Alignement du jour : afficher (ou non) les deux power plays sur la TV du vestiaire.

alter table lineups add column if not exists show_pp_tv boolean not null default false;
notify pgrst, 'reload schema';
