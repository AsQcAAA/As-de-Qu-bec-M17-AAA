-- Migration 064 — deuxième PP BO (sortie de zone en avantage numérique) dans le pre-scout.
alter table scout_notes add column if not exists ppbo2_map jsonb;
