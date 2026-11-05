"use client";

import { OPPONENT_ROSTERS } from "@/lib/opponentRosters";
import { isSecondYear } from "@/lib/secondYearPlayers";
import { titleCase } from "@/lib/players";

export type ScoutSlot = { n: string; name: string };
export type ScoutSlots = Record<string, ScoutSlot>;

const groups: { title: string; keys: string[][]; labels: string[] }[] = [
  { title: "Attaquants", keys: [1, 2, 3, 4].map((l) => ["AG", "C", "AD"].map((p) => `F${l}-${p}`)), labels: ["AG", "C", "AD"] },
  { title: "Défenseurs", keys: [1, 2, 3].map((l) => ["DG", "DD"].map((p) => `D${l}-${p}`)), labels: ["DG", "DD"] },
  { title: "Gardiens", keys: [["G1", "G2"]], labels: ["G1", "G2"] },
];

/**
 * Alignement attendu d'une équipe adverse, saisi à la main dans le pre-scout.
 * Le numéro suffit : le nom vient de l'effectif de l'équipe, sinon on peut l'écrire.
 */
export default function ScoutLineupEditor({
  teamSlug,
  value,
  onChange,
}: {
  teamSlug: string;
  value: ScoutSlots;
  onChange: (v: ScoutSlots) => void;
}) {
  const roster = (OPPONENT_ROSTERS[teamSlug] ?? {}) as Record<string, string>;

  function patch(key: string, p: Partial<ScoutSlot>) {
    const cur = value[key] ?? { n: "", name: "" };
    const next = { ...cur, ...p };
    const out = { ...value };
    if (!next.n && !next.name) delete out[key];
    else out[key] = next;
    onChange(out);
  }

  return (
    <div className="space-y-2.5">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{g.title}</div>
          {g.keys.map((row) => (
            <div key={row.join("-")} className={`grid gap-1 ${row.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
              {row.map((key, i) => {
                const s = value[key] ?? { n: "", name: "" };
                const auto = s.n ? roster[s.n.trim()] : undefined;
                const shown = s.name || (auto ? titleCase(auto) : "");
                return (
                  <div key={key} className="flex items-center gap-1.5 rounded border border-slate-200 px-1.5 py-0.5">
                    <span className="w-6 shrink-0 text-[10px] font-bold text-slate-400">{g.labels[i]}</span>
                    <input
                      inputMode="numeric"
                      className="w-10 rounded border border-slate-300 px-0.5 py-0 text-center text-xs font-bold"
                      placeholder="#"
                      value={s.n}
                      onChange={(e) => patch(key, { n: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                    />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
                      placeholder={auto ? titleCase(auto) : s.n ? "Nom" : "—"}
                      value={s.name}
                      onChange={(e) => patch(key, { name: e.target.value })}
                    />
                    {isSecondYear(teamSlug, shown) && (
                      <span className="shrink-0 rounded bg-gold-500 px-1 text-[10px] font-black text-ink-900" title="Joueur de 2e année">
                        2e
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
