"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { lastName } from "@/lib/players";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import type { Game, GameResult, Player } from "@/lib/types";

const F_LABEL = "Attaquants (effectif)";
const D_LABEL = "Défenseurs (effectif)";

interface Use {
  game: Game;
}

interface Combo {
  key: string;
  ids: string[];
  uses: Use[];
}

const isWin = (r: GameResult | null) => r === "W";
const isTie = (r: GameResult | null) => r === "T";

/** « 4-1-0 » : victoires – défaites en temps réglementaire – défaites en prolongation / fusillade (nuls ajoutés s'il y en a). */
function recordOf(uses: Use[]) {
  let w = 0,
    l = 0,
    otl = 0,
    t = 0,
    gf = 0,
    ga = 0;
  for (const { game } of uses) {
    if (isWin(game.result)) w++;
    else if (game.result === "L") l++;
    else if (game.result === "OTL" || game.result === "SOL") otl++;
    else if (isTie(game.result)) t++;
    gf += game.goals_for ?? 0;
    ga += game.goals_against ?? 0;
  }
  return { w, l, otl, t, gf, ga, label: `${w}-${l}-${otl}${t ? `-${t}` : ""}` };
}

/**
 * Trios d'attaquants et duos de défenseurs utilisés EN MATCH seulement.
 *
 * Sur l'alignement d'un match, les attaquants sont posés trois par rangée (un
 * trio par rangée) et les défenseurs deux par rangée (une paire par rangée) :
 * on relit donc ces rangées match par match. Un trio ou un duo est le même peu
 * importe l'ordre des joueurs dans la rangée. À chaque combinaison on associe
 * notre fiche (V-D-DP) et les buts pour/contre des matchs où elle a joué.
 */
