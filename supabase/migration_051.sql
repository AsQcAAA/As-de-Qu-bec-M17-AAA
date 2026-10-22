-- Migration 051 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Onglet Power Play : bibliothèque d'unités de power play (en zone, sortie de zone,
-- mise au jeu), classées par date. Les unités saisies dans l'alignement du jour
-- (lineups.pp1_map à pp3_map) apparaissent aussi dans l'onglet, sans table supplémentaire.

create table if not exists pp_units (
  id uuid primary key default gen_random_uuid(),
  unit_date date not null,
  label text not null,
  kind text not null check (kind in ('inzone', 'breakout', 'faceoff')),
  color text check (color in ('gris', 'jaune', 'bleu')),
  map jsonb not null default '{"markers": [], "note": ""}'::jsonb,
  created_at timestamptz not null default now()
);
alter table pp_units enable row level security;
create policy "authenticated - pp_units" on pp_units for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on public.pp_units to authenticated;
grant select, insert, update, delete on public.pp_units to service_role;
notify pgrst, 'reload schema';
