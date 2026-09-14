-- Migration 004 — à exécuter dans l'éditeur SQL de Supabase.
-- Ajoute : ordre de priorité personnalisable des joueurs, et catégories de
-- responsabilités (cases où glisser-déposer les joueurs).

alter table players add column if not exists priority_order int;

create table if not exists responsibility_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table responsibility_categories enable row level security;
create policy "authenticated - responsibility_categories" on responsibility_categories for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
