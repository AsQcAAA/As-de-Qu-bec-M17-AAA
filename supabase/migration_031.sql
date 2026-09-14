-- Migration 031 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Traçabilité pour les entraîneurs adjoints : qui a écrit/modifié un rapport
-- quotidien, une rencontre individuelle, ou en dernier touché l'alignement
-- d'une journée. Visible uniquement à l'entraîneur-chef (voir les pages
-- concernées) — jamais sur les exports imprimés ni la vue TV.

alter table daily_reports add column if not exists updated_by uuid references coach_profiles(id);
alter table meetings add column if not exists updated_by uuid references coach_profiles(id);
alter table lineups add column if not exists updated_by uuid references coach_profiles(id);
