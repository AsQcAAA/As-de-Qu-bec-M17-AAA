-- Migration 057 — appliquée via le connecteur Supabase.
--
-- Vue TV d'une journée : quelles unités de l'onglet Power Play afficher (et quelles phases :
-- 0 = in-zone, 1 = breakout, 2 = faceoff), au choix du coach, jour par jour.
--   units : [{ "date": "2026-10-22", "label": "PP1" }, …]

create table if not exists day_pp_display (
  day date primary key,
  units jsonb not null default '[]'::jsonb,
  phases jsonb not null default '[0]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table day_pp_display enable row level security;
create policy "authenticated - day_pp_display" on day_pp_display for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on public.day_pp_display to authenticated;
grant select, insert, update, delete on public.day_pp_display to service_role;
notify pgrst, 'reload schema';
