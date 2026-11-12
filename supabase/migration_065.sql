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

-- Audience des créneaux (tous / patineurs / gardiens)
alter table bulletin_slots add column if not exists audience text not null default 'all' check (audience in ('all','skaters','goalies'));

-- Synchronisation avec le calendrier : une réservation crée un évènement « Rencontre bulletin — Nom »,
-- une annulation ou un créneau supprimé le retire.
alter table bulletin_slots add column if not exists event_id uuid;
create or replace function bulletin_sync_calendar() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; new_event uuid;
begin
  if tg_op = 'DELETE' then
    if old.event_id is not null then delete from schedule_events where id = old.event_id; end if;
    return old;
  end if;
  if new.player_id is not distinct from old.player_id then return new; end if;
  if old.event_id is not null then delete from schedule_events where id = old.event_id; new.event_id := null; end if;
  if new.player_id is not null then
    select full_name into pname from players where id = new.player_id;
    insert into schedule_events (event_date, start_time, end_time, event_type, title, location, notes)
    values (new.slot_date, new.start_time, new.start_time + make_interval(mins => new.duration_min),
            'individual_meeting', 'Rencontre bulletin — ' || pname, new.location, 'Réservée via le lien parents')
    returning id into new_event;
    new.event_id := new_event;
  end if;
  return new;
end $$;
drop trigger if exists bulletin_sync_calendar_upd on bulletin_slots;
create trigger bulletin_sync_calendar_upd before update on bulletin_slots for each row execute function bulletin_sync_calendar();
drop trigger if exists bulletin_sync_calendar_del on bulletin_slots;
create trigger bulletin_sync_calendar_del before delete on bulletin_slots for each row execute function bulletin_sync_calendar();
