-- Migration 030 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Les 9 ronds de mise au jeu du diagramme « Face-Offs by zones » du rapport
-- TPE (reproduction du schéma de patinoire — voir TpeFaceoffZoneGrid dans
-- src/lib/tpeReport.ts), pour construire une carte de chaleur collective des
-- mises au jeu, cumulée sur plusieurs matchs.

alter table games add column if not exists faceoff_zone_map jsonb;
