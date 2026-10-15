-- Migration 039 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Team Building : trois équipes par séance (un capitaine, des joueurs, un
-- pointage). Stocké en JSON sur la séance déjà enregistrée dans
-- team_building_log :
--   [{ "captain_id": "<uuid>", "member_ids": ["<uuid>", ...], "score": 0 }, x3]

alter table team_building_log add column if not exists teams jsonb not null default '[]';
