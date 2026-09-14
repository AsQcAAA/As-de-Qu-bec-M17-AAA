-- Migration 027 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Consultations de physiothérapie (PCN), reprises du Google Sheets partagé par
-- la clinique.
--
-- Ce ne sont PAS des blessures : une consultation peut être un simple
-- dépistage, sans absence ni restriction. La chronologie des blessures continue
-- donc de se déduire uniquement des absences ; ces lignes vivent à côté, sur la
-- fiche du joueur et dans l'onglet Blessures.
--
-- Clé : un joueur, une date. La clinique inscrit un rendez-vous par jour, et si
-- elle corrige une ligne, la correction remplace l'ancienne au lieu de créer un
-- doublon. Le hachage du contenu sert à repérer ces corrections : quand il
-- change, la consultation redevient « non lue » et le coach est averti.

create table if not exists physio_consultations (
  player_id uuid not null references players(id) on delete cascade,
  consult_date date not null,
  clinical_impression text,
  intervention_plan text,
  state text,
  clinical_followup text,
  recommendations text,
  review_in text,
  appointment_type text,
  /** Empreinte du contenu : sert à détecter une modification côté clinique. */
  content_hash text not null,
  /** Date de prise de connaissance par le coach — null tant qu'elle est nouvelle. */
  seen_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (player_id, consult_date)
);

create index if not exists idx_physio_unseen on physio_consultations (seen_at);

alter table physio_consultations enable row level security;
create policy "authenticated - physio_consultations" on physio_consultations for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
