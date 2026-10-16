"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { money, normText, type DistDocument, type DistPerson } from "@/lib/dgDocuments";

const sumTasks = (p: DistPerson) => p.tasks.reduce((n, t) => n + (t.montant ?? 0), 0);

const ASSISTANTS_BLOCK = "adjoints temps partiel";
const TEAM_PREFIX = /^(M\d{2}\s+(?:AAA\s+Élite|AAA|Élite|D\d+(?:\s+R(?:elève)?)?))\s*[:\-]?\s*(.+)$/i;

/**
 * Dans le fichier, les adjoints à temps partiel sont regroupés dans un seul bloc :
 * chaque ligne est « équipe + nom » (ex. « M17 AAA Jeff St-Louis »). On les
 * sépare pour que chacun ait sa propre entrée, avec son salaire total (un adjoint
 * peut avoir plusieurs équipes).
 */
function splitAssistants(block: DistPerson, existing: Set<string>): DistPerson[] {
  const byName = new Map<string, DistPerson>();
  for (const t of block.tasks) {
    let team = t.label.trim();
    let name = "";
    const m = t.label.trim().match(TEAM_PREFIX);
    if (m) {
      team = m[1].replace(/\s+/g, " ");
      name = m[2].trim();
    } else if (t.label.includes(" - ")) {
      const [a, b] = t.label.split(" - ");
      team = a.trim();
      name = b.trim();
    }
    if (!name) name = t.label.trim();
    // Poste sans nom (« ??? ») : une entrée distincte par poste plutôt qu'un seul « ??? ».
    const unnamed = /^\?+$/.test(name);
    if (unnamed) name = `À déterminer — ${team}${byName.has(normText(`À déterminer — ${team}`)) ? " (2)" : ""}`;
    // Un adjoint déjà listé avec ses propres tâches (montant « inclus » ici) n'est pas doublé.
    if (t.montant === null && existing.has(normText(name))) continue;
    const key = normText(name);
    const person =
      byName.get(key) ?? { name, group: "Adjoint temps partiel", status: null, tasks: [], notes: [], sheetTotal: null };
    person.tasks.push({ label: team, montant: t.montant, das: t.das, total: t.total, details: [] });
    byName.set(key, person);
  }
  return [...byName.values()];
}

/**
 * Distribution monétaire 2026-27 (première feuille du fichier du Drive) : chaque
 * employé avec le montant octroyé pour chaque tâche. Réservé à l'entraîneur-chef.
 */
