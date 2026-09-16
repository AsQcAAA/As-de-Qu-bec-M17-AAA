-- Migration 032 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Précision optionnelle sur une absence — utilisée par la route webhook des
-- courriels d'école (/api/absences/inbound-email) pour noter le type de
-- période (ex. « Période étoilée ») plutôt que de se limiter à la raison
-- générique « École ».

alter table absences add column if not exists detail text;
