-- Migration 058 — titre personnalisé d'un groupe de dates dans l'onglet Power Play
-- (ex. « Power play pré-tournoi #1 » au lieu de « Jeudi 22 octobre 2026 »).
create table if not exists pp_date_titles (
  unit_date date primary key,
  title text not null,
  updated_at timestamptz not null default now()
);
alter table pp_date_titles enable row level security;
create policy "authenticated - pp_date_titles" on pp_date_titles for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on public.pp_date_titles to authenticated;
grant select, insert, update, delete on public.pp_date_titles to service_role;
