-- Migration 011 — à exécuter dans l'éditeur SQL de Supabase.
-- Ajoute des notes à chaque thème hebdomadaire, pour l'onglet Planification
-- hebdomadaire (une case thème + notes par semaine de la saison).

alter table weekly_themes add column if not exists notes text;
