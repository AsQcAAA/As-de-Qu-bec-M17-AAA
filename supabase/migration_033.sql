-- Migration 033 — à exécuter dans l'éditeur SQL de Supabase.
--
-- Onglet Direction générale : suivi des budgets de saison pour les As et les
-- Chevaliers. Un poste budgétaire (ex. "Arbitres", "Équipement") reçoit un
-- montant alloué ; chaque dépense qui lui est rattachée réduit le solde
-- restant. Réservé à l'entraîneur-chef, même politique que dg_notes.

create table if not exists budget_categories (
  id uuid primary key default gen_random_uuid(),
  team text not null check (team in ('as', 'chevaliers')),
  name text not null,
  allocated_amount numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_budget_categories_team on budget_categories (team);
alter table budget_categories enable row level security;
create policy "head_coach uniquement - budget_categories" on budget_categories for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));

create table if not exists budget_expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references budget_categories(id) on delete cascade,
  description text not null,
  amount numeric not null,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_budget_expenses_category on budget_expenses (category_id);
alter table budget_expenses enable row level security;
create policy "head_coach uniquement - budget_expenses" on budget_expenses for all
  using (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'))
  with check (exists (select 1 from coach_profiles cp where cp.id = auth.uid() and cp.role = 'head_coach'));
