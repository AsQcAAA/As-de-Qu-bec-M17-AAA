-- Migration 046 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Match sans rapport de statistiques avancées (TPE) : il n'est plus réclamé par le
-- pense-bête « Après-match » de l'accueil, pour tous les utilisateurs.

alter table games add column if not exists no_tpe_report boolean not null default false;
