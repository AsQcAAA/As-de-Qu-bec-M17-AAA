-- Migration 028 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Nouveau type d'évènement : « Rappel ». Une case libre dans l'horaire du
-- jour, réservée aux journées de pratique, dont le texte se répète tel quel
-- sur la vue TV du vestiaire, sous l'horaire.

alter table schedule_events drop constraint if exists schedule_events_event_type_check;
alter table schedule_events add constraint schedule_events_event_type_check
  check (event_type in (
    'game', 'practice', 'team_meeting', 'individual_meeting',
    'team_building', 'pp_meeting', 'training', 'other', 'reminder'
  ));
