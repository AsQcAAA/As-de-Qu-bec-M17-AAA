-- Migration 023 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Date de retour PRÉVUE, saisie à la main sur le bandeau de blessure.
--
-- Elle ne sert que tant que la blessure est en cours : une fois le joueur
-- revenu au jeu, la durée réelle de l'absence se calcule (première activité
-- ratée → retour au jeu) et remplace la prévision à l'affichage. On conserve
-- tout de même la valeur saisie, pour pouvoir un jour comparer prévu et réel.

alter table injury_notes add column if not exists expected_return date;
