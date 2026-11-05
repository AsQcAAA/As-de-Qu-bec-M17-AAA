"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MEDALS, fmtNum, monthBounds, monthLabel, rankBy, shiftMonth, totalsByCoach, type ActivityRow, type CoachTotal } from "@/lib/activity";

const currentMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Toronto" }).slice(0, 7);

function Podium({ title, hint, list, valueKey }: { title: string; hint: string; list: CoachTotal[]; valueKey: "clicks" | "chars" }) {
  const max = Math.max(1, ...list.map((c) => c[valueKey]));
  return (
    <div className="space-y-2">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <ol className="space-y-2">
        {list.slice(0, 3).map((c, i) => (
          <li key={c.id} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">
                {MEDALS[i]} {c.name}
              </span>
              <span className="tabular-nums font-bold">{fmtNum(c[valueKey])}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${(c[valueKey] / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Classement du mois : caractères ajoutés (contributions) et clics (actions). */
export default function ActivityRanking({ coaches }: { coaches: { id: string; full_name: string }[] }) {
  const supabase = createClient();
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { from, to } = monthBounds(month);
    setRows(null);
    supabase
      .from("activity_daily")
      .select("user_id, day, clicks, chars")
      .gte("day", from)
      .lt("day", to)
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setError(null);
        setRows((data ?? []) as ActivityRow[]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const totals = totalsByCoach(rows ?? [], coaches);
  const isCurrent = month === currentMonth();

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Activité sur le site — classement du mois</h2>
          <p className="text-xs text-slate-500">
            Clics et caractères ajoutés, par coach. Seuls des compteurs sont conservés, jamais le contenu. Rapport envoyé par courriel le 1<sup>er</sup> de chaque mois.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-2 py-1 text-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mois précédent">
            ←
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold">{monthLabel(month)}</span>
          <button className="btn-secondary px-2 py-1 text-sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isCurrent} aria-label="Mois suivant">
            →
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Lecture impossible : {error}</p>
      ) : rows === null ? (
        <p className="text-sm text-slate-500">Chargement...</p>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <Podium title="Contributions" hint="Caractères ajoutés (notes, rapports, commentaires…)" list={rankBy(totals, "chars")} valueKey="chars" />
            <Podium title="Actions" hint="Clics sur le site" list={rankBy(totals, "clicks")} valueKey="clicks" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Coach</th>
                  <th className="py-2 pr-4 text-right">Caractères</th>
                  <th className="py-2 pr-4 text-right">Clics</th>
                  <th className="py-2 pr-4 text-right">Jours actifs</th>
                </tr>
              </thead>
              <tbody>
                {rankBy(totals, "chars").map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(c.chars)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(c.clicks)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.activeDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
