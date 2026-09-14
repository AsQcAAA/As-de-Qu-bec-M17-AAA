-- As de Québec M17 AAA — schéma Supabase (PostgreSQL) — v2
-- À exécuter dans Supabase Studio > SQL Editor sur un projet neuf.
-- v2 : accès multi-utilisateurs via Supabase Auth (remplace le mot de passe
-- partagé), types d'activité étendus, groupes de couleur pour l'alignement,
-- et le gabarit de pratique à 7 cases.

create extension if not exists "pgcrypto";

-- ============ Profils des entraîneurs (liés à Supabase Auth) ============
create table if not exists coach_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'assistant' check (role in ('head_coach', 'assistant')),
  created_at timestamptz not null default now()
);

-- ============ Joueurs ============
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  jersey_number int,
  position text check (position in ('F', 'D', 'G')),
  active boolean not null default true,
  is_call_up boolean not null default false, -- remplaçant (joueur rappelé pour un match)
  photo_url text,
  height_cm int,
  weight_lbs int,
  -- Statistiques avancées (TPE) — saisie manuelle, pas d'API publique TPE.
  -- Représentent un instantané de la saison en cours, mis à jour par le coach.
  xg_per_60 numeric,
  toi_per_60 numeric,
  faceoff_pct numeric, -- pertinent si position = 'F'
  controlled_exits_pct numeric, -- pertinent si position = 'D'
  shots_on_goal_season int,
  responsibility text, -- responsabilité d'équipe assignée au joueur (texte libre)
  priority_order int, -- ordre personnalisé (glisser-déposer) pour la liste des joueurs
  objective_1 text, -- objectifs individuels fixés en début de saison
  objective_2 text,
  objective_3 text,
  tpe_profile_url text, -- lien direct vers la fiche joueur sur TPE
  created_at timestamptz not null default now()
);

-- ============ Horaire (pratiques, matchs, réunions, autres) ============
create table if not exists schedule_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  start_time time,
  end_time time,
  event_type text not null check (event_type in (
    'game', 'practice', 'team_meeting', 'individual_meeting',
    'team_building', 'pp_meeting', 'training', 'other'
  )),
  title text not null,
  location text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_schedule_events_date on schedule_events (event_date);

