"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { money, normText, type BudgetLine, type BudgetSheet } from "@/lib/dgDocuments";

type Metric = "projection" | "montant" | "prev" | "reel";
const METRIC_LABEL: Record<Metric, string> = {
  projection: "Projection 26-27",
  montant: "Montant (par unité)",
  prev: "Montant 25-26",
  reel: "Réel",
};
const COMPARE = "__compare__";

/**
 * Budget 2026-27 : les six onglets du fichier du Drive, consultables par équipe
 * ou comparés poste par poste. Réservé à l'entraîneur-chef (RLS sur dg_documents).
 */
export default function BudgetFichierPage() {
  const supabase = createClient();
  const [sheets, setSheets] = useState<BudgetSheet[]>([]);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<string>("");
  const [group, setGroup] = useState<"all" | "Revenus" | "Dépenses">("all");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState<Metric>("projection");

  useEffect(() => {
    supabase
      .from("dg_documents")
      .select("data, imported_at")
      .eq("slug", "budget-2026-27")
      .maybeSingle()
      .then(({ data }) => {
        setSheets(((data?.data as { sheets?: BudgetSheet[] } | undefined)?.sheets ?? []) as BudgetSheet[]);
        setImportedAt(data?.imported_at ?? null);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = view || sheets[0]?.team || "";
  const comparing = current === COMPARE;
  const sheet = sheets.find((s) => s.team === current);
  const q = normText(search);

  const sectionsOf = useMemo(() => {
    const pool = comparing ? sheets : sheet ? [sheet] : [];
    return [...new Set(pool.flatMap((s) => s.lines.filter((l) => !l.isTotal && l.section).map((l) => l.section as string)))];
  }, [comparing, sheets, sheet]);

  const matches = (l: BudgetLine) =>
    !l.isTotal &&
    (group === "all" || l.group === group) &&
    (!section || l.section === section) &&
    (!q || normText(l.label).includes(q));

  // ---- Vue d'une équipe : lignes groupées par section, avec sous-totaux.
  const teamRows = useMemo(() => {
    if (!sheet) return [];
    const rows: { kind: "head" | "line" | "sub"; key: string; text?: string; line?: BudgetLine; sum?: number }[] = [];
    const lines = sheet.lines.filter(matches);
    let lastKey = "";
    let acc = 0;
    let accLabel = "";
    const flush = () => {
      if (accLabel) rows.push({ kind: "sub", key: `sub-${rows.length}`, text: `Sous-total — ${accLabel}`, sum: acc });
      acc = 0;
    };
    for (const l of lines) {
      const k = `${l.group}|${l.section ?? ""}`;
      if (k !== lastKey) {
        flush();
        rows.push({ kind: "head", key: `h-${rows.length}`, text: `${l.group}${l.section ? ` — ${l.section}` : ""}` });
        accLabel = `${l.group}${l.section ? ` — ${l.section}` : ""}`;
        lastKey = k;
      }
      rows.push({ kind: "line", key: `l-${rows.length}`, line: l });
      acc += l.projection ?? 0;
    }
    flush();
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, group, section, q]);

  // ---- Comparaison : un poste par ligne, une colonne par équipe.
  const compareRows = useMemo(() => {
    const byLabel = new Map<string, { label: string; section: string | null; group: string; values: Map<string, number | null> }>();
    for (const s of sheets) {
      for (const l of s.lines.filter(matches)) {
        const key = `${l.group}|${normText(l.label)}`;
        const row = byLabel.get(key) ?? { label: l.label, section: l.section, group: l.group, values: new Map() };
        const v = l[metric];
        row.values.set(s.team, (row.values.get(s.team) ?? 0) + (v ?? 0));
        byLabel.set(key, row);
      }
    }
    return [...byLabel.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, group, section, q, metric]);

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/direction-generale" className="text-sm text-gold-400 hover:underline">
          ← Direction générale
        </Link>
        <h1 className="text-2xl font-bold">Budget 2026-27 — fichier du Drive</h1>
        <p className="text-slate-400 text-sm">
          Les six onglets du fichier. Filtre par équipe, par section et par poste budgétaire.
          {importedAt && <> Importé le {format(new Date(importedAt), "d MMMM yyyy", { locale: fr })}.</>}
        </p>
      </div>

      {sheets.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune donnée importée pour l&apos;instant.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {sheets.map((s) => (
              <button
                key={s.team}
                onClick={() => setView(s.team)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold border transition-colors ${
                  current === s.team ? "bg-gold-500 border-gold-400 text-ink-900" : "bg-white/5 border-white/15 text-slate-200 hover:border-gold-400/50"
                }`}
              >
                {s.team.replace(/ 26-27$/, "")}
              </button>
            ))}
            <button
              onClick={() => setView(COMPARE)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold border transition-colors ${
                comparing ? "bg-gold-500 border-gold-400 text-ink-900" : "bg-white/5 border-white/15 text-slate-200 hover:border-gold-400/50"
              }`}
            >
              ⚖️ Comparer les équipes
            </button>
          </div>

          <div className="card grid sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Revenus / dépenses</label>
              <select className="input" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>
                <option value="all">Tout</option>
                <option value="Revenus">Revenus</option>
                <option value="Dépenses">Dépenses</option>
              </select>
            </div>
            <div>
              <label className="label">Section</label>
              <select className="input" value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">Toutes les sections</option>
                {sectionsOf.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Poste budgétaire</label>
              <input className="input" placeholder="Rechercher un poste (ex. transport, arbitres, entraîneur…)" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {comparing && (
              <div>
                <label className="label">Montant comparé</label>
                <select className="input" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
                  {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                    <option key={m} value={m}>
                      {METRIC_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {comparing ? (
            <div className="card overflow-x-auto">
              {compareRows.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun poste ne correspond à ces filtres.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-4">Poste</th>
                      {sheets.map((s) => (
                        <th key={s.team} className="py-2 px-3 text-right whitespace-nowrap">
                          {s.team.replace(/ 26-27$/, "")}
                        </th>
                      ))}
                      <th className="py-2 pl-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((r) => {
                      const total = [...r.values.values()].reduce<number>((n, v) => n + (v ?? 0), 0);
                      return (
                        <tr key={`${r.group}|${r.label}`} className="border-b last:border-0">
                          <td className="py-1.5 pr-4">
                            {r.label}
                            <span className="block text-[11px] text-slate-400">
                              {r.group}
                              {r.section ? ` — ${r.section}` : ""}
                            </span>
                          </td>
                          {sheets.map((s) => (
                            <td key={s.team} className="py-1.5 px-3 text-right tabular-nums">
                              {r.values.has(s.team) ? money(r.values.get(s.team)!) : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          <td className="py-1.5 pl-3 text-right font-bold tabular-nums">{money(total)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-slate-300 font-bold">
                      <td className="py-2 pr-4">Total des postes affichés</td>
                      {sheets.map((s) => (
                        <td key={s.team} className="py-2 px-3 text-right tabular-nums">
                          {money(compareRows.reduce((n, r) => n + (r.values.get(s.team) ?? 0), 0))}
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right tabular-nums">
                        {money(compareRows.reduce((n, r) => n + [...r.values.values()].reduce<number>((m, v) => m + (v ?? 0), 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="card overflow-x-auto">
              {teamRows.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun poste ne correspond à ces filtres.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-4">Poste</th>
                      <th className="py-2 px-3 text-right">{sheet?.headers[0] || "Nombre"}</th>
                      <th className="py-2 px-3 text-right">{sheet?.headers[1] || "Montant"}</th>
                      <th className="py-2 px-3 text-right">{sheet?.headers[2] || "Réel"}</th>
                      <th className="py-2 px-3 text-right">{sheet?.headers[3] || "Projection"}</th>
                      <th className="py-2 px-3 text-right">{sheet?.headers[4] || "Année précédente"}</th>
                      <th className="py-2 pl-3 text-right">Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamRows.map((r) =>
                      r.kind === "head" ? (
                        <tr key={r.key}>
                          <td colSpan={7} className="pt-4 pb-1 text-[11px] font-black uppercase tracking-widest text-gold-700">
                            {r.text}
                          </td>
                        </tr>
                      ) : r.kind === "sub" ? (
                        <tr key={r.key} className="border-t border-slate-300 bg-slate-50">
                          <td colSpan={4} className="py-1.5 pr-4 text-xs font-bold text-slate-600">
                            {r.text}
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold tabular-nums">{money(r.sum)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      ) : (
                        <tr key={r.key} className="border-b last:border-0">
                          <td className="py-1.5 pr-4">
                            {r.line!.label}
                            {r.line!.note && <span className="ml-2 text-[11px] text-slate-400">{r.line!.note}</span>}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-slate-500">{r.line!.nombre ?? ""}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{money(r.line!.montant)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{money(r.line!.reel)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-bold">{money(r.line!.projection)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-slate-500">{money(r.line!.prev)}</td>
                          <td
                            className={`py-1.5 pl-3 text-right tabular-nums ${
                              r.line!.projection != null && r.line!.prev != null && r.line!.projection !== r.line!.prev
                                ? (r.line!.projection > r.line!.prev) === (r.line!.group === "Revenus")
                                  ? "text-green-700"
                                  : "text-red-600"
                                : "text-slate-300"
                            }`}
                          >
                            {r.line!.projection != null && r.line!.prev != null ? money(r.line!.projection - r.line!.prev) : "—"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
              {sheet && (
                <div className="grid sm:grid-cols-3 gap-3 pt-4 border-t mt-3">
                  {sheet.lines
                    .filter((l) => l.isTotal && /^total/.test(normText(l.label)))
                    .map((l) => (
                      <div key={l.label} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{l.label}</div>
                        <div className="font-black">{money(l.projection ?? l.montant)}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
