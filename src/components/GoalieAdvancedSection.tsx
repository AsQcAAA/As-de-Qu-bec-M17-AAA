"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import type { Game, Player } from "@/lib/types";

export interface GoalieStatRow {
  player_id: string;
  game_id: string;
  toi_minutes: number | null;
  goals_against: number | null;
}

interface GameLine {
  game: Game;
  player: Player;
  /** Part des tirs / de l'xG du match attribuée à ce gardien (au prorata de ses minutes). */
  share: number;
  minutes: number;
  shots: number | null;
  ga: number;
  xga: number | null;
}

const pct = (v: number) => v.toFixed(3).replace(/^0/, "");
const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;

/**
 * % d'arrêt et GSAx (goals saved above expected) de nos gardiens, calculés
 * match par match avec ce que contient déjà l'app :
 *
 *  - tirs au but et xG ADVERSES du rapport TPE (niveau équipe) ;
 *  - minutes jouées et buts alloués de chaque gardien (feuille de match).
 *
 * Quand deux gardiens se partagent un match, tirs et xG sont répartis au
 * prorata des minutes jouées : le rapport TPE ne donne pas ces chiffres par
 * gardien. Les buts alloués, eux, sont ceux de chaque gardien.
 *
 *   % d'arrêt = 1 − buts alloués ÷ tirs au but reçus
 *   GSAx      = xG contre − buts alloués   (positif = meilleur que prévu)
 *
 * Un match n'entre dans le % d'arrêt que si ses tirs sont connus, et dans le
 * GSAx que si son xG l'est : les deux colonnes indiquent leur nombre de matchs.
 */
