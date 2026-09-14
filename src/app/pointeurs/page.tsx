"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildRosterByDate, gamesPlayedFor, regulationMinutes } from "@/lib/playerStats";
import { parsePenaltyCode } from "@/lib/penalties";
import { gameWinningGoalId } from "@/lib/gameGoals";
import { formatNet } from "@/lib/tpeReport";
import type { Game, GameCategory, GameEvent, Player, PlayerGameAdvancedStat, PlayerGameStat } from "@/lib/types";

type SortKey =
  | "jersey" | "name" | "games" | "goals" | "assists" | "points"
  | "plusMinus" | "ppG" | "ppA" | "shP" | "gw" | "pim";

/** En-tête de colonne cliquable : bascule la colonne, ou le sens si déjà active. */
function SortHeader({
  label,
  k,
  title,
  sortKey,
  sortDesc,
  onSort,
}: {
  label: string;
  k: SortKey;
  title?: string;
  sortKey: SortKey;
  sortDesc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      title={title}
      onClick={() => onSort(k)}
      className={`py-2 pr-4 cursor-pointer select-none whitespace-nowrap ${
        active ? "text-gold-700" : "hover:text-slate-700"
      }`}
    >
      {label}
      <span className="ml-1 text-[10px]">{active ? (sortDesc ? "▼" : "▲") : "↕"}</span>
    </th>
  );
}

const CATEGORY_LABEL: Record<GameCategory, string> = {
  hors_concours: "Hors concours",
  saison_reguliere: "Saison régulière",
  series: "Séries",
  tournoi: "Tournoi",
};
const CATEGORY_ORDER: GameCategory[] = ["saison_reguliere", "series", "tournoi", "hors_concours"];

/**
 * Classement des pointeurs, filtrable par type de match.
 *
 * Les statistiques d'un match hors concours comptent et sont conservées, mais
 * elles ne doivent pas se mêler à la saison régulière dans un même total :
 * d'où le filtre plutôt qu'un cumul unique.
 */
