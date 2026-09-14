-- Migration 017 — à exécuter dans l'éditeur SQL de Supabase.
--
-- L'alignement conserve une case par position (10 attaquants, 7 défenseurs,
-- 2 gardiens) : l'indice dans player_ids est la case, et une case vide doit
-- pouvoir rester vide pour que les trios gardent leur découpage.
--
-- La colonne était de type uuid[], donc Postgres refusait la chaîne vide qui
-- marque une case libre :
--     invalid input syntax for type uuid: ""
-- L'écriture entière était rejetée. Les panneaux complets (défenseurs 7/7,
-- gardiens 2/2) s'enregistraient ; les attaquants, jamais remplis à 10/10,
-- ne s'enregistraient jamais — sans le moindre message d'erreur.
--
-- text[] accepte les cases vides tout en continuant de stocker des UUID.

alter table lineup_units
  alter column player_ids type text[] using player_ids::text[];

alter table lineup_units
  alter column player_ids set default '{}';
