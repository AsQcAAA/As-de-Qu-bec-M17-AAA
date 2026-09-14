-- Migration 025 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Historique des responsabilités sous forme d'IMAGE.
--
-- La liste texte des assignations ne servait à personne : c'est l'image
-- envoyée aux joueurs qui fait foi, et c'est elle qu'on veut retrouver. Une
-- image par date ; regénérer une journée remplace la précédente.
--
-- Le bucket « responsibility-boards » est déjà créé (public).

create table if not exists responsibility_boards (
  log_date date primary key,
  image_url text not null,
  created_at timestamptz not null default now()
);

alter table responsibility_boards enable row level security;
create policy "authenticated - responsibility_boards" on responsibility_boards for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Politiques de stockage du bucket.
create policy "responsibility-boards - lecture authentifiée"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'responsibility-boards');

create policy "responsibility-boards - upload authentifié"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'responsibility-boards');

create policy "responsibility-boards - remplacement authentifié"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'responsibility-boards');

create policy "responsibility-boards - suppression authentifiée"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'responsibility-boards');