export default function DistributionPage() {
  const supabase = createClient();
  const [doc, setDoc] = useState<DistDocument | null>(null);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("__all__");
  const [showDas, setShowDas] = useState(false);
  const [sortBy, setSortBy] = useState<"file" | "name" | "amount">("file");

  useEffect(() => {
    supabase
      .from("dg_documents")
      .select("data, imported_at")
      .eq("slug", "distribution-monetaire-26-27")
      .maybeSingle()
      .then(({ data }) => {
        setDoc((data?.data as DistDocument | undefined) ?? null);
        setImportedAt(data?.imported_at ?? null);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tous les employés : les personnes du fichier, plus chaque adjoint à temps partiel séparé. */
  const everyone = useMemo<DistPerson[]>(() => {
    const raw = doc?.people ?? [];
    const named = new Set(raw.filter((p) => normText(p.name) !== ASSISTANTS_BLOCK).map((p) => normText(p.name)));
    const out: DistPerson[] = [];
    for (const p of raw) {
      if (normText(p.name) === ASSISTANTS_BLOCK) out.push(...splitAssistants(p, named));
      else out.push(p);
    }
    return out;
  }, [doc]);

  const q = normText(search);
  const list = useMemo(() => {
    let l = everyone.filter((p) => !q || normText(p.name).includes(q) || p.tasks.some((t) => normText(t.label).includes(q)));
    if (sortBy === "name") l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "amount") l = [...l].sort((a, b) => sumTasks(b) - sumTasks(a));
    return l;
  }, [everyone, q, sortBy]);

  const keyOf = (p: DistPerson) => `${p.group}|${p.name}`;
  const current = selected === "__all__" ? null : everyone.find((p) => keyOf(p) === selected) ?? null;
  const groups = [...new Set(list.map((p) => p.group))];
  const grandTotal = everyone.reduce((n, p) => n + sumTasks(p), 0);

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  function detail(p: DistPerson) {
    return (
      <section key={keyOf(p)} className="card space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg">{p.name}</h2>
            <div className="text-xs text-slate-500">
              {p.group}
              {p.status ? ` · ${p.status}` : ""}
              {p.notes.length > 0 ? ` · ${p.notes.join(", ")}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black tabular-nums">{money(sumTasks(p))}</div>
            {showDas && p.sheetTotal && (
              <div className="text-xs text-slate-500">
                DAS {money(p.sheetTotal.das)} · Total {money(p.sheetTotal.total)}
              </div>
            )}
            {p.sheetTotal?.montant != null && Math.abs(p.sheetTotal.montant - sumTasks(p)) > 0.5 && (
              <div className="text-[11px] text-amber-600" title="Le total inscrit dans le fichier diffère de la somme des tâches">
                Total du fichier : {money(p.sheetTotal.montant)}
              </div>
            )}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-1.5 pr-4">{p.group === "Adjoint temps partiel" ? "Équipe / rôle" : "Tâche"}</th>
              <th className="py-1.5 px-3 text-right">Montant</th>
              {showDas && <th className="py-1.5 px-3 text-right">DAS</th>}
              {showDas && <th className="py-1.5 pl-3 text-right">Total</th>}
            </tr>
          </thead>
          <tbody>
            {p.tasks.map((t, i) => (
              <tr key={i} className="border-b last:border-0 align-top">
                <td className="py-1.5 pr-4">
                  {t.label}
                  {t.details.length > 0 && <span className="block text-[11px] text-slate-400">{t.details.join(" · ")}</span>}
                </td>
                <td className="py-1.5 px-3 text-right font-semibold tabular-nums whitespace-nowrap">{money(t.montant)}</td>
                {showDas && <td className="py-1.5 px-3 text-right tabular-nums text-slate-500">{money(t.das)}</td>}
                {showDas && <td className="py-1.5 pl-3 text-right tabular-nums text-slate-500">{money(t.total)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/direction-generale" className="text-sm text-gold-400 hover:underline">
          ← Direction générale
        </Link>
        <h1 className="text-2xl font-bold">Distribution monétaire 2026-27</h1>
        <p className="text-slate-400 text-sm">
          Chaque employé et le montant octroyé par tâche.
          {importedAt && <> Importé le {format(new Date(importedAt), "d MMMM yyyy", { locale: fr })}.</>}
        </p>
      </div>

      {!doc || everyone.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune donnée importée pour l&apos;instant.</p>
      ) : (
        <div className="grid md:grid-cols-[18rem_1fr] gap-5 items-start">
          {/* Choix d'un employé : liste cliquable (menu déroulant sur petit écran). */}
          <aside className="space-y-3 md:sticky md:top-4">
            <input className="input" placeholder="Rechercher un employé ou une tâche…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input md:hidden" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="__all__">👥 Tous les employés</option>
              {list.map((p) => (
                <option key={keyOf(p)} value={keyOf(p)}>
                  {p.name} — {money(sumTasks(p))}
                </option>
              ))}
            </select>
            <div className="hidden md:block card p-2 max-h-[70vh] overflow-y-auto">
              <button
                onClick={() => setSelected("__all__")}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm font-bold ${selected === "__all__" ? "bg-gold-500 text-ink-900" : "hover:bg-slate-100"}`}
              >
                👥 Tous les employés ({list.length})
              </button>
              {groups.map((g) => (
                <div key={g} className="mt-2">
                  <div className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{g}</div>
                  {list
                    .filter((p) => p.group === g)
                    .map((p) => (
                      <button
                        key={keyOf(p)}
                        onClick={() => setSelected(keyOf(p))}
                        className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm text-left ${
                          selected === keyOf(p) ? "bg-gold-500 text-ink-900 font-bold" : "hover:bg-slate-100"
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="tabular-nums text-xs shrink-0">{money(sumTasks(p))}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={showDas} onChange={(e) => setShowDas(e.target.checked)} />
              Afficher aussi les DAS (12 %) et le total
            </label>
          </aside>

          <div className="space-y-4 min-w-0">
            {current ? (
              detail(current)
            ) : (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="card">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Employés</div>
                    <div className="text-2xl font-black">{everyone.length}</div>
                  </div>
                  <div className="card">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Total des tâches</div>
                    <div className="text-2xl font-black">{money(grandTotal)}</div>
                    <div className="text-xs text-slate-400">Avant DAS</div>
                  </div>
                  <div className="card">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Tri</div>
                    <select className="input mt-1" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                      <option value="file">Ordre du fichier</option>
                      <option value="name">Nom</option>
                      <option value="amount">Montant (du plus élevé)</option>
                    </select>
                  </div>
                </div>

                <section className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="py-2 pr-4">Employé</th>
                        <th className="py-2 pr-4">Statut</th>
                        <th className="py-2 px-3 text-right">Tâches</th>
                        <th className="py-2 pl-3 text-right">Montant</th>
                        {showDas && <th className="py-2 pl-3 text-right">Total (avec DAS)</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((p) => (
                        <tr key={keyOf(p)} className="border-b last:border-0 cursor-pointer hover:bg-slate-50" onClick={() => setSelected(keyOf(p))}>
                          <td className="py-2 pr-4 font-medium">{p.name}</td>
                          <td className="py-2 pr-4 text-xs text-slate-500">{p.group}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-500">{p.tasks.length}</td>
                          <td className="py-2 pl-3 text-right font-bold tabular-nums">{money(sumTasks(p))}</td>
                          {showDas && <td className="py-2 pl-3 text-right tabular-nums text-slate-500">{money(p.sheetTotal?.total ?? null)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {doc.summary.length > 0 && !q && (
                  <section className="card space-y-2">
                    <h2 className="font-semibold">Sommaire du fichier</h2>
                    <table className="w-full text-sm">
                      <tbody>
                        {doc.summary.map((l, i) =>
                          l.montant === null && l.total === null ? (
                            <tr key={i}>
                              <td colSpan={4} className="pt-3 pb-1 text-[11px] font-black uppercase tracking-widest text-gold-700">
                                {l.label}
                              </td>
                            </tr>
                          ) : (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1.5 pr-4">
                                {l.label}
                                {l.note && <span className="ml-2 text-[11px] text-slate-400">{l.note}</span>}
                              </td>
                              <td className="py-1.5 px-3 text-right tabular-nums">{money(l.montant)}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-slate-500">{money(l.das)}</td>
                              <td className="py-1.5 pl-3 text-right tabular-nums font-semibold">{money(l.total)}</td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
