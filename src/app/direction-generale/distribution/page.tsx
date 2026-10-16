"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { money, normText, type DistDocument, type DistPerson } from "@/lib/dgDocuments";

const sumTasks = (p: DistPerson) => p.tasks.reduce((n, t) => n + (t.montant ?? 0), 0);

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
  const [group, setGroup] = useState("");
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

  const q = normText(search);
  const groups = useMemo(() => [...new Set((doc?.people ?? []).map((p) => p.group))], [doc]);

  const people = useMemo(() => {
    let list = (doc?.people ?? []).filter((p) => !group || p.group === group);
    if (q) {
      list = list
        .map((p) =>
          normText(p.name).includes(q) ? p : { ...p, tasks: p.tasks.filter((t) => normText(t.label).includes(q)) }
        )
        .filter((p) => normText(p.name).includes(q) || p.tasks.length > 0);
    }
    if (sortBy === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "amount") list = [...list].sort((a, b) => sumTasks(b) - sumTasks(a));
    return list;
  }, [doc, group, q, sortBy]);

  const grandTotal = (doc?.people ?? []).reduce((n, p) => n + sumTasks(p), 0);

  if (loading) return <p className="text-slate-500">Chargement...</p>;

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

      {!doc || doc.people.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune donnée importée pour l&apos;instant.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Employés</div>
              <div className="text-2xl font-black">{doc.people.length}</div>
            </div>
            <div className="card">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Total des tâches</div>
              <div className="text-2xl font-black">{money(grandTotal)}</div>
              <div className="text-xs text-slate-400">Somme des montants de chaque tâche, avant DAS</div>
            </div>
            <div className="card">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Employés affichés</div>
              <div className="text-2xl font-black">{people.length}</div>
            </div>
          </div>

          <div className="card grid sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="label">Employé ou tâche</label>
              <input className="input" placeholder="Rechercher un employé ou une tâche…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">Tous</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Tri</label>
              <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                <option value="file">Ordre du fichier</option>
                <option value="name">Nom</option>
                <option value="amount">Montant (du plus élevé)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-4">
              <input type="checkbox" checked={showDas} onChange={(e) => setShowDas(e.target.checked)} />
              Afficher aussi les DAS (12 %) et le total
            </label>
          </div>

          <div className="space-y-4">
            {people.map((p) => (
              <section key={`${p.group}-${p.name}`} className="card space-y-2">
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
                    <div className="text-xl font-black tabular-nums">{money(sumTasks(p))}</div>
                    {showDas && p.sheetTotal && (
                      <div className="text-xs text-slate-500">
                        DAS {money(p.sheetTotal.das)} · Total {money(p.sheetTotal.total)}
                      </div>
                    )}
                    {p.sheetTotal?.montant != null && Math.abs(p.sheetTotal.montant - sumTasks(p)) > 0.5 && !q && (
                      <div className="text-[11px] text-amber-600" title="Le total inscrit dans le fichier diffère de la somme des tâches">
                        Total du fichier : {money(p.sheetTotal.montant)}
                      </div>
                    )}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-1.5 pr-4">Tâche</th>
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
                          {t.details.length > 0 && (
                            <span className="block text-[11px] text-slate-400">{t.details.join(" · ")}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-right font-semibold tabular-nums whitespace-nowrap">{money(t.montant)}</td>
                        {showDas && <td className="py-1.5 px-3 text-right tabular-nums text-slate-500">{money(t.das)}</td>}
                        {showDas && <td className="py-1.5 pl-3 text-right tabular-nums text-slate-500">{money(t.total)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>

          {doc.summary.length > 0 && !q && !group && (
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
  );
}
