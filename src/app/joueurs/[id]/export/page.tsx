"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Crest from "@/components/Crest";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { formatHeight } from "@/lib/height";
import { printWithOrientation } from "@/lib/print";
import {
  OFFICIAL_CATEGORIES,
  goalieTotals,
  recordLabel,
  regulationMinutes,
  skaterTotals,
} from "@/lib/playerStats";
import { averageToi, formatNet, shootingPct } from "@/lib/tpeReport";
import type { Game, Player, PlayerGameAdvancedStat, PlayerGameStat, PlayerTestResult } from "@/lib/types";

const POSITION_LABEL: Record<string, string> = { F: "Attaquant", D: "Défenseur", G: "Gardien" };

/**
 * Fiche de recrutement — pensée pour être remise telle quelle à un recruteur.
 *
 * Volontairement dépouillée par rapport à la fiche interne du joueur : ni
 * rencontres individuelles, ni absences, ni dossier médical — seulement son
 * identité, ses statistiques et ses résultats aux tests physiques.
 */
export default function FicheRecrutementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";
  const autoPrinted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [gameStats, setGameStats] = useState<PlayerGameStat[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [advancedStats, setAdvancedStats] = useState<PlayerGameAdvancedStat[]>([]);
  const [testResults, setTestResults] = useState<PlayerTestResult[]>([]);

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: pgs }, { data: gms }, { data: adv }, { data: tests }] = await Promise.all([
        supabase.from("players").select("*").eq("id", id).maybeSingle(),
        supabase.from("player_game_stats").select("*").eq("player_id", id),
        supabase.from("games").select("*"),
        supabase.from("player_game_advanced_stats").select("*").eq("player_id", id),
        supabase.from("player_test_results").select("*").eq("player_id", id).order("test_date", { ascending: false }),
      ]);
      if (!p) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }
      setPlayer(p);
      setGameStats(pgs ?? []);
      setGames(gms ?? []);
      setAdvancedStats((adv ?? []) as PlayerGameAdvancedStat[]);
      setTestResults(tests ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  // Seuls les matchs officiels comptent dans une fiche de recrutement — le
  // hors concours n'a pas sa place dans des statistiques présentées à un tiers.
  const officialStats = useMemo(
    () => gameStats.filter((gs) => gamesById.get(gs.game_id) && OFFICIAL_CATEGORIES.includes(gamesById.get(gs.game_id)!.category)),
    [gameStats, gamesById]
  );
  const officialAdvanced = useMemo(
    () => advancedStats.filter((a) => gamesById.get(a.game_id) && OFFICIAL_CATEGORIES.includes(gamesById.get(a.game_id)!.category)),
    [advancedStats, gamesById]
  );

  const isGoalie = player?.position === "G";
  const totals = useMemo(() => skaterTotals(officialStats), [officialStats]);
  const goalie = useMemo(() => goalieTotals(officialStats, gamesById), [officialStats, gamesById]);
  const plusMinus = useMemo(() => officialAdvanced.reduce((n, a) => n + (a.plus_minus ?? 0), 0), [officialAdvanced]);
  const averageToiLabel = useMemo(() => averageToi(officialAdvanced.map((a) => a.toi_seconds)), [officialAdvanced]);
  const totalXg = useMemo(() => officialAdvanced.reduce((n, a) => n + (a.xg ?? 0), 0), [officialAdvanced]);
  const totalToiSeconds = useMemo(() => officialAdvanced.reduce((n, a) => n + (a.toi_seconds ?? 0), 0), [officialAdvanced]);
  // Recalculé à partir du total de la saison plutôt que moyenné match par
  // match, pour la même raison que partout ailleurs dans l'app : la colonne
  // « xg per 20 » du rapport TPE n'est pas fiable telle quelle.
  const xgPer20Season = useMemo(
    () => (totalToiSeconds > 0 ? ((totalXg * 1200) / totalToiSeconds).toFixed(2) : "-"),
    [totalXg, totalToiSeconds]
  );
  const totalShots = useMemo(() => officialAdvanced.reduce((n, a) => n + (a.shots_on_goal ?? 0), 0), [officialAdvanced]);
  const shootingPercentage = useMemo(() => shootingPct(totals.goals, totalShots), [totals.goals, totalShots]);
  const faceoffPct = useMemo(() => {
    const won = officialAdvanced.reduce((n, a) => n + (a.faceoffs_won ?? 0), 0);
    const lost = officialAdvanced.reduce((n, a) => n + (a.faceoffs_lost ?? 0), 0);
    return won + lost > 0 ? `${((won / (won + lost)) * 100).toFixed(1)}%` : "-";
  }, [officialAdvanced]);
  const savePercentage = useMemo(() => {
    const shotsFaced = officialAdvanced.reduce((n, a) => n + (a.shots_on_goal ?? 0), 0);
    if (shotsFaced <= 0) return "-";
    const saves = shotsFaced - goalie.goalsAgainst;
    return `${((saves / shotsFaced) * 100).toFixed(1)}%`;
  }, [officialAdvanced, goalie.goalsAgainst]);

  /** Game log complet des matchs officiels — un recruteur veut voir toute la saison, pas un aperçu. */
  const gameLog = useMemo(() => {
    const statByGame = new Map(officialStats.map((gs) => [gs.game_id, gs]));
    const advByGame = new Map(officialAdvanced.map((a) => [a.game_id, a]));
    return [...statByGame.keys()]
      .map((gameId) => ({ game: gamesById.get(gameId)!, gs: statByGame.get(gameId)!, adv: advByGame.get(gameId) }))
      .filter((r) => r.game)
      .sort((a, b) => (b.game.game_date > a.game.game_date ? 1 : -1));
  }, [officialStats, officialAdvanced, gamesById]);

  /** Dernier résultat de chaque test physique — un recruteur veut l'état actuel, pas l'historique. */
  const latestTests = useMemo(() => {
    const seen = new Set<string>();
    return testResults.filter((t) => {
      if (seen.has(t.test_name)) return false;
      seen.add(t.test_name);
      return true;
    });
  }, [testResults]);

  useEffect(() => {
    if (autoPrint && !loading && player && !autoPrinted.current) {
      autoPrinted.current = true;
      printWithOrientation("portrait", "10mm");
    }
  }, [autoPrint, loading, player]);

  if (notFoundFlag) notFound();
  if (loading || !player) return <p className="text-slate-500 p-6">Chargement...</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="no-print flex justify-end">
        <button className="btn" onClick={() => printWithOrientation("portrait", "10mm")}>
          🖨️ Exporter en PDF
        </button>
      </div>

      <div className="print-card bg-white text-ink-900 rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <Crest className="h-12 w-12" />
            <div>
              <div className="font-bold text-lg leading-tight">As de Québec M17 AAA</div>
              <div className="text-sm text-slate-500">Fiche de recrutement</div>
            </div>
          </div>
          {player.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.photo_url} alt={player.full_name} className="h-20 w-20 rounded-full object-cover border" />
          )}
        </div>

        <div>
          <h1 className="text-3xl font-black">{player.full_name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 mt-1">
            {player.jersey_number != null && <span>#{player.jersey_number}</span>}
            <span>{player.position ? POSITION_LABEL[player.position] : "-"}</span>
            {formatHeight(player.height_cm) && <span>{formatHeight(player.height_cm)}</span>}
            {player.weight_lbs != null && <span>{player.weight_lbs} lbs</span>}
          </div>
        </div>

        <div>
          <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-2">
            Statistiques — saison (matchs officiels)
          </h2>
          {isGoalie ? (
            <div className="grid grid-cols-4 gap-3 text-center">
              <StatBox label="PJ" value={goalie.gamesPlayed} />
              <StatBox label="Fiche" value={recordLabel(goalie)} />
              <StatBox label="Moy." value={goalie.average === null ? "-" : goalie.average.toFixed(2)} />
              <StatBox label="Eff. %" value={savePercentage} />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 text-center">
              <StatBox label="PJ" value={totals.gamesPlayed} />
              <StatBox label="B" value={totals.goals} />
              <StatBox label="A" value={totals.assists} />
              <StatBox label="PTS" value={totals.points} highlight />
              <StatBox label="+/-" value={formatNet(plusMinus)} />
              <StatBox label="TOI moy." value={averageToiLabel} />
              <StatBox label="Tirs %" value={shootingPercentage} />
              <StatBox label="MAJ %" value={faceoffPct} />
            </div>
          )}
        </div>

        {!isGoalie && officialAdvanced.length > 0 && (
          <div>
            <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-2">Statistiques avancées</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">TOI moyen</dt>
                <dd className="font-medium text-base">{averageToiLabel}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Tirs au but (saison)</dt>
                <dd className="font-medium text-base">{totalShots}</dd>
              </div>
              <div>
                <dt className="text-slate-500">XG (saison)</dt>
                <dd className="font-medium text-base">{totalXg.toFixed(1)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">XG per 20</dt>
                <dd className="font-medium text-base">{xgPer20Season}</dd>
              </div>
              <div>
                <dt className="text-slate-500">% Mises en jeu</dt>
                <dd className="font-medium text-base">{faceoffPct}</dd>
              </div>
              <div>
                <dt className="text-slate-500">% de tirs</dt>
                <dd className="font-medium text-base">{shootingPercentage}</dd>
              </div>
            </dl>
          </div>
        )}

        {latestTests.length > 0 && (
          <div>
            <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-2">Tests physiques</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {latestTests.map((t) => (
                <div key={t.id} className="flex justify-between border-b border-dashed pb-1">
                  <span className="text-slate-500">{t.test_name}</span>
                  <span className="font-medium">
                    {t.value}
                    {t.unit ? ` ${t.unit}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {gameLog.length > 0 && (
          <div>
            <h2 className="font-bold text-sm uppercase tracking-wide text-slate-500 mb-2">
              Game log ({gameLog.length} matchs)
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3">Adversaire</th>
                  {isGoalie ? (
                    <>
                      <th className="py-1 pr-3">Moy.</th>
                      <th className="py-1 pr-3">Eff. %</th>
                    </>
                  ) : (
                    <>
                      <th className="py-1 pr-3">B</th>
                      <th className="py-1 pr-3">A</th>
                      <th className="py-1 pr-3">P</th>
                      <th className="py-1 pr-3">+/-</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {gameLog.map(({ game, gs, adv }) => {
                  const team = findTeamByOpponent(game.opponent);
                  const minutes = gs.toi_minutes ?? (adv?.toi_seconds != null ? adv.toi_seconds / 60 : null);
                  const gamesEquiv = minutes ? minutes / regulationMinutes(game) : 0;
                  const gaa = gamesEquiv > 0 && gs.goals_against != null ? (gs.goals_against / gamesEquiv).toFixed(2) : "-";
                  const shotsFaced = adv?.shots_on_goal ?? 0;
                  const savePct =
                    shotsFaced > 0 && gs.goals_against != null
                      ? `${(((shotsFaced - gs.goals_against) / shotsFaced) * 100).toFixed(1)}%`
                      : "-";
                  return (
                    <tr key={game.id} className="border-b last:border-0">
                      <td className="py-1 pr-3 tabular-nums">{game.game_date}</td>
                      <td className="py-1 pr-3">{team?.name ?? game.opponent}</td>
                      {isGoalie ? (
                        <>
                          <td className="py-1 pr-3">{gaa}</td>
                          <td className="py-1 pr-3">{savePct}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-1 pr-3">{gs.goals}</td>
                          <td className="py-1 pr-3">{gs.assists}</td>
                          <td className="py-1 pr-3 font-medium">{gs.goals + gs.assists}</td>
                          <td className="py-1 pr-3">{adv?.plus_minus != null ? formatNet(adv.plus_minus) : "-"}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <div className={`font-black text-xl leading-none ${highlight ? "text-gold-600" : "text-ink-900"}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
