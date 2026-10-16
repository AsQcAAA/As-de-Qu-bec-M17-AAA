-- Migration 042 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Pre-Scout : disposition de chaque équipe adverse en avantage numérique (PP)
-- et en désavantage numérique (PK) — joueurs (numéros) placés sur une patinoire.
--   { "markers": [{ "id": "…", "number": "71", "x": 85, "y": 70 }], "note": "…" }

alter table scout_notes add column if not exists pp_map jsonb;
alter table scout_notes add column if not exists pk_map jsonb;
