-- Migration 040 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Dernière activité des entraîneurs : la date de leur dernière visite dans
-- l'app (et non de leur dernière connexion — une session reste ouverte
-- plusieurs jours). L'app appelle touch_coach_seen() à l'ouverture d'une page,
-- au plus une fois toutes les 5 minutes.

alter table coach_profiles add column if not exists last_seen_at timestamptz;

create or replace function touch_coach_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update coach_profiles set last_seen_at = now() where id = auth.uid();
$$;

revoke all on function touch_coach_seen() from public;
grant execute on function touch_coach_seen() to authenticated;
