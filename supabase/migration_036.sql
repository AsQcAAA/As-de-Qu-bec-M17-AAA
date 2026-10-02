-- Migration 036 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Coordonnées des familles de chaque joueur (courriels, téléphones, adresse),
-- importées des fichiers d'inscription. Ce sont des données de mineurs :
-- lisibles seulement par les entraîneurs connectés (jamais publiques), et
-- l'envoi de courriels depuis l'app est réservé à l'entraîneur-chef.

create table if not exists player_contacts (
  player_id uuid primary key references players(id) on delete cascade,
  emails text[] not null default '{}',
  -- [{ "number": "(418) 555-1234", "label": "Mobile", "name": "Parent 1", "relation": "Parent 1" }]
  phones jsonb not null default '[]',
  address text,
  city text,
  postal_code text,
  birth_date date,
  registration_id text,
  updated_at timestamptz not null default now()
);
alter table player_contacts enable row level security;
create policy "authenticated - player_contacts" on player_contacts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
