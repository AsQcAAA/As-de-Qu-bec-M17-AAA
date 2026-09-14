-- Migration 024 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Plus/moins : qui était sur la glace à chaque but.
--
-- La feuille « Sommaire du match » est remplie à la main pendant la partie et
-- photographiée après. La photo n'est pas une source de données : elle sert de
-- pièce justificative, et les numéros sont saisis dans l'application. C'est
-- cette saisie qui fait foi.
--
-- Rien n'est pré-calculé : on garde la liste des joueurs sur la glace à chaque
-- but, et le +/- se recalcule à l'affichage. Une correction sur un but se
-- répercute donc partout, sans reprise de totaux.

-- Troisième type de document téléversé après un match.
alter table game_documents drop constraint if exists game_documents_doc_type_check;
alter table game_documents add constraint game_documents_doc_type_check
  check (doc_type in ('feuille_match', 'stats_avancees', 'plus_moins'));

create table if not exists on_ice_goals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  -- 'us' : un but des As (+1) — 'opponent' : un but encaissé (-1).
  side text not null check (side in ('us', 'opponent')),
  -- Ordre d'apparition sur la feuille, pour retrouver la ligne d'un coup d'œil.
  goal_order int not null,
  jersey_numbers int[] not null default '{}',
  -- Situation du but : 'even', 'shorthanded', 'powerplay', 'penalty_shot'.
  situation text not null default 'even',
  -- Un but en avantage numérique, sur tir de pénalité ou en tirs de barrage ne
  -- compte pour personne. La ligne est conservée quand même : elle documente
  -- qui était sur la glace, et la règle reste modifiable après coup.
  counts boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  unique (game_id, side, goal_order)
);

alter table on_ice_goals enable row level security;
create policy "authenticated - on_ice_goals" on on_ice_goals for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