export default function GoalieAdvancedSection({
  games,
  goalies,
  rows,
}: {
  games: Game[];
  goalies: Player[];
  rows: GoalieStatRow[];
}) {
  const lines = useMemo(() => {
    const byPlayer = new Map(goalies.map((p) => [p.id, p]));
    const out: GameLine[] = [];
    for (const game of games) {
      const played = rows.filter(
        (r) => r.game_id === game.id && byPlayer.has(r.player_id) && (r.toi_minutes ?? 0) > 0
      );
      const total = played.reduce((n, r) => n + (r.toi_minutes ?? 0), 0);
      if (total <= 0) continue;
      for (const r of played) {
        const minutes = r.toi_minutes ?? 0;
        const share = minutes / total;
        out.push({
          game,
          player: byPlayer.get(r.player_id)!,
          share,
          minutes,
          shots: game.shots_on_goal_opponent != null ? game.shots_on_goal_opponent * share : null,
          ga: r.goals_against ?? 0,
          xga: game.team_xg_opponent != null ? game.team_xg_opponent * share : null,
        });
      }
    }
    return out.sort((a, b) => b.game.game_date.localeCompare(a.game.game_date));
  }, [games, goalies, rows]);

  const totals = useMemo(() => {
    const map = new Map<
      string,
      { player: Player; gp: number; minutes: number; svGames: number; shots: number; svGa: number; xgGames: number; xga: number; xgGa: number }
    >();
    for (const l of lines) {
      const t =
        map.get(l.player.id) ??
        { player: l.player, gp: 0, minutes: 0, svGames: 0, shots: 0, svGa: 0, xgGames: 0, xga: 0, xgGa: 0 };
      t.gp += 1;
      t.minutes += l.minutes;
      if (l.shots != null) {
        t.svGames += 1;
        t.shots += l.shots;
        t.svGa += l.ga;
      }
      if (l.xga != null) {
        t.xgGames += 1;
        t.xga += l.xga;
        t.xgGa += l.ga;
      }
      map.set(l.player.id, t);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [lines]);

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">🥅 Gardiens — % d&apos;arrêt et GSAx</h2>
        <p className="text-xs text-slate-500">
          GSAx = xG contre − buts alloués (positif = le gardien fait mieux que prévu). Les tirs et le xG viennent du
          rapport TPE ; si deux gardiens jouent le même match, ils sont répartis selon les minutes jouées.
        </p>
      </div>

      {totals.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun match joué par un gardien pour ce filtre.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">Gardien</th>
                  <th className="py-2 pr-3">MJ</th>
                  <th className="py-2 pr-3">Min</th>
                  <th className="py-2 pr-3">Tirs reçus</th>
                  <th className="py-2 pr-3">BC</th>
                  <th className="py-2 pr-3">% arrêt</th>
                  <th className="py-2 pr-3">xG contre</th>
                  <th className="py-2 pr-3">GSAx</th>
                  <th className="py-2">GSAx / 60</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => {
                  const sv = t.shots > 0 ? 1 - t.svGa / t.shots : null;
                  const gsax = t.xgGames > 0 ? t.xga - t.xgGa : null;
                  const xgMinutes = lines
                    .filter((l) => l.player.id === t.player.id && l.xga != null)
                    .reduce((n, l) => n + l.minutes, 0);
                  return (
                    <tr key={t.player.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-semibold">
                        #{t.player.jersey_number ?? "–"} {t.player.full_name}
                      </td>
                      <td className="py-2 pr-3">{t.gp}</td>
                      <td className="py-2 pr-3">{t.minutes}</td>
                      <td className="py-2 pr-3">{t.svGames > 0 ? Math.round(t.shots) : "–"}</td>
                      <td className="py-2 pr-3">{t.svGames > 0 ? t.svGa : "–"}</td>
                      <td className="py-2 pr-3 font-bold">
                        {sv != null ? pct(sv) : "–"}
                        {t.svGames > 0 && t.svGames < t.gp && <span className="text-xs font-normal text-slate-400"> ({t.svGames} m.)</span>}
                      </td>
                      <td className="py-2 pr-3">{t.xgGames > 0 ? t.xga.toFixed(2) : "–"}</td>
                      <td className={`py-2 pr-3 font-bold ${gsax == null ? "" : gsax >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {gsax != null ? signed(gsax) : "–"}
                        {t.xgGames > 0 && t.xgGames < t.gp && <span className="text-xs font-normal text-slate-400"> ({t.xgGames} m.)</span>}
                      </td>
                      <td className="py-2">{gsax != null && xgMinutes > 0 ? signed((gsax / xgMinutes) * 60) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <details>
            <summary className="cursor-pointer text-sm font-semibold text-ink-800">Détail match par match</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1.5 pr-3">Date</th>
                    <th className="py-1.5 pr-3">Adversaire</th>
                    <th className="py-1.5 pr-3">Gardien</th>
                    <th className="py-1.5 pr-3">Tirs</th>
                    <th className="py-1.5 pr-3">BC</th>
                    <th className="py-1.5 pr-3">% arrêt</th>
                    <th className="py-1.5 pr-3">xG contre</th>
                    <th className="py-1.5">GSAx</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const team = findTeamByOpponent(l.game.opponent);
                    const sv = l.shots != null && l.shots > 0 ? 1 - l.ga / l.shots : null;
                    const gsax = l.xga != null ? l.xga - l.ga : null;
                    return (
                      <tr key={`${l.game.id}-${l.player.id}`} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 capitalize text-slate-500">
                          {format(parseISO(l.game.game_date), "d MMM", { locale: fr })}
                        </td>
                        <td className="py-1.5 pr-3">{team?.name ?? l.game.opponent}</td>
                        <td className="py-1.5 pr-3">{l.player.full_name}</td>
                        <td className="py-1.5 pr-3">{l.shots != null ? Math.round(l.shots) : "–"}</td>
                        <td className="py-1.5 pr-3">{l.ga}</td>
                        <td className="py-1.5 pr-3">{sv != null ? pct(sv) : "–"}</td>
                        <td className="py-1.5 pr-3">{l.xga != null ? l.xga.toFixed(2) : "–"}</td>
                        <td className={`py-1.5 font-semibold ${gsax == null ? "" : gsax >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {gsax != null ? signed(gsax) : "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
