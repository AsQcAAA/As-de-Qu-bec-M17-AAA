"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OPPONENT_ROSTERS } from "@/lib/opponentRosters";
import { isSecondYear } from "@/lib/secondYearPlayers";
import { titleCase } from "@/lib/players";
import type { GameEvent } from "@/lib/types";

type Slot = { n: string; name: string };
type Slots = Record<string, Slot>;

const FORWARD_POS = ["AG", "C", "AD"];
const DEFENSE_POS = ["DG", "DD"];
const groups: { title: string; keys: string[][] }[] = [
  {
    title: "Attaquants",
    keys: [1, 2, 3, 4].map((l) => FORWARD_POS.map((p) => `F${l}-${p}`)),
  },
  {
    title: "Défenseurs",
    keys: [1, 2, 3].map((l) => DEFENSE_POS.map((p) => `D${l}-${p}`)),
  },
  { title: "Gardiens", keys: [["G1", "G2"]] },
];

/**
 * Alignement adverse saisi après le match : on tape les numéros, les noms
 * apparaissent d'eux-mêmes quand ce numéro a marqué ou passé dans la feuille
 * de match, sinon on peut les ajouter à la main (ou me les donner plus tard).
 */
export default function OpponentLineupEditor({
  gameId,
  opponentName,
  teamSlug,
  events,
}: {
  gameId: string;
  opponentName: string;
  teamSlug?: string;
  events: GameEvent[];
}) {
  const supabase = createClient();
  const [slots, setSlots] = useState<Slots>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("game_opponent_lineups")
      .select("slots")
      .eq("game_id", gameId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setStatus(`Table introuvable (migration 037 à exécuter) : ${error.message}`);
        setSlots((data?.slots as Slots) ?? {});
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Numéro → nom : effectif de l'équipe (opponentRosters.ts), puis évènements adverses de la feuille de match.
  const known = new Map<string, string>(Object.entries((teamSlug && OPPONENT_ROSTERS[teamSlug]) || {}));
  for (const e of events) {
    if (e.side !== "opponent") continue;
    // L'effectif enregistré fait foi ; la feuille de match ne sert qu'à combler un manque.
    if (e.jersey_number != null && e.player_name && !known.has(String(e.jersey_number))) known.set(String(e.jersey_number), e.player_name);
    if (e.assist1_jersey != null && e.assist1_name && !known.has(String(e.assist1_jersey))) known.set(String(e.assist1_jersey), e.assist1_name);
    if (e.assist2_jersey != null && e.assist2_name && !known.has(String(e.assist2_jersey))) known.set(String(e.assist2_jersey), e.assist2_name);
  }

  function patch(key: string, p: Partial<Slot>) {
    setSlots((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { n: "", name: "" }), ...p } }));
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    const cleaned: Slots = {};
    for (const [k, v] of Object.entries(slots)) {
      if (!v.n.trim()) continue;
      const resolved = known.get(v.n.trim());
      cleaned[k] = { n: v.n.trim(), name: resolved ? titleCase(resolved) : "" };
    }
    const { error } = await supabase
      .from("game_opponent_lineups")
      .upsert({ game_id: gameId, slots: cleaned, updated_at: new Date().toISOString() }, { onConflict: "game_id" });
    setStatus(error ? `Erreur : ${error.message}` : "saved");
  }

  if (!loaded) return null;

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Alignement adverse — {opponentName}</h2>
        <p className="text-xs text-slate-500">
          Entre les numéros après le match : le nom s'affiche tout seul, d'après l'effectif de l'équipe.
        </p>
      </div>
      {groups.map((g) => (
        <div key={g.title} className="space-y-1.5">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{g.title}</div>
          {g.keys.map((row) => (
            <div key={row.join("-")} className={`grid gap-2 ${row.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {row.map((key) => {
                const s = slots[key] ?? { n: "", name: "" };
                const auto = s.n ? known.get(s.n.trim()) : undefined;
                return (
                  <div key={key} className="flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1">
                    <input
                      inputMode="numeric"
                      className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center font-bold"
                      placeholder="#"
                      value={s.n}
                      onChange={(e) => patch(key, { n: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                    />
                    <span className={`min-w-0 flex-1 truncate text-sm ${auto ? "text-slate-800" : "text-slate-400"}`}>
                      {s.n ? (auto ? titleCase(auto) : "Nom inconnu") : "—"}
                    </span>
                    {isSecondYear(teamSlug, auto) && (
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
      <div className="flex items-center gap-3">
        <button className="btn" onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Enregistrement..." : "Enregistrer l'alignement adverse"}
        </button>
        {status === "saved" && <span className="text-sm text-green-700">Enregistré ✓</span>}
        {status !== "idle" && status !== "saving" && status !== "saved" && (
          <span className="text-sm text-red-600">{status}</span>
        )}
      </div>
    </div>
  );
}
