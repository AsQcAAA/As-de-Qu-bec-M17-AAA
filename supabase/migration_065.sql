-- Rencontres bulletins : créneaux de 15 min réservables par les joueurs via un lien personnel.
create table if not exists bulletin_slots (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  start_time time not null,
  duration_min int not null default 15,
  location text,
  player_id uuid references players(id) on delete set null,
  booked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (slot_date, start_time)
);
-- Un joueur ne peut détenir qu'un seul créneau.
create unique index if not exists bulletin_slots_one_per_player on bulletin_slots(player_id) where player_id is not null;

create table if not exists bulletin_links (
  player_id uuid primary key references players(id) on delete cascade,
  token uuid not null unique default gen_random_uuid()
);

alter table bulletin_slots enable row level security;
alter table bulletin_links enable row level security;
create policy "authenticated - bulletin_slots" on bulletin_slots for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - bulletin_links" on bulletin_links for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on bulletin_slots, bulletin_links to authenticated, service_role;
