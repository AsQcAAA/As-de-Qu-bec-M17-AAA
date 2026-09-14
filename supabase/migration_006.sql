-- Migration 006 — à exécuter dans l'éditeur SQL de Supabase.
-- Remplace le champ unique players.responsibility par un historique daté :
-- une responsabilité peut être re-loguée plusieurs fois dans l'année.

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

alter table responsibility_log enable row level security;
create policy "authenticated - responsibility_log" on responsibility_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