-- ============ Alignements (par journée/match) ============
create table if not exists lineups (
  id uuid primary key default gen_random_uuid(),
  lineup_date date not null,
  event_id uuid references schedule_events(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_lineups_date on lineups (lineup_date);

-- Unité/trio/paire/mise en jeu spéciale au sein d'un alignement.
-- color_group sépare les chandails du jour (ex: "Gris" / "Jaune") comme sur
-- les feuilles d'alignement du club ; unit_order fixe l'ordre d'affichage.
create table if not exists lineup_units (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references lineups(id) on delete cascade,
  unit_type text not null check (unit_type in ('forward_line', 'defense_pair', 'powerplay', 'penalty_kill')),
  unit_label text not null, -- ex: "Trio 1", "Paire 2", "AN 1"
  color_group text, -- ex: "Gris", "Jaune"
  unit_order int not null default 0,
  player_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_lineup_units_lineup on lineup_units (lineup_id);

-- ============ Matchs / résultats ============
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  opponent text not null,
  location text,
  is_home boolean default true,
  result text check (result in ('W', 'L', 'OTL', 'SOL', 'T')),
  goals_for int,
  goals_against int,
  external_link text, -- lien vers le site de stats/ligue
  lineup_id uuid references lineups(id) on delete set null,
  notes text,
  -- Plan de match : 4 points clés archivés pour ce match (remplace le
  -- gabarit de pratique les jours de match).
  plan_point_1 text,
  plan_point_2 text,
  plan_point_3 text,
  plan_point_4 text,
  bus_departure_time time, -- heure de départ en autobus depuis l'Aréna Duberger (matchs à voyage)
  category text not null default 'saison_reguliere' check (category in ('hors_concours', 'saison_reguliere', 'series', 'tournoi')),
  created_at timestamptz not null default now()
);
create index if not exists idx_games_date on games (game_date);

-- Statistiques par unité, pour un match donné (permet le cumulatif combos)
create table if not exists game_unit_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  lineup_unit_id uuid references lineup_units(id) on delete set null,
  unit_type text not null check (unit_type in ('forward_line', 'defense_pair', 'powerplay', 'penalty_kill')),
  unit_label text not null,
  player_ids uuid[] not null default '{}',
  goals_for int not null default 0,
  goals_against int not null default 0,
  plus_minus int generated always as (goals_for - goals_against) stored,
  shifts int,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_game_unit_stats_game on game_unit_stats (game_id);
create index if not exists idx_game_unit_stats_players on game_unit_stats using gin (player_ids);

-- ============ Réunions (individuelles et collectives) ============
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  meeting_type text not null check (meeting_type in ('individual', 'collective')),
  player_id uuid references players(id) on delete set null, -- null si collective
  topic text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_meetings_player on meetings (player_id);
create index if not exists idx_meetings_date on meetings (meeting_date);
-- Une seule rencontre individuelle par joueur/jour (le quick-tap fait un toggle).
create unique index if not exists idx_meetings_individual_unique
  on meetings (meeting_date, player_id)
  where meeting_type = 'individual';

-- ============ Rapport quotidien cumulé ============
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  energy_level int check (energy_level between 1 and 5),
  team_mood text,
  injuries text,
  academic_notes text,
  key_events text,
  coach_notes text,
  practice_theme text,
  meeting_theme text,
  submitted_at timestamptz not null default now()
);

-- ============ Thème de pratique hebdomadaire (popup lundi 8h) ============
create table if not exists weekly_themes (
  week_start date primary key,
  theme text,
  notes text,
  created_at timestamptz not null default now()
);

-- ============ Journal Team Building (thème + notes par journée) ============
create table if not exists team_building_log (
  log_date date primary key,
  theme text,
  notes text,
  created_at timestamptz not null default now()
);

-- ============ Gabarit de pratique (7 cases ordonnées) ============
create table if not exists practice_blocks (
  id uuid primary key default gen_random_uuid(),
  practice_date date not null,
  position int not null check (position between 1 and 7),
  title text,
  duration_minutes int,
  description text,
  created_at timestamptz not null default now(),
  unique (practice_date, position)
);
create index if not exists idx_practice_blocks_date on practice_blocks (practice_date);

-- ============ Absences ============
create table if not exists absences (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  absence_date date not null,
  reason text check (reason in ('malade', 'blesse', 'ecole', 'remplacement_m18', 'non_justifie')),
  created_at timestamptz not null default now(),
  unique (player_id, absence_date)
);
create index if not exists idx_absences_player on absences (player_id);
create index if not exists idx_absences_date on absences (absence_date);

-- Marque qu'un jour donné a été passé en revue via le popup d'absences
-- (même s'il n'y avait aucun absent) — évite que le popup ne réapparaisse.
create table if not exists daily_checks (
  check_date date primary key,
  completed_at timestamptz not null default now()
);

-- ============ Statistiques de match par joueur (game log) ============
-- Saisie manuelle par le coach après chaque match (aucune API publique
-- LHEQ/TPE) : alimente le "game log" des 5 derniers matchs sur la fiche
-- joueur.
create table if not exists player_game_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  goals int not null default 0,
  assists int not null default 0,
  toi_minutes numeric,
  shots_on_goal int,
  created_at timestamptz not null default now(),
  unique (player_id, game_id)
);
create index if not exists idx_player_game_stats_player on player_game_stats (player_id);
create index if not exists idx_player_game_stats_game on player_game_stats (game_id);

-- ============ Notes mensuelles (export PDF calendrier pour les parents) ============
create table if not exists monthly_notes (
  month text primary key, -- format 'YYYY-MM'
  notes text,
  updated_at timestamptz not null default now()
);

-- ============ Mises en jeu par zone (carte thermique, saisie manuelle post-match) ============
create table if not exists game_zone_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  zone text not null check (zone in ('offensive', 'neutre', 'defensive')),
  faceoffs_won int not null default 0,
  faceoffs_lost int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, zone)
);
create index if not exists idx_game_zone_stats_game on game_zone_stats (game_id);

