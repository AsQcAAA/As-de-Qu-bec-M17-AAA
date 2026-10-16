-- Migration 045 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Pre-Scout (PP Pre-Scout = leur infériorité) : sortie de zone (PK FC, glace complète)
-- et mise au jeu (FO) à 4 joueurs. Même format que pp_map.

alter table scout_notes add column if not exists pkbo_map jsonb;
alter table scout_notes add column if not exists pkfo_map jsonb;
