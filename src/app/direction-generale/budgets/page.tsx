"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { BudgetCategory, BudgetExpense, BudgetTeam } from "@/lib/types";

const TEAM_LABEL: Record<BudgetTeam, string> = { as: "As de Québec", chevaliers: "Chevaliers" };

const emptyCategoryForm = { name: "", allocated_amount: "" };
const emptyExpenseForm = () => ({
  description: "",
  amount: "",
  supplier: "",
  expense_date: format(new Date(), "yyyy-MM-dd"),
});

function money(n: number): string {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

// Page protégée par RLS (migration_033.sql) : seul l'entraîneur-chef peut
// lire/écrire budget_categories et budget_expenses, même politique que
// dg_notes — un adjoint qui arrive quand même sur cette URL ne voit rien.
export default function BudgetsPage() {
  const supabase = createClient();
  const [team, setTeam] = useState<BudgetTeam>("as");
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [savingCategory, setSavingCategory] = useState(false);

  const [expenseTargetId, setExpenseTargetId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());
  const [savingExpense, setSavingExpense] = useState(false);

  async function load() {
    const [{ data: cats }, { data: exps }] = await Promise.all([
      supabase.from("budget_categories").select("*").order("created_at"),
      supabase.from("budget_expenses").select("*").order("expense_date", { ascending: false }),
    ]);
    setCategories(cats ?? []);
    setExpenses(exps ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const teamCategories = useMemo(() => categories.filter((c) => c.team === team), [categories, team]);
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, BudgetExpense[]>();
    for (const e of expenses) {
      const list = map.get(e.category_id) ?? [];
      list.push(e);
      map.set(e.category_id, list);
    }
    return map;
  }, [expenses]);

  const teamTotals = useMemo(() => {
    let allocated = 0;
    let spent = 0;
    for (const c of teamCategories) {
      allocated += c.allocated_amount;
      spent += (expensesByCategory.get(c.id) ?? []).reduce((n, e) => n + e.amount, 0);
    }
    return { allocated, spent, remaining: allocated - spent };
  }, [teamCategories, expensesByCategory]);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(categoryForm.allocated_amount);
    if (!categoryForm.name.trim() || Number.isNaN(amount)) return;
    setSavingCategory(true);
    await supabase.from("budget_categories").insert({ team, name: categoryForm.name.trim(), allocated_amount: amount });
    setSavingCategory(false);
    setCategoryForm(emptyCategoryForm);
    setShowCategoryForm(false);
    load();
  }

  async function removeCategory(id: string) {
    await supabase.from("budget_categories").delete().eq("id", id);
    load();
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expenseTargetId) return;
    const amount = Number(expenseForm.amount);
    if (!expenseForm.description.trim() || Number.isNaN(amount)) return;
    setSavingExpense(true);
    await supabase.from("budget_expenses").insert({
      category_id: expenseTargetId,
      description: expenseForm.description.trim(),
      amount,
      supplier: expenseForm.supplier.trim() || null,
      expense_date: expenseForm.expense_date,
    });
    setSavingExpense(false);
    setExpenseForm(emptyExpenseForm());
    setExpenseTargetId(null);
    load();
  }

  async function removeExpense(id: string) {
    await supabase.from("budget_expenses").delete().eq("id", id);
    load();
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/direction-generale" className="text-sm text-ink-800 hover:text-gold-700 font-medium hover:underline">
          ← Direction générale
        </Link>
        <h1 className="text-2xl font-bold mt-1">Budgets</h1>
        <p className="text-slate-400 text-sm">
          Visible seulement par toi (entraîneur-chef) — un poste budgétaire par ligne de dépense (arbitres,
          équipement, déplacements...), avec le solde restant calculé automatiquement.
        </p>
      </div>

      <div className="flex gap-2">
        {(Object.keys(TEAM_LABEL) as BudgetTeam[]).map((t) => (
          <button
            key={t}
            onClick={() => setTeam(t)}
            className={`px-4 py-2 rounded-md font-medium text-sm border ${
              team === t ? "bg-gold-500 text-ink-900 border-gold-400" : "bg-white text-ink-800 border-slate-300"
            }`}
          >
            {TEAM_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="card grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-black">{money(teamTotals.allocated)}</div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Budget total</div>
        </div>
        <div>
          <div className="text-2xl font-black">{money(teamTotals.spent)}</div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Dépensé</div>
        </div>
        <div>
          <div className={`text-2xl font-black ${teamTotals.remaining < 0 ? "text-red-600" : "text-gold-600"}`}>
            {money(teamTotals.remaining)}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Restant</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn" onClick={() => setShowCategoryForm((s) => !s)}>
          {showCategoryForm ? "Annuler" : "+ Poste budgétaire"}
        </button>
      </div>

      {showCategoryForm && (
        <form onSubmit={addCategory} className="card grid sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="label">Nom du poste</label>
            <input
              className="input"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="Ex. Arbitres, Équipement, Déplacements..."
              required
            />
          </div>
          <div>
            <label className="label">Budget alloué ($)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={categoryForm.allocated_amount}
              onChange={(e) => setCategoryForm({ ...categoryForm, allocated_amount: e.target.value })}
              required
            />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className="btn" disabled={savingCategory}>
              {savingCategory ? "Enregistrement..." : "Ajouter le poste"}
            </button>
          </div>
        </form>
      )}

      {teamCategories.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun poste budgétaire pour {TEAM_LABEL[team]} — ajoutes-en un ci-dessus.</p>
      ) : (
        <div className="space-y-4">
          {teamCategories.map((cat) => {
            const catExpenses = expensesByCategory.get(cat.id) ?? [];
            const spent = catExpenses.reduce((n, e) => n + e.amount, 0);
            const remaining = cat.allocated_amount - spent;
            return (
              <div key={cat.id} className="card space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="font-semibold">{cat.name}</h2>
                    <p className="text-sm text-slate-500">
                      {money(spent)} dépensé sur {money(cat.allocated_amount)} —{" "}
                      <span className={remaining < 0 ? "text-red-600 font-medium" : "font-medium"}>
                        {money(remaining)} restant
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary text-sm"
                      onClick={() => {
                        setExpenseTargetId(expenseTargetId === cat.id ? null : cat.id);
                        setExpenseForm(emptyExpenseForm());
                      }}
                    >
                      {expenseTargetId === cat.id ? "Annuler" : "+ Dépense"}
                    </button>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => removeCategory(cat.id)}>
                      Retirer le poste
                    </button>
                  </div>
                </div>

                {expenseTargetId === cat.id && (
                  <form onSubmit={addExpense} className="grid sm:grid-cols-4 gap-3 items-end border-t pt-3">
                    <div className="sm:col-span-2">
                      <label className="label">Description</label>
                      <input
                        className="input"
                        value={expenseForm.description}
                        onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="label">Fournisseur</label>
                      <input
                        className="input"
                        value={expenseForm.supplier}
                        onChange={(e) => setExpenseForm({ ...expenseForm, supplier: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Montant ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={expenseForm.amount}
                        onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Date</label>
                      <input
                        type="date"
                        className="input"
                        value={expenseForm.expense_date}
                        onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <button type="submit" className="btn" disabled={savingExpense}>
                        {savingExpense ? "Enregistrement..." : "Ajouter la dépense"}
                      </button>
                    </div>
                  </form>
                )}

                {catExpenses.length > 0 && (
                  <ul className="text-sm divide-y border-t pt-2">
                    {catExpenses.map((e) => (
                      <li key={e.id} className="flex items-center justify-between py-1.5 gap-2">
                        <span>
                          <span className="text-slate-400 tabular-nums mr-2">{e.expense_date}</span>
                          {e.description}
                          {e.supplier && <span className="text-slate-400"> — {e.supplier}</span>}
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          <span className="font-medium tabular-nums">{money(e.amount)}</span>
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeExpense(e.id)}>
                            Retirer
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