-- ============ Farandole — joueurs M17 envoyés coacher, par vendredi ============
create table if not exists farandole_assignments (
  assignment_date date primary key,
  player_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ============ Notes par jour (export mensuel du calendrier) ============
create table if not exists calendar_day_notes (
  day date primary key,
  notes text,
  updated_at timestamptz not null default now()
);

-- ============ Responsabilités — catégories glisser-déposer ============
create table if not exists responsibility_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Historique daté des assignations — une responsabilité peut être re-loguée
-- plusieurs fois dans l'année (une par date, par joueur).
create table if not exists responsibility_log (
  id uuid primary key default gen_random_uuid(),
  log_date date not null,
  player_id uuid not null references players(id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now(),
  unique (log_date, player_id)
);
create index if not exists idx_responsibility_log_date on responsibility_log (log_date);
create index if not exists idx_responsibility_log_player on responsibility_log (player_id);

-- ============ Tests physiques ============
-- test_name est du texte libre (ex: "Saut vertical", "Sprint 40m") pour ne
-- pas limiter les types de tests. higher_is_better détermine le sens du
-- classement (ex: true pour un saut, false pour un temps de sprint).
create table if not exists player_test_results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  test_name text not null,
  value numeric not null,
  unit text,
  higher_is_better boolean not null default true,
  test_date date not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_player_test_results_player on player_test_results (player_id);
create index if not exists idx_player_test_results_name on player_test_results (test_name);

-- ============ Pre-scout adversaires (Statistiques avancées) ============
-- team_slug identifie une des 20 équipes M17 AAA de la LHEQ (voir
-- src/lib/lheqTeams.ts). Le record/5 derniers matchs sont saisis
-- manuellement en attendant le début de la saison (pas d'API LHEQ publique).
create table if not exists scout_notes (
  id uuid primary key default gen_random_uuid(),
  team_slug text not null unique,
  wins int,
  losses int,
  otl_losses int,
  last5 text,
  notes text,
  updated_at timestamptz not null default now()
);

-- ============ Médical (blessures) ============
create table if not exists injuries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete set null,
  injury_date date not null,
  description text not null,
  severity text check (severity in ('legere', 'moderee', 'grave')),
  status text not null default 'active' check (status in ('active', 'resolue')),
  notes text,
  reported_by uuid references coach_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_injuries_player on injuries (player_id);
create index if not exists idx_injuries_status on injuries (status);

-- ============ RLS ============
-- Accès multi-utilisateurs : toute personne authentifiée (compte invité par
-- un entraîneur-chef via Supabase Auth) peut lire/écrire les données
-- d'équipe. Il n'y a pas de séparation de données par utilisateur — c'est
-- un seul groupe d'entraîneurs qui partage tout. coach_profiles est en
-- lecture pour tous les authentifiés ; les écritures se font uniquement
-- via la clé de service (route d'invitation), jamais depuis le navigateur.
alter table coach_profiles enable row level security;
alter table players enable row level security;
alter table schedule_events enable row level security;
alter table lineups enable row level security;
alter table lineup_units enable row level security;
alter table games enable row level security;
alter table game_unit_stats enable row level security;
alter table meetings enable row level security;
alter table daily_reports enable row level security;
alter table weekly_themes enable row level security;
alter table team_building_log enable row level security;
alter table practice_blocks enable row level security;
alter table injuries enable row level security;
alter table scout_notes enable row level security;
alter table absences enable row level security;
alter table player_game_stats enable row level security;
alter table player_test_results enable row level security;
alter table daily_checks enable row level security;
alter table monthly_notes enable row level security;
alter table game_zone_stats enable row level security;
alter table farandole_assignments enable row level security;
alter table responsibility_categories enable row level security;
alter table responsibility_log enable row level security;
alter table calendar_day_notes enable row level security;

create policy "read own team - coach_profiles" on coach_profiles for select using (auth.role() = 'authenticated');
create policy "authenticated - players" on players for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - schedule_events" on schedule_events for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - lineups" on lineups for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - lineup_units" on lineup_units for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - games" on games for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - game_unit_stats" on game_unit_stats for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - meetings" on meetings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - daily_reports" on daily_reports for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - weekly_themes" on weekly_themes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - team_building_log" on team_building_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - practice_blocks" on practice_blocks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - injuries" on injuries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - scout_notes" on scout_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - absences" on absences for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - player_game_stats" on player_game_stats for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - player_test_results" on player_test_results for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - daily_checks" on daily_checks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - monthly_notes" on monthly_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - game_zone_stats" on game_zone_stats for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - farandole_assignments" on farandole_assignments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - responsibility_categories" on responsibility_categories for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - responsibility_log" on responsibility_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - calendar_day_notes" on calendar_day_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
