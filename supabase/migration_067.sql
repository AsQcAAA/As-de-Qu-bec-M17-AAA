-- Migration 067 — présences au party de Noël des employés (As & Chevaliers,
-- La Bûche, 17 décembre 2026) : nom de la personne et sa confirmation.
create table if not exists party_rsvp (
  id uuid primary key default gen_random_uuid(),
  event_key text not null default 'noel-2026',
  name text not null,
  attending boolean,
  created_at timestamptz not null default now()
);
create index if not exists idx_party_rsvp_event on party_rsvp (event_key);
alter table party_rsvp enable row level security;
create policy "authenticated - party_rsvp" on party_rsvp for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on public.party_rsvp to authenticated;
grant select, insert, update, delete on public.party_rsvp to service_role;
