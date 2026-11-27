-- Power play : synchronisation en direct entre appareils (Supabase Realtime).
-- Les modifications d'une unité (pp_units) ou de l'in-zone d'un alignement
-- (lineups) sont poussées aux autres écrans ouverts.
alter publication supabase_realtime add table public.pp_units;
alter publication supabase_realtime add table public.lineups;
