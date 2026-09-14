"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { parsePenaltyCode } from "@/lib/penalties";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { RESULT_COLOR, matchupLabel, scoreInDisplayOrder } from "@/lib/gameResults";
import { recordLabel } from "@/lib/playerStats";
import type { Game, GameCategory, GameEvent, GameZoneStat } from "@/lib/types";

const CATEGORY_LABEL: Record<GameCategory, string> = {
  hors_concours: "Hors concours",
  saison_reguliere: "Saison régulière",
  series: "Séries",
  tournoi: "Tournoi",
};
const CATEGORY_ORDER: GameCategory[] = ["saison_reguliere", "series", "tournoi", "hors_concours"];

/** Une statistique d'équipe, avec sa moyenne par match quand elle en a une. */
function StatCard({
  label,
  value,
  average,
  hint,
}: {
  label: string;
  value: string;
  average?: string;
  hint?: string;
}) {
  return (
    <div className="card space-y-1">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-3xl font-black text-ink-900">{value}</div>
      {average && <div className="text-sm text-slate-600">{average} par match</div>}
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

/** Fiche à domicile ou sur la route : V-D(-N), buts pour et contre. */
function RecordCard({ label, icon, record }: { label: string; icon: string; record: TeamRecord }) {
  return (
    <div className="card space-y-1">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {icon} {label}
      </div>
      <div className="text-3xl font-black text-ink-900 tabular-nums">
        {record.played === 0 ? "-" : recordLabel(record)}
      </div>
      <div className="text-sm text-slate-600">
        {record.played} match{record.played > 1 ? "s" : ""}
        {record.played > 0 ? ` · ${record.goalsFor} BP / ${record.goalsAgainst} BC` : ""}
      </div>
    </div>
  );
}

interface TeamRecord {
  played: number;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
}

function buildRecord(games: Game[]): TeamRecord {
  const r: TeamRecord = { played: 0, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
  for (const g of games) {
    r.played += 1;
    r.goalsFor += g.goals_for ?? 0;
    r.goalsAgainst += g.goals_against ?? 0;
    if (g.result === "W") r.wins += 1;
    else if (g.result === "T") r.ties += 1;
    else r.losses += 1;
  }
  return r;
}

/**
 * Statistiques d'équipe, compilées à partir des feuilles de match.
 *
 * Les pourcentages d'unités spéciales viennent des cases « A.N. » et « D.N. »
 * de la feuille officielle, pas d'un recalcul : c'est le marqueur officiel qui
 * décide de ce qui compte comme occasion (punitions annulées, pénalités
 * différées, etc.).
 *   % avantage numérique = buts marqués en AN / occasions en AN
 *   % désavantage        = punitions tuées / fois en infériorité
 */
export default function StatistiquesEquipePage() {
  const supabase = createClient();
  const [games, setGames] = useState<Game[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  /** Mises en jeu par zone — saisies depuis le rapport de statistiques avancées. */
  const [zoneStats, setZoneStats] = useState<GameZoneStat[]>([]);
  const [categories, setCategories] = useState<Set<GameCategory>>(new Set(["saison_reguliere"]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: gms }, { data: ev }, { data: zones }] = await Promise.all([
        supabase.from("games").select("*"),
        supabase.from("game_events").select("*"),
        supabase.from("game_zone_stats").select("*"),
      ]);
      setGames(gms ?? []);
      setEvents(ev ?? []);
      setZoneStats(zones ?? []);
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

  const stats = useMemo(() => {
    const played = games.filter((g) => g.result && categories.has(g.category));
    const ids = new Set(played.map((g) => g.id));

    const goalsFor = played.reduce((n, g) => n + (g.goals_for ?? 0), 0);
    const goalsAgainst = played.reduce((n, g) => n + (g.goals_against ?? 0), 0);

    const ourPenalties = events.filter((e) => ids.has(e.game_id) && e.side === "us" && e.event_type === "penalty");
    const penaltyMinutes = ourPenalties.reduce((n, e) => n + parsePenaltyCode(e.penalty_code ?? "").minutes, 0);

    const ppGoals = played.reduce((n, g) => n + (g.pp_goals ?? 0), 0);
    const ppOpp = played.reduce((n, g) => n + (g.pp_opportunities ?? 0), 0);
    const pkKills = played.reduce((n, g) => n + (g.pk_kills ?? 0), 0);
    const pkOpp = played.reduce((n, g) => n + (g.pk_opportunities ?? 0), 0);

    // Tirs, mises au jeu et xG d'équipe — rapport TPE, uniquement les matchs
    // où il a été téléversé.
    const withShots = played.filter((g) => g.shots_on_goal_us != null);
    const shotsFor = withShots.reduce((n, g) => n + (g.shots_on_goal_us ?? 0), 0);
    const shotsAgainst = withShots.reduce((n, g) => n + (g.shots_on_goal_opponent ?? 0), 0);
    // Mises au jeu : rapport TPE seulement — les anciennes saisies par zone
    // restent visibles match par match dans le tableau ci-dessous, mais ne
    // sont pas mélangées dans ce total.
    const withFaceoffs = played.filter((g) => g.faceoffs_us_won != null);
    const faceoffsWon = withFaceoffs.reduce((n, g) => n + (g.faceoffs_us_won ?? 0), 0);
    const faceoffsLost = withFaceoffs.reduce((n, g) => n + (g.faceoffs_us_lost ?? 0), 0);
    const withXg = played.filter((g) => g.team_xg_us != null);
    const xgFor = withXg.reduce((n, g) => n + (g.team_xg_us ?? 0), 0);
    const xgAgainst = withXg.reduce((n, g) => n + (g.team_xg_opponent ?? 0), 0);

    const n = played.length;
    return {
      games: n,
      goalsFor,
      goalsAgainst,
      penalties: ourPenalties.length,
      penaltyMinutes,
      ppGoals,
      ppOpp,
      pkKills,
      pkOpp,
      ppPct: ppOpp > 0 ? (ppGoals / ppOpp) * 100 : null,
      pkPct: pkOpp > 0 ? (pkKills / pkOpp) * 100 : null,
      avgGoalsFor: n > 0 ? goalsFor / n : null,
      avgGoalsAgainst: n > 0 ? goalsAgainst / n : null,
      avgPenalties: n > 0 ? ourPenalties.length / n : null,
      shotsFor,
      shotsAgainst,
      shotsGames: withShots.length,
      faceoffPct: faceoffsWon + faceoffsLost > 0 ? (faceoffsWon / (faceoffsWon + faceoffsLost)) * 100 : null,
      xgFor,
      xgAgainst,
      xgGames: withXg.length,
    };
  }, [games, events, categories]);

  const fmt = (v: number | null, digits = 1) => (v === null ? "-" : v.toFixed(digits));

  const homeRecord = useMemo(
    () => buildRecord(games.filter((g) => g.result && categories.has(g.category) && g.is_home)),
    [games, categories]
  );
  const awayRecord = useMemo(
    () => buildRecord(games.filter((g) => g.result && categories.has(g.category) && !g.is_home)),
    [games, categories]
  );

  /** Une ligne de game log : le match, plus ce qu'on sait de lui. */
  const gameLog = useMemo(() => {
    const pimByGame = new Map<string, number>();
    for (const e of events) {
      if (e.side !== "us" || e.event_type !== "penalty") continue;
      pimByGame.set(e.game_id, (pimByGame.get(e.game_id) ?? 0) + parsePenaltyCode(e.penalty_code ?? "").minutes);
    }
    // Mises en jeu : les trois zones d'un match se totalisent en un seul %.
    const faceoffsByGame = new Map<string, { won: number; lost: number }>();
    for (const z of zoneStats) {
      const cur = faceoffsByGame.get(z.game_id) ?? { won: 0, lost: 0 };
      cur.won += z.faceoffs_won;
      cur.lost += z.faceoffs_lost;
      faceoffsByGame.set(z.game_id, cur);
    }

    return games
      .filter((g) => g.result && categories.has(g.category))
      .sort((a, b) => (a.game_date < b.game_date ? 1 : -1))
      .map((g) => {
        // Le rapport TPE (faceoffs_us_won/lost) est la source depuis qu'il
        // existe ; les anciennes saisies par zone restent utilisées pour les
        // matchs d'avant, jamais les deux mélangées pour un même match.
        const total =
          g.faceoffs_us_won != null
            ? (g.faceoffs_us_won ?? 0) + (g.faceoffs_us_lost ?? 0)
            : (faceoffsByGame.get(g.id)?.won ?? 0) + (faceoffsByGame.get(g.id)?.lost ?? 0);
        const won = g.faceoffs_us_won != null ? (g.faceoffs_us_won ?? 0) : (faceoffsByGame.get(g.id)?.won ?? 0);
        return {
          game: g,
          team: findTeamByOpponent(g.opponent),
          pim: pimByGame.get(g.id) ?? 0,
          faceoffPct: total > 0 ? (won / total) * 100 : null,
        };
      });
  }, [games, events, zoneStats, categories]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Statistiques d&apos;équipe</h1>
        <p className="text-slate-400 text-sm">
          Compilé automatiquement après chaque feuille de match téléversée.
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
      ) : stats.games === 0 ? (
        <p className="text-sm text-slate-400">Aucun match joué dans les types sélectionnés.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <StatCard
              label="Avantage numérique"
              value={stats.ppPct === null ? "-" : `${fmt(stats.ppPct)} %`}
              hint={`${stats.ppGoals} but(s) en ${stats.ppOpp} occasion(s)`}
            />
            <StatCard
              label="Désavantage numérique"
              value={stats.pkPct === null ? "-" : `${fmt(stats.pkPct)} %`}
              hint={`${stats.pkKills} punition(s) tuée(s) sur ${stats.pkOpp}`}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <RecordCard label="Fiche à domicile" icon="🏠" record={homeRecord} />
            <RecordCard label="Fiche sur la route" icon="🚌" record={awayRecord} />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard
              label="Buts marqués"
              value={String(stats.goalsFor)}
              average={fmt(stats.avgGoalsFor, 2)}
            />
            <StatCard
              label="Buts encaissés"
              value={String(stats.goalsAgainst)}
              average={fmt(stats.avgGoalsAgainst, 2)}
            />
            <StatCard
              label="Punitions"
              value={String(stats.penalties)}
              average={fmt(stats.avgPenalties, 2)}
              hint={`${stats.penaltyMinutes} minutes au total`}
            />
          </div>

          <p className="text-xs text-slate-500">
            Sur {stats.games} match(s) joué(s). Les pourcentages d&apos;unités spéciales proviennent des cases
            « A.N. » et « D.N. » de la feuille officielle.
          </p>

          {stats.shotsGames > 0 && (
            <div className="grid sm:grid-cols-3 gap-4">
              <StatCard
                label="Tirs au but"
                value={`${stats.shotsFor} - ${stats.shotsAgainst}`}
                hint={`Nous - adversaire, sur ${stats.shotsGames} match(s) avec rapport TPE`}
              />
              <StatCard
                label="Mises au jeu"
                value={stats.faceoffPct === null ? "-" : `${fmt(stats.faceoffPct)} %`}
                hint="Gagnées, rapport TPE"
              />
              {stats.xgGames > 0 && (
                <StatCard
                  label="xG d'équipe"
                  value={`${stats.xgFor.toFixed(1)} - ${stats.xgAgainst.toFixed(1)}`}
                  hint={`Nous - adversaire, sur ${stats.xgGames} match(s)`}
                />
              )}
            </div>
          )}

          {/* ---- Game log ---- */}
          <section className="card space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold">Game log</h2>
              <span className="text-xs text-slate-400">
                {gameLog.length} match{gameLog.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Match</th>
                    <th className="py-2 pr-3">Résultat</th>
                    <th className="py-2 pr-3 text-right">Score</th>
                    <th className="py-2 pr-3 text-right">AN</th>
                    <th className="py-2 pr-3 text-right">DN</th>
                    <th className="py-2 pr-3 text-right">PIM</th>
                    <th className="py-2 pr-3 text-right">MEJ</th>
                    <th className="py-2 text-right" title="Tirs au but — nous / adversaire (rapport TPE)">Tirs</th>
                  </tr>
                </thead>
                <tbody>
                  {gameLog.map(({ game: g, team, pim, faceoffPct }) => (
                    <tr key={g.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{g.game_date}</td>
                      <td className="py-2 pr-3">
                        <Link href={`/resultats/${g.id}`} className="flex items-center gap-2 hover:underline">
                          {team?.logo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={team.logo} alt={team.name} className="h-5 w-5 shrink-0 object-contain" />
                          )}
                          <span className="whitespace-nowrap">{matchupLabel(g, team?.name)}</span>
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`badge ${RESULT_COLOR[g.result!]}`}>{g.result}</span>
                      </td>
                      <td className="py-2 pr-3 text-right font-bold tabular-nums">{scoreInDisplayOrder(g) ?? "-"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {g.pp_opportunities ? `${g.pp_goals ?? 0}/${g.pp_opportunities}` : "-"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {g.pk_opportunities ? `${g.pk_kills ?? 0}/${g.pk_opportunities}` : "-"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pim}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {faceoffPct === null ? (
                          <span className="text-slate-300">-</span>
                        ) : (
                          `${fmt(faceoffPct)} %`
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {g.shots_on_goal_us != null ? `${g.shots_on_goal_us}-${g.shots_on_goal_opponent ?? "?"}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              Score dans l&apos;ordre d&apos;affichage du duel (équipe visiteuse d&apos;abord). MEJ = mises en jeu
              gagnées, saisies depuis le rapport de statistiques avancées.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
