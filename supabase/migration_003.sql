-- Migration 003 — à exécuter dans l'éditeur SQL de Supabase.
-- Ajoute : notes mensuelles (export PDF calendrier) et mises en jeu par zone
-- (carte thermique, saisie manuelle depuis les rapports PDF post-match).
-- Le temps de glace (TOI) par joueur/match existe déjà (player_game_stats.toi_minutes).

create table if not exists monthly_notes (
  month text primary key, -- format 'YYYY-MM'
  notes text,
  updated_at timestamptz not null default now()
);

-- Responsabilité de chaque joueur (texte libre — liste des responsabilités à venir).
alter table players add column if not exists responsibility text;

-- Joueurs M17 envoyés coacher à la Farandole, par vendredi de la saison.
create table if not exists farandole_assignments (
  assignment_date date primary key,
  player_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

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

alter table monthly_notes enable row level security;
alter table game_zone_stats enable row level security;
alter table farandole_assignments enable row level security;

create policy "authenticated - monthly_notes" on monthly_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - game_zone_stats" on game_zone_stats for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated - farandole_assignments" on farandole_assignments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
