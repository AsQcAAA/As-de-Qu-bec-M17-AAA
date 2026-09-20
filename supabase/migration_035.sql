-- Migration 035 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Pratique du jour : plutôt que 7 blocs (exercice / minutes / détails), une
-- seule case de notes libre où lister les exercices. Les blocs déjà saisis
-- sont recopiés dans la case, un exercice par ligne, pour ne rien perdre.

create table if not exists practice_notes (
  practice_date date primary key,
  content text not null default '',
  updated_at timestamptz not null default now()
);
alter table practice_notes enable row level security;
create policy "authenticated - practice_notes" on practice_notes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into practice_notes (practice_date, content)
select
  practice_date,
  string_agg(
    trim(concat_ws(' ',
      title,
      case when duration_minutes is not null then '(' || duration_minutes || ' min)' end,
      case when coalesce(description, '') <> '' then '— ' || description end
    )),
    E'\n' order by position
  )
from practice_blocks
where coalesce(title, '') <> '' or coalesce(description, '') <> ''
group by practice_date
on conflict (practice_date) do nothing;
