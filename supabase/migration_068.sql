-- Migration 068 — Suivi scolaire (onglet Direction générale) : les 5 équipes
-- de l'organisation, leurs joueurs, les périodes étoilées convoquées par
-- l'école (depuis le 1er septembre) et les résultats d'étape.
-- Réservé à l'entraîneur-chef (même règle que dg_notes).

create table if not exists school_teams (
  code text primary key,
  name text not null,
  coach_name text,
  coach_emails text[] not null default '{}',
  -- Transférer automatiquement à l'entraîneur les convocations reçues de l'école.
  forward_enabled boolean not null default false,
  sort integer not null default 0,
  last_bilan_sent_at timestamptz
);

create table if not exists school_roster (
  id uuid primary key default gen_random_uuid(),
  team_code text not null references school_teams(code) on delete cascade,
  jersey integer,
  first_name text not null,
  last_name text not null,
  full_name text not null,
  position text,
  -- Niveau scolaire, seulement quand il faut départager deux homonymes.
  sec integer,
  unique (team_code, full_name)
);

create table if not exists school_star_periods (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references school_roster(id) on delete cascade,
  period_date date not null,
  start_time text,
  end_time text,
  status text not null default 'convoquee' check (status in ('convoquee', 'annulee')),
  source text not null default 'courriel',
  source_ref text,
  forwarded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists school_star_periods_unique
  on school_star_periods (roster_id, period_date, coalesce(start_time, ''));
create index if not exists idx_school_star_periods_date on school_star_periods (period_date);

create table if not exists school_term_results (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references school_roster(id) on delete cascade,
  term integer not null,
  average integer,
  -- [{ "s": "MAT", "v": 67 }, ...] dans l'ordre du relevé.
  grades jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (roster_id, term)
);

alter table school_teams enable row level security;
alter table school_roster enable row level security;
alter table school_star_periods enable row level security;
alter table school_term_results enable row level security;

create policy "head_coach uniquement - school_teams" on school_teams for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));
create policy "head_coach uniquement - school_roster" on school_roster for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));
create policy "head_coach uniquement - school_star_periods" on school_star_periods for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));
create policy "head_coach uniquement - school_term_results" on school_term_results for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));

grant select, insert, update, delete on public.school_teams to authenticated, service_role;
grant select, insert, update, delete on public.school_roster to authenticated, service_role;
grant select, insert, update, delete on public.school_star_periods to authenticated, service_role;
grant select, insert, update, delete on public.school_term_results to authenticated, service_role;

-- Les données (équipes, joueurs, historique depuis septembre, 1re étape)
-- sont dans migration_068_data.sql.
