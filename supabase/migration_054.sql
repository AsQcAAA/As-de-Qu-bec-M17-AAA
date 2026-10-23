-- Migration 054 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Direction générale > Suivi de coach : rencontres individuelles avec les entraîneurs
-- (calendrier, invitations par courriel) et notes de suivi par entraîneur.
-- Lisible et modifiable par l'entraîneur-chef seulement (même politique que dg_notes).

-- Les entraîneurs du suivi : un nom et un courriel, sans compte dans l'application
-- (l'invitation de calendrier part directement à ce courriel).
create table if not exists coach_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);
alter table coach_contacts enable row level security;
create policy "head_coach uniquement - coach_contacts" on coach_contacts for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));
grant select, insert, update, delete on public.coach_contacts to authenticated;
grant select, insert, update, delete on public.coach_contacts to service_role;

insert into coach_contacts (full_name, email) values
  ('Olivier Simoneau Paquet', 'o.spaquet@asdequebecaaa.com'),
  ('Rafael Massé', 'rafael.masse@asdequebecaaa.com'),
  ('Alexis Houle', 'alexhoule27@gmail.com'),
  ('Gabriel Bossé', 'gab_bosse24@hotmail.com'),
  ('Jérémy Ste-Marie', 'ste-mariejeremy@hotmail.com'),
  ('Félix Devost', 'felix.devost@asdequebecaaa.com')
on conflict (email) do nothing;

create table if not exists coach_meetings (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_contacts(id) on delete cascade,
  meeting_date date not null,
  start_time time not null,
  end_time time,
  location text,
  topic text,
  notes text,
  /** Identifiant stable de l'invitation (ICS) : une mise à jour remplace la même rencontre dans l'agenda. */
  invite_uid text not null default gen_random_uuid()::text,
  invite_sequence int not null default 0,
  invite_sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table coach_meetings enable row level security;
create policy "head_coach uniquement - coach_meetings" on coach_meetings for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));
grant select, insert, update, delete on public.coach_meetings to authenticated;
grant select, insert, update, delete on public.coach_meetings to service_role;

create table if not exists coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_contacts(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);
alter table coach_notes enable row level security;
create policy "head_coach uniquement - coach_notes" on coach_notes for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));
grant select, insert, update, delete on public.coach_notes to authenticated;
grant select, insert, update, delete on public.coach_notes to service_role;
notify pgrst, 'reload schema';
