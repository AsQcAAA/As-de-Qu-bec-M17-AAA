-- Migration 020 — à exécuter dans l'éditeur SQL de Supabase.
--
-- 1) Situation de jeu d'un but : égalité numérique, avantage ou désavantage.
--    La feuille de la ligue ne la donne pas but par but ; on la déduit des
--    punitions actives au moment du but (voir src/lib/gameSheet.ts).
--
-- 2) Unités spéciales, prises directement sur la feuille : les champs
--    « A.N: 0 en 3 » et « D.N: 1 en 1 » donnent buts/occasions en avantage
--    numérique et arrêts/occasions en désavantage. Les stocker évite de
--    recalculer une efficacité à partir de données partielles.
--
--    % avantage numérique  = buts en AN / occasions en AN × 100
--    % désavantage         = punitions tuées / fois en infériorité × 100

alter table game_events add column if not exists situation text
  check (situation in ('even', 'pp', 'sh'));

comment on column game_events.situation is
  'Buts seulement : even = à forces égales, pp = avantage numérique, sh = désavantage.';

alter table games add column if not exists pp_goals int;
alter table games add column if not exists pp_opportunities int;
alter table games add column if not exists pk_kills int;
alter table games add column if not exists pk_opportunities int;
