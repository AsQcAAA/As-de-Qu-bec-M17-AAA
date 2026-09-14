-- Migration 012 — à exécuter dans l'éditeur SQL de Supabase.
-- Sépare le thème de la rencontre de celui de la pratique dans le rapport
-- quotidien (deux cases distinctes au lieu d'une seule combinée).

alter table daily_reports add column if not exists meeting_theme text;
