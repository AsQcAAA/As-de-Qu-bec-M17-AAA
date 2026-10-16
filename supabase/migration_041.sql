-- Migration 041 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Direction générale : documents financiers importés des fichiers Excel du
-- Drive (budget 2026-27 des équipes, distribution monétaire). Le contenu est
-- stocké tel qu'importé (JSON) et se met à jour en téléversant le fichier à
-- nouveau. Données sensibles (salaires) : lisibles et modifiables par
-- l'entraîneur-chef seulement, même politique que dg_notes et les budgets.

create table if not exists dg_documents (
  slug text primary key,
  title text not null,
  source_file text,
  data jsonb not null default '{}',
  imported_at timestamptz not null default now()
);
alter table dg_documents enable row level security;
create policy "head_coach uniquement - dg_documents" on dg_documents for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));
