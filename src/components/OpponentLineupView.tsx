"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OPPONENT_ROSTERS } from "@/lib/opponentRosters";
import { isSecondYear } from "@/lib/secondYearPlayers";
import { titleCase } from "@/lib/players";

type Slot = { n: string; name: string };
type Slots = Record<string, Slot>;

const groups: { title: string; keys: string[][]; labels: string[] }[] = [
  { title: "Attaquants", keys: [1, 2, 3, 4].map((l) => ["AG", "C", "AD"].map((p) => `F${l}-${p}`)), labels: ["AG", "C", "AD"] },
  { title: "Défenseurs", keys: [1, 2, 3].map((l) => ["DG", "DD"].map((p) => `D${l}-${p}`)), labels: ["DG", "DD"] },
  { title: "Gardiens", keys: [["G1", "G2"]], labels: ["G", "G"] },
];

/** Alignement adverse d'un match, en lecture seule (saisi dans la page du match). */
export default function OpponentLineupView({ gameId, teamSlug }: { gameId: string; teamSlug?: string }) {
  const supabase = createClient();
  const [slots, setSlots] = useState<Slots | null>(null);

  useEffect(() => {
    setSlots(null);
    supabase
      .from("game_opponent_lineups")
      .select("slots")
      .eq("game_id", gameId)
      .maybeSingle()
      .then(({ data }) => setSlots((data?.slots as Slots) ?? {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (!slots) return <p className="text-sm text-slate-500">Chargement...</p>;
  const roster = (teamSlug && OPPONENT_ROSTERS[teamSlug]) || {};
  const filled = Object.values(slots).some((s) => s.n);
  if (!filled) {
    return <p className="text-sm text-slate-500">Aucun alignement adverse enregistré pour ce match. Il se saisit dans la page du match, après la partie.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{g.title}</div>
          {g.keys.map((row, ri) => {
            const hasAny = row.some((k) => slots[k]?.n);
            if (!hasAny) return null;
            return (
              <div key={ri} className={`grid gap-1.5 ${row.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {row.map((key, i) => {
                  const s = slots[key];
                  const name = s?.n ? s.name || (roster as Record<string, string>)[s.n] : undefined;
                  return (
                    <div key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                      <span className="w-6 shrink-0 text-[10px] font-bold text-slate-400">{g.labels[i]}</span>
                      {s?.n ? (
                        <>
                          <span className="font-black tabular-nums">{s.n}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{name ? titleCase(name) : "—"}</span>
                          {isSecondYear(teamSlug, name) && (
                            <span className="shrink-0 rounded bg-gold-500 px-1 text-[10px] font-black text-ink-900" title="Joueur de 2e année">
                              2e
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
