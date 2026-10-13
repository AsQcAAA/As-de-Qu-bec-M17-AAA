"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lastName } from "@/lib/players";
import type { Player } from "@/lib/types";

const PANELS = [
  { label: "Attaquants (effectif)", title: "Attaquants", cols: "grid-cols-3" },
  { label: "Défenseurs (effectif)", title: "Défenseurs", cols: "grid-cols-2" },
  { label: "Gardiens (effectif)", title: "Gardiens", cols: "grid-cols-2" },
];

/**
 * Notre alignement pour ce match, en lecture seule — même gabarit compact que
 * l'alignement adverse pour qu'on puisse les comparer côte à côte. Il se
 * modifie depuis l'alignement du jour, pas d'ici.
 */
export default function GameLineupReadOnly({ gameDate }: { gameDate: string }) {
  const supabase = createClient();
  const [units, setUnits] = useState<Record<string, string[]>>({});
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: lineups } = await supabase.from("lineups").select("id").eq("lineup_date", gameDate).limit(1);
      const lineupId = lineups?.[0]?.id;
      if (lineupId) {
        const [{ data: u }, { data: pls }] = await Promise.all([
          supabase.from("lineup_units").select("unit_label, player_ids").eq("lineup_id", lineupId),
          supabase.from("players").select("*"),
        ]);
        setUnits(Object.fromEntries((u ?? []).map((x) => [x.unit_label, x.player_ids ?? []])));
        setPlayers(new Map((pls ?? []).map((p) => [p.id, p])));
      }
      setLoaded(true);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameDate]);

  if (!loaded) return null;
  const hasAny = PANELS.some((p) => (units[p.label] ?? []).some(Boolean));

  return (
    <div className="card space-y-2.5">
      <div>
        <h2 className="font-semibold">Notre alignement — As de Québec</h2>
        <p className="text-[11px] text-slate-500">Lecture seule : tel que posé dans l&apos;alignement du match.</p>
      </div>
      {!hasAny ? (
        <p className="text-sm text-slate-500">Aucun alignement enregistré pour ce match.</p>
      ) : (
        PANELS.map((panel) => {
          const ids = units[panel.label] ?? [];
          const last = ids.reduce((n, id, i) => (id ? i : n), -1);
          const shown = ids.slice(0, last + 1);
          if (shown.length === 0) return null;
          return (
            <div key={panel.label} className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{panel.title}</div>
              <div className={`grid gap-1 ${panel.cols}`}>
                {shown.map((id, i) => {
                  const p = id ? players.get(id) : undefined;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs ${
                        p ? "border-slate-200" : "border-dashed border-slate-200 text-slate-300"
                      }`}
                    >
                      <span className="w-7 shrink-0 rounded bg-slate-100 text-center font-black py-0.5">
                        {p?.jersey_number ?? "–"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{p ? lastName(p.full_name) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
