-- Migration 034 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Une dépense de budget doit pouvoir noter le fournisseur, pas seulement une
-- description libre.

alter table budget_expenses add column if not exists supplier text;
