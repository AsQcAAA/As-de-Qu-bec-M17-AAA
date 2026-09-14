-- Migration 026 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Nouvelle raison : « sans contact ».
--
-- Ce n'est pas une absence : le joueur était sur la glace et a patiné, mais
-- sans contact. On l'enregistre au même endroit que les absences parce que
-- c'est la même question posée au même moment — qui n'est pas à 100 % aujourd'hui
-- — et parce que la chronologie des blessures a besoin de ces journées : elles
-- prolongent l'épisode en réhabilitation sans compter comme activité ratée.

alter table absences drop constraint if exists absences_reason_check;
alter table absences add constraint absences_reason_check
  check (reason in ('malade', 'blesse', 'ecole', 'remplacement_m18', 'non_justifie', 'suspendu', 'sans_contact'));