export default function LineCombosSection({ games, players }: { games: Game[]; players: Player[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<{ gameId: string; forwards: string[]; defense: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const gameKey = games.map((g) => g.id).join(",");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const dates = [...new Set(games.map((g) => g.game_date))];
      if (dates.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      const { data: lineups } = await supabase.from("lineups").select("id, lineup_date").in("lineup_date", dates);
      const lineupByDate = new Map((lineups ?? []).map((l) => [l.lineup_date as string, l.id as string]));
      const lineupIds = [...lineupByDate.values()];
      const { data: units } = lineupIds.length
        ? await supabase.from("lineup_units").select("lineup_id, unit_label, player_ids").in("lineup_id", lineupIds).in("unit_label", [F_LABEL, D_LABEL])
        : { data: [] as { lineup_id: string; unit_label: string; player_ids: string[] }[] };
      const out = games.map((g) => {
        const lid = lineupByDate.get(g.game_date);
        const forwards = (units ?? []).find((u) => u.lineup_id === lid && u.unit_label === F_LABEL)?.player_ids ?? [];
        const defense = (units ?? []).find((u) => u.lineup_id === lid && u.unit_label === D_LABEL)?.player_ids ?? [];
        return { gameId: g.id, forwards, defense };
      });
      if (!cancelled) {
        setRows(out);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const { trios, pairs, gamesWithLineup } = useMemo(() => {
    const t = new Map<string, Combo>();
    const d = new Map<string, Combo>();
    let withLineup = 0;
    const bump = (map: Map<string, Combo>, ids: string[], game: Game) => {
      const sorted = [...ids].sort();
      const key = sorted.join("|");
      const row = map.get(key) ?? { key, ids: sorted, uses: [] };
      row.uses.push({ game });
      map.set(key, row);
    };
    for (const r of rows) {
      const game = gameById.get(r.gameId);
      if (!game) continue;
      if (r.forwards.some(Boolean) || r.defense.some(Boolean)) withLineup++;
      // Rangées complètes seulement : 3 attaquants / 2 défenseurs.
      for (let i = 0; i + 3 <= r.forwards.length; i += 3) {
        const trio = r.forwards.slice(i, i + 3);
        if (trio.every(Boolean)) bump(t, trio, game);
      }
      for (let i = 0; i + 2 <= r.defense.length; i += 2) {
        const pair = r.defense.slice(i, i + 2);
        if (pair.every(Boolean)) bump(d, pair, game);
      }
    }
    const order = (a: Combo, b: Combo) => b.uses.length - a.uses.length || recordOf(b.uses).w - recordOf(a.uses).w;
    return { trios: [...t.values()].sort(order), pairs: [...d.values()].sort(order), gamesWithLineup: withLineup };
  }, [rows, gameById]);

  function Names({ ids }: { ids: string[] }) {
    return (
      <>
        {ids.map((id, i) => (
          <span key={id}>
            {i > 0 && <span className="text-slate-400"> – </span>}
            <button onClick={() => router.push(`/joueurs/${id}`)} className="font-medium text-ink-800 hover:text-gold-700 hover:underline">
              {nameById.get(id)?.jersey_number != null ? `#${nameById.get(id)!.jersey_number} ` : ""}
              {lastName(nameById.get(id)?.full_name ?? "?")}
            </button>
          </span>
        ))}
      </>
    );
  }

  function table(title: string, list: Combo[], noun: string) {
    return (
      <div className="card space-y-2">
        <h2 className="font-semibold">{title}</h2>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun {noun} complet trouvé dans les alignements de match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3 w-8"></th>
                  <th className="py-2 pr-4">Joueurs</th>
                  <th className="py-2 pr-4 w-20">Matchs</th>
                  <th className="py-2 pr-4 w-24" title="Victoires – défaites – défaites en prolongation (ou en fusillade)">Fiche</th>
                  <th className="py-2 pr-4 w-24" title="Buts pour – buts contre de l'équipe dans ces matchs">BP – BC</th>
                  <th className="py-2 pr-4">Résultats</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c, i) => {
                  const rec = recordOf(c.uses);
                  return (
                    <tr key={c.key} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 text-slate-400 font-medium">{i + 1}</td>
                      <td className="py-2 pr-4">
                        <Names ids={c.ids} />
                      </td>
                      <td className="py-2 pr-4 font-bold">{c.uses.length}</td>
                      <td className="py-2 pr-4 font-bold">{rec.label}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {rec.gf} – {rec.ga}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {c.uses
                            .slice()
                            .sort((a, b) => a.game.game_date.localeCompare(b.game.game_date))
                            .map(({ game }) => (
                              <span
                                key={game.id}
                                title={`${format(parseISO(game.game_date), "d MMM", { locale: fr })} — ${findTeamByOpponent(game.opponent)?.name ?? game.opponent} (${game.goals_for ?? "-"}–${game.goals_against ?? "-"})`}
                                className={`rounded px-1.5 text-[11px] font-black ${
                                  isWin(game.result) ? "bg-green-100 text-green-800" : isTie(game.result) ? "bg-slate-200 text-slate-700" : "bg-red-100 text-red-800"
                                }`}
                              >
                                {isWin(game.result) ? "V" : isTie(game.result) ? "N" : game.result === "L" ? "D" : "DP"}
                              </span>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (loading) return <p className="text-slate-500">Chargement des alignements…</p>;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Trios et duos utilisés en match</h2>
        <p className="text-slate-400 text-sm">
          D&apos;après les alignements de match ({gamesWithLineup} match{gamesWithLineup > 1 ? "s" : ""} avec alignement) : un trio
          d&apos;attaquants = une rangée de 3, un duo de défenseurs = une rangée de 2, peu importe l&apos;ordre. La fiche est celle de
          l&apos;équipe dans les matchs où la combinaison a joué.
        </p>
      </div>
      {table("Trios d'attaquants les plus utilisés", trios, "trio")}
      {table("Duos de défenseurs les plus utilisés", pairs, "duo")}
    </section>
  );
}
