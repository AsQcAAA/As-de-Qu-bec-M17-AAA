-- Migration 044 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Pre-Scout : sortie de zone en avantage numérique (PP BO, glace complète) et
-- formation de mise au jeu (FO, demi-glace). Même format que pp_map :
--   { "markers": [{ "id": "…", "number": "71", "x": 85, "y": 70 }], "note": "…" }

alter table scout_notes add column if not exists ppbo_map jsonb;
alter table scout_notes add column if not exists fo_map jsonb;
