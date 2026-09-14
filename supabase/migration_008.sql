-- Migration 008 — à exécuter dans l'éditeur SQL de Supabase.
-- Ajoute 3 cases d'objectifs individuels par joueur (remplies en début de saison).

alter table players add column if not exists objective_1 text;
alter table players add column if not exists objective_2 text;
alter table players add column if not exists objective_3 text;
