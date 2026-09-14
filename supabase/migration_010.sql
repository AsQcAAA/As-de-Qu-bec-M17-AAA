-- Migration 010 — à exécuter dans l'éditeur SQL de Supabase.
-- Heure de départ en autobus depuis l'Aréna Duberger, pour les matchs à
-- voyage. Affichée sur les différents calendriers quand elle est définie.

alter table games add column if not exists bus_departure_time time;
