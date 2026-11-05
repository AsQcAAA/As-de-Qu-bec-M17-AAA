-- Migration 062 — suivi d'activité des coachs : clics et caractères ajoutés, par jour.
--
-- Aucun contenu n'est enregistré : seulement des compteurs. L'entraîneur-chef voit tout le
-- monde (classement, rapport mensuel) ; un adjoint ne voit que ses propres lignes.
-- Les compteurs montent via la fonction bump_activity(), qui n'écrit que pour la personne
-- connectée (auth.uid()), jamais pour une autre.

create table if not exists activity_daily (
  user_id uuid not null references coach_profiles(id) on delete cascade,
  day date not null,
  clicks int not null default 0,
  chars int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists idx_activity_daily_day on activity_daily (day);

alter table activity_daily enable row level security;
create policy "lecture activité - soi ou entraîneur-chef" on activity_daily for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from coach_profiles c where c.id = auth.uid() and c.role = 'head_coach')
  );

grant select on activity_daily to authenticated;
grant select, insert, update, delete on activity_daily to service_role;

create or replace function bump_activity(p_clicks int, p_chars int) returns void
language sql security definer set search_path = public as $$
  insert into activity_daily (user_id, day, clicks, chars)
  select auth.uid(), (now() at time zone 'America/Toronto')::date, least(greatest(p_clicks, 0), 5000), least(greatest(p_chars, 0), 50000)
  where auth.uid() is not null and exists (select 1 from coach_profiles where id = auth.uid())
  on conflict (user_id, day) do update
    set clicks = activity_daily.clicks + excluded.clicks,
        chars = activity_daily.chars + excluded.chars,
        updated_at = now();
$$;
revoke all on function bump_activity(int, int) from public;
grant execute on function bump_activity(int, int) to authenticated;
