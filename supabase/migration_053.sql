-- Migration 053 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Power Play : plusieurs jeux par phase pour une même unité (ex. un 2e faceoff, un 2e
-- breakout). Les glaces supplémentaires sont gardées dans une liste :
--   [{ "id": "…", "phase": 0|1|2, "title": "IZ 2", "map": { markers, note, arrows } }]

alter table pp_units add column if not exists extra jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