export default function PointeursPage() {
  const supabase = createClient();
  const router = useRouter();

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      // Les colonnes chiffrées partent du plus grand, les textuelles de A à Z.
      setSortDesc(k !== "name" && k !== "jersey");
    }
  }
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<PlayerGameStat[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  /** Rapport TPE de chaque match — source du +/-. */
  const [advancedStats, setAdvancedStats] = useState<PlayerGameAdvancedStat[]>([]);
  const [rosterByDate, setRosterByDate] = useState<Map<string, Set<string>>>(new Map());
  // Colonne de tri et sens — cliquer une en-tête inverse le sens.
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDesc, setSortDesc] = useState(true);
  const [categories, setCategories] = useState<Set<GameCategory>>(new Set(["saison_reguliere"]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: pls }, { data: gms }, { data: st }, { data: ev }, { data: lus }, { data: lunits }, { data: adv }] = await Promise.all([
        supabase.from("players").select("*").eq("active", true).order("jersey_number"),
        supabase.from("games").select("*"),
        supabase.from("player_game_stats").select("*"),
        supabase.from("game_events").select("*"),
        supabase.from("lineups").select("id, lineup_date"),
        supabase.from("lineup_units").select("lineup_id, unit_label, player_ids"),
        supabase.from("player_game_advanced_stats").select("*"),
      ]);
      setPlayers(pls ?? []);
      setGames(gms ?? []);
      setStats(st ?? []);
      setEvents(ev ?? []);
      setRosterByDate(buildRosterByDate(lus ?? [], lunits ?? []));
      setAdvancedStats((adv ?? []) as PlayerGameAdvancedStat[]);
      setLoading(false);
    }
    load();
  }, []);

  function toggleCategory(c: GameCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  const rows = useMemo(() => {
    // Plus/moins : vient du rapport TPE, rattaché au joueur. Seuls les matchs
    // des types sélectionnés entrent dans le calcul.
    const selectedGameIds = new Set(games.filter((g) => categories.has(g.category)).map((g) => g.id));
    const plusMinus = new Map<string, number>();
    for (const a of advancedStats) {
      if (!selectedGameIds.has(a.game_id)) continue;
      plusMinus.set(a.player_id, (plusMinus.get(a.player_id) ?? 0) + (a.plus_minus ?? 0));
    }

    const gameById = new Map(games.map((g) => [g.id, g]));
    const playerById = new Map(players.map((p) => [p.id, p]));

    // Buts en avantage / désavantage numérique, par joueur — permet de repérer
    // les meilleurs éléments par situation de jeu.
    // Buts gagnants : déduits du pointage final et de l'ordre des buts, donc
    // il faut les évènements des DEUX équipes de chaque match.
    const winningGoalIds = new Set<string>();
    for (const g of games) {
      if (!categories.has(g.category)) continue;
      const id = gameWinningGoalId(
        events.filter((e) => e.game_id === g.id),
        g
      );
      if (id) winningGoalIds.add(id);
    }

    // Buts ET passes par situation : une passe en avantage numérique compte
    // autant qu'un but pour juger d'une unité spéciale.
    type Sit = { ppG: number; ppA: number; shG: number; shA: number };
    const situational = new Map<string, Sit>();
    const bumpSit = (playerId: string, field: keyof Sit) => {
      const cur = situational.get(playerId) ?? { ppG: 0, ppA: 0, shG: 0, shA: 0 };
      cur[field] += 1;
      situational.set(playerId, cur);
    };

    const winners = new Map<string, number>();
    const pim = new Map<string, number>();
    for (const e of events) {
      const g = gameById.get(e.game_id);
      if (!g || !categories.has(g.category) || e.side !== "us") continue;

      if (e.event_type === "penalty") {
        if (e.player_id) {
          pim.set(e.player_id, (pim.get(e.player_id) ?? 0) + parsePenaltyCode(e.penalty_code ?? "").minutes);
        }
        continue;
      }

      if (e.player_id && winningGoalIds.has(e.id)) {
        winners.set(e.player_id, (winners.get(e.player_id) ?? 0) + 1);
      }
      if (e.situation !== "pp" && e.situation !== "sh") continue;
      const pp = e.situation === "pp";
      if (e.player_id) bumpSit(e.player_id, pp ? "ppG" : "shG");
      for (const assistId of [e.assist1_player_id, e.assist2_player_id]) {
        if (assistId) bumpSit(assistId, pp ? "ppA" : "shA");
      }
    }

    const tally = new Map<string, { goals: number; assists: number }>();
    for (const s of stats) {
      const g = gameById.get(s.game_id);
      if (!g || !categories.has(g.category)) continue;
      const cur = tally.get(s.player_id) ?? { goals: 0, assists: 0 };
      cur.goals += s.goals;
      cur.assists += s.assists;
      tally.set(s.player_id, cur);
    }

    // On liste TOUS les joueurs ayant été habillés, pas seulement les pointeurs :
    // un joueur à 0 point doit apparaître avec ses parties jouées.
    const cats = [...categories];
    return players
      .map((player) => {
        const t = tally.get(player.id) ?? { goals: 0, assists: 0 };
        const sit = situational.get(player.id) ?? { ppG: 0, ppA: 0, shG: 0, shA: 0 };
        const gp = gamesPlayedFor(player.id, games, rosterByDate, cats).length;
        if (gp === 0 && t.goals + t.assists === 0) return null;
        return {
          player,
          ...t,
          ...sit,
          games: gp,
          // Points en désavantage : total, pour le tri ; le détail « B-P » est
          // reconstitué à l'affichage.
          shP: sit.shG + sit.shA,
          gw: winners.get(player.id) ?? 0,
          plusMinus: plusMinus.get(player.id) ?? 0,
          pim: pim.get(player.id) ?? 0,
          points: t.goals + t.assists,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => {
        const val = (r: NonNullable<typeof a>) =>
          sortKey === "jersey"
            ? (r.player.jersey_number ?? 999)
            : sortKey === "name"
              ? r.player.full_name
              : (r[sortKey] as number);
        const va = val(a);
        const vb = val(b);
        const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
        return sortDesc ? -cmp : cmp;
      });
  }, [stats, games, players, categories, events, advancedStats, rosterByDate, sortKey, sortDesc]);

  /**
   * Gardiens. Un blanchissage est accordé au gardien qui n'a rien accordé ET
   * qui était le seul à avoir joué du match : quand deux gardiens se partagent
   * la rencontre, aucun ne le reçoit — c'est la convention du hockey.
   */
  const goalieRows = useMemo(() => {
    const gameById = new Map(games.map((g) => [g.id, g]));
    const goalies = players.filter((p) => p.position === "G");

    // Nombre de gardiens ayant réellement joué, par match.
    const goaliesPerGame = new Map<string, number>();
    for (const st of stats) {
      if ((st.toi_minutes ?? 0) <= 0) continue;
      const p = players.find((x) => x.id === st.player_id);
      if (p?.position !== "G") continue;
      goaliesPerGame.set(st.game_id, (goaliesPerGame.get(st.game_id) ?? 0) + 1);
    }

    return goalies
      .map((player) => {
        let wins = 0, losses = 0, ties = 0, minutes = 0, goalsAgainst = 0, shutouts = 0, gp = 0;
        // Équivalent de matchs complets : les minutes rapportées à la durée
        // réglementaire du match (50 min, 45 en tournoi).
        let gamesEquivalent = 0;
        for (const st of stats) {
          if (st.player_id !== player.id || (st.toi_minutes ?? 0) <= 0) continue;
          const g = gameById.get(st.game_id);
          if (!g || !g.result || !categories.has(g.category)) continue;
          gp += 1;
          minutes += st.toi_minutes ?? 0;
          gamesEquivalent += (st.toi_minutes ?? 0) / regulationMinutes(g);
          const ga = st.goals_against ?? 0;
          goalsAgainst += ga;
          if (g.result === "W") wins += 1;
          else if (g.result === "T") ties += 1;
          else losses += 1;
          if (ga === 0 && goaliesPerGame.get(st.game_id) === 1) shutouts += 1;
        }
        return {
          player,
          gp,
          wins,
          losses,
          ties,
          minutes,
          goalsAgainst,
          shutouts,
          average: gamesEquivalent > 0 ? goalsAgainst / gamesEquivalent : null,
        };
      })
      .filter((r) => r.gp > 0)
      .sort((a, b) => b.gp - a.gp || (a.average ?? 99) - (b.average ?? 99));
  }, [players, stats, games, categories]);

  const matchCount = useMemo(
    () => games.filter((g) => categories.has(g.category) && g.result).length,
    [games, categories]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Statistiques individuelles</h1>
        <p className="text-slate-400 text-sm">
          Compilé automatiquement à partir des feuilles de match. Choisis les types de match à inclure.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_ORDER.map((c) => {
          const on = categories.has(c);
          return (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              aria-pressed={on}
              className={`rounded-full px-4 py-1.5 text-sm font-bold border transition-colors ${
                on
                  ? "bg-gold-500 border-gold-400 text-ink-900"
                  : "bg-white/5 border-white/15 text-slate-300 hover:border-gold-400/50"
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : categories.size === 0 ? (
        <p className="text-sm text-slate-400">Choisis au moins un type de match.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">
          Aucun point enregistré pour ce filtre. Les statistiques apparaissent après le téléversement d&apos;une
          feuille de match.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4 w-10"></th>
                <SortHeader label="#" k="jersey" title="Numéro" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="Joueur" k="name" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="PJ" k="games" title="Parties jouées" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="B" k="goals" title="Buts" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="P" k="assists" title="Passes" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="PTS" k="points" title="Points" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="+/-" k="plusMinus" title="Plus/moins — sur la glace lors des buts à égalité ou en infériorité" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="BAN" k="ppG" title="Buts en avantage numérique" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="PAN" k="ppA" title="Passes en avantage numérique" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="PDN" k="shP" title="Points en désavantage numérique (buts-passes)" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="BG" k="gw" title="Buts gagnants" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                <SortHeader label="MIN" k="pim" title="Minutes de punition" sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                // Toute la ligne mène à la fiche du joueur.
                <tr
                  key={r.player.id}
                  onClick={() => router.push(`/joueurs/${r.player.id}`)}
                  className="border-b last:border-0 cursor-pointer hover:bg-gold-50 transition-colors"
                >
                  <td className="py-2 pr-4 text-slate-400 font-medium">{i + 1}</td>
                  <td className="py-2 pr-4 font-bold">{r.player.jersey_number ?? "-"}</td>
                  <td className="py-2 pr-4 font-medium text-ink-800 hover:underline">{r.player.full_name}</td>
                  <td className="py-2 pr-4">{r.games}</td>
                  <td className="py-2 pr-4">{r.goals}</td>
                  <td className="py-2 pr-4">{r.assists}</td>
                  <td className="py-2 pr-4 font-bold">{r.points}</td>
                  <td
                    className={`py-2 pr-4 font-bold tabular-nums ${
                      r.plusMinus > 0 ? "text-green-700" : r.plusMinus < 0 ? "text-red-700" : "text-slate-400"
                    }`}
                  >
                    {formatNet(r.plusMinus)}
                  </td>
                  <td className="py-2 pr-4">{r.ppG || "-"}</td>
                  <td className="py-2 pr-4">{r.ppA || "-"}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {r.shG || r.shA ? `${r.shG}-${r.shA}` : "-"}
                  </td>
                  <td className="py-2 pr-4">{r.gw || "-"}</td>
                  <td className="py-2 pr-4">{r.pim || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && goalieRows.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-white">Gardiens</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4 w-12">#</th>
                  <th className="py-2 pr-4">Gardien</th>
                  <th className="py-2 pr-4 w-14" title="Parties jouées">PJ</th>
                  <th className="py-2 pr-4 w-14" title="Victoires">V</th>
                  <th className="py-2 pr-4 w-14" title="Défaites">D</th>
                  <th className="py-2 pr-4 w-20" title="Moyenne de buts alloués par 60 minutes">Moy.</th>
                  <th className="py-2 pr-4 w-16" title="Buts accordés">BA</th>
                  <th className="py-2 pr-4 w-20" title="Minutes jouées">Min</th>
                  <th className="py-2 pr-4 w-16" title="Blanchissages">BL</th>
                </tr>
              </thead>
              <tbody>
                {goalieRows.map((r) => (
                  <tr
                    key={r.player.id}
                    onClick={() => router.push(`/joueurs/${r.player.id}`)}
                    className="border-b last:border-0 cursor-pointer hover:bg-gold-50 transition-colors"
                  >
                    <td className="py-2 pr-4 font-bold">{r.player.jersey_number ?? "-"}</td>
                    <td className="py-2 pr-4 font-medium text-ink-800 hover:underline">{r.player.full_name}</td>
                    <td className="py-2 pr-4">{r.gp}</td>
                    <td className="py-2 pr-4">{r.wins}</td>
                    <td className="py-2 pr-4">{r.losses}</td>
                    <td className="py-2 pr-4 font-bold">{r.average === null ? "-" : r.average.toFixed(2)}</td>
                    <td className="py-2 pr-4">{r.goalsAgainst}</td>
                    <td className="py-2 pr-4">{r.minutes.toFixed(0)}</td>
                    <td className="py-2 pr-4 font-bold">{r.shutouts || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Un blanchissage n&apos;est accordé qu&apos;au gardien ayant disputé seul la rencontre.
          </p>
        </div>
      )}

      {!loading && (
        <p className="text-xs text-slate-500">
          {matchCount} match(s) joué(s) dans les types sélectionnés.
        </p>
      )}
    </div>
  );
}
