-- Migration 043 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Pre-Scout : deuxième vague (PP2 / PK2) en plus de la première (PP1 / PK1,
-- migration 042). Même format : { "markers": [...], "note": "…" }.

alter table scout_notes add column if not exists pp2_map jsonb;
alter table scout_notes add column if not exists pk2_map jsonb;
