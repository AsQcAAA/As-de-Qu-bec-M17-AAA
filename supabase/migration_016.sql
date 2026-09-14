-- Migration 016 — à exécuter dans l'éditeur SQL de Supabase.
-- Ajoute la raison « suspendu ». Les jours de match, on ne relève plus les
-- absences ordinaires mais les joueurs blessés et suspendus, afin de compter
-- les matchs ratés pour ces deux causes dans la fiche de chaque joueur.

alter table absences drop constraint if exists absences_reason_check;
alter table absences add constraint absences_reason_check
  check (reason in ('malade', 'blesse', 'ecole', 'remplacement_m18', 'non_justifie', 'suspendu'));
