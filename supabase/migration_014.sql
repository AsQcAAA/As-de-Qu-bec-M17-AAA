-- Migration 014 — à exécuter dans l'éditeur SQL de Supabase.
--
-- 1) Onglet "Direction Générale" : notes libres visibles UNIQUEMENT par les
--    entraîneurs au rôle "head_coach" (pas par les entraîneurs adjoints
--    invités) — appliqué au niveau RLS, pas juste caché dans l'interface.
-- 2) Documents de match : permet de téléverser la feuille de match et un
--    rapport de statistiques avancées depuis la fiche détaillée d'un match
--    (onglet Résultats), pour ensuite compiler les points des joueurs.

create table if not exists dg_notes (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table dg_notes enable row level security;
create policy "head_coach uniquement - dg_notes" on dg_notes for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));

create table if not exists game_documents (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  doc_type text not null check (doc_type in ('feuille_match', 'stats_avancees')),
  file_url text not null,
  file_name text,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_game_documents_game on game_documents (game_id);
alter table game_documents enable row level security;
create policy "authenticated - game_documents" on game_documents for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Politiques RLS pour le bucket de stockage "game-documents" (le bucket est
-- créé automatiquement par le script d'installation ; s'il n'existe pas déjà,
-- crée-le manuellement dans Storage > New bucket, nom exact "game-documents",
-- coché "Public bucket").
create policy "game-documents - lecture authentifiée"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'game-documents');

create policy "game-documents - upload authentifié"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'game-documents');

create policy "game-documents - suppression authentifiée"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'game-documents');
