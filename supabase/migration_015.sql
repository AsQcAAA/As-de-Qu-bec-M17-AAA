-- Migration 015 — à exécuter dans l'éditeur SQL de Supabase.
-- Permet de marquer une journée en rouge dans l'export mensuel du calendrier
-- (changement majeur à signaler aux joueurs et aux parents).

alter table calendar_day_notes add column if not exists highlight boolean not null default false;
