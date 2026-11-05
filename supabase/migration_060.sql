-- Migration 060 — Pre-Scout : alignement attendu de l'adversaire, saisi à la main.
-- Même format que game_opponent_lineups.slots : { "F1-AG": { "n": "12", "name": "…" }, ... }

alter table scout_notes add column if not exists lineup jsonb;
