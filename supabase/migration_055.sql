-- Migration 055 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Suivi de coach : une personne en copie conforme (CC) d'une rencontre — ex. Francis Laterreur.
-- Elle reçoit l'invitation en CC et figure aussi comme participante à la rencontre.
-- Colonne ajoutée à une table existante : aucun GRANT supplémentaire requis.

alter table coach_meetings add column if not exists cc_contact_id uuid references coach_contacts(id) on delete set null;
notify pgrst, 'reload schema';
