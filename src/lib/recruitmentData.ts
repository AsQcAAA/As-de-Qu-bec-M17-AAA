import type { SupabaseClient } from "@supabase/supabase-js";
import { findTeamByOpponent } from "./lheqTeams";
import { formatHeight } from "./height";
import { parsePenaltyCode } from "./penalties";
import { OFFICIAL_CATEGORIES, goalieTotals, recordLabel, regulationMinutes, skaterTotals } from "./playerStats";
import { averageToi, formatNet, secondsToToi, shootingPct } from "./tpeReport";
import type { Game, GameEvent, Player, PlayerGameAdvancedStat, PlayerGameStat } from "./types";

const POSITION_LABEL: Record<string, string> = { F: "Attaquant", D: "Défenseur", G: "Gardien" };

export interface RecruitmentSummaryBox {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface RecruitmentLogRow {
  date: string;
  opponent: string;
  /** Une cellule par colonne de `logColumns`. */
  cells: string[];
}

export interface RecruitmentData {
  player: Player;
  positionLabel: string;
  heightLabel: string | null;
  boxes: RecruitmentSummaryBox[];
  logColumns: string[];
  log: RecruitmentLogRow[];
}

/**
 * Données de la fiche de recrutement d'un joueur — les mêmes chiffres que la
 * page /joueurs/[id]/export (matchs officiels seulement, ni xG ni tests
 * physiques, ni rencontres individuelles, absences ou dossier médical).
 */
export async function loadRecruitmentData(supabase: SupabaseClient, playerId: string): Promise<RecruitmentData> {
  const [{ data: p }, { data: pgs }, { data: gms }, { data: adv }, { data: evs }] = await Promise.all([
    supabase.from("players").select("*").eq("id", playerId).single(),
    supabase.from("player_game_stats").select("*").eq("player_id", playerId),
    supabase.from("games").select("*"),
    supabase.from("player_game_advanced_stats").select("*").eq("player_id", playerId),
    supabase
      .from("game_events")
      .select("*")
      .or(`player_id.eq.${playerId},assist1_player_id.eq.${playerId},assist2_player_id.eq.${playerId}`),
  ]);
  const player = p as Player;
  const games = (gms ?? []) as Game[];
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const isOfficial = (gameId: string) => {
    const g = gamesById.get(gameId);
    return !!g && OFFICIAL_CATEGORIES.includes(g.category);
  };
  const stats = ((pgs ?? []) as PlayerGameStat[]).filter((s) => isOfficial(s.game_id));
  const advanced = ((adv ?? []) as PlayerGameAdvancedStat[]).filter((a) => isOfficial(a.game_id));
  const events = ((evs ?? []) as GameEvent[]).filter((e) => isOfficial(e.game_id));

  const isGoalie = player.position === "G";
  const statByGame = new Map(stats.map((s) => [s.game_id, s]));
  const advByGame = new Map(advanced.map((a) => [a.game_id, a]));
  const pimByGame = new Map<string, number>();
  let totalPim = 0;
  for (const e of events) {
    if (e.event_type !== "penalty" || e.player_id !== playerId) continue;
    const min = parsePenaltyCode(e.penalty_code ?? "").minutes;
    totalPim += min;
    pimByGame.set(e.game_id, (pimByGame.get(e.game_id) ?? 0) + min);
  }
  const ppGoals = events.filter((e) => e.event_type === "goal" && e.situation === "pp" && e.player_id === playerId).length;
  const ppAssists = events.filter(
    (e) => e.event_type === "goal" && e.situation === "pp" && (e.assist1_player_id === playerId || e.assist2_player_id === playerId)
  ).length;

  const gameIds = new Set<string>([...statByGame.keys(), ...advByGame.keys(), ...pimByGame.keys()]);
  const rows = [...gameIds]
    .map((id) => ({ game: gamesById.get(id)!, gs: statByGame.get(id) ?? null, adv: advByGame.get(id), pim: pimByGame.get(id) ?? 0 }))
    .filter((r) => r.game)
    .sort((a, b) => (b.game.game_date > a.game.game_date ? 1 : -1));

  const totals = skaterTotals(stats);
  const goalie = goalieTotals(stats, gamesById);
  const totalShots = advanced.reduce((n, a) => n + (a.shots_on_goal ?? 0), 0);
  const plusMinus = advanced.reduce((n, a) => n + (a.plus_minus ?? 0), 0);
  const faceoffWon = advanced.reduce((n, a) => n + (a.faceoffs_won ?? 0), 0);
  const faceoffLost = advanced.reduce((n, a) => n + (a.faceoffs_lost ?? 0), 0);
  const faceoffPct = faceoffWon + faceoffLost > 0 ? `${((faceoffWon / (faceoffWon + faceoffLost)) * 100).toFixed(1)}%` : "-";

  let boxes: RecruitmentSummaryBox[];
  let logColumns: string[];
  let log: RecruitmentLogRow[];

  if (isGoalie) {
    const shotsFaced = advanced.reduce((n, a) => n + (a.shots_on_goal ?? 0), 0);
    const savePct = shotsFaced > 0 ? `${(((shotsFaced - goalie.goalsAgainst) / shotsFaced) * 100).toFixed(1)}%` : "-";
    boxes = [
      { label: "PJ", value: String(goalie.gamesPlayed) },
      { label: "Fiche", value: recordLabel(goalie) },
      { label: "Moy.", value: goalie.average === null ? "-" : goalie.average.toFixed(2) },
      { label: "Eff. %", value: savePct },
    ];
    logColumns = ["Moy.", "Eff. %"];
    log = rows
      // Un gardien ne compte que les matchs où des minutes lui sont attribuées.
      .filter(({ gs, adv: a }) => (gs?.toi_minutes ?? (a?.toi_seconds != null ? a.toi_seconds / 60 : 0)) > 0)
      .map(({ game, gs, adv: a }) => {
      const minutes = gs?.toi_minutes ?? (a?.toi_seconds != null ? a.toi_seconds / 60 : null);
      const gamesEquiv = minutes ? minutes / regulationMinutes(game) : 0;
      const gaa = gamesEquiv > 0 && gs?.goals_against != null ? (gs.goals_against / gamesEquiv).toFixed(2) : "-";
      const faced = a?.shots_on_goal ?? 0;
      const sv = faced > 0 && gs?.goals_against != null ? `${(((faced - gs.goals_against) / faced) * 100).toFixed(1)}%` : "-";
      return { date: game.game_date, opponent: findTeamByOpponent(game.opponent)?.name ?? game.opponent, cells: [gaa, sv] };
    });
  } else {
    boxes = [
      { label: "PJ", value: String(rows.length) },
      { label: "B", value: String(totals.goals) },
      { label: "A", value: String(totals.assists) },
      { label: "PTS", value: String(totals.points), highlight: true },
      { label: "+/-", value: formatNet(plusMinus) },
      { label: "TOI moy.", value: averageToi(advanced.map((a) => a.toi_seconds)) },
      { label: "Tirs %", value: shootingPct(totals.goals, totalShots) },
      { label: "MAJ %", value: faceoffPct },
      { label: "Tirs", value: String(totalShots) },
      { label: "Pun. (min)", value: String(totalPim) },
      { label: "B en AN", value: String(ppGoals) },
      { label: "A en AN", value: String(ppAssists) },
    ];
    logColumns = ["B", "A", "P", "+/-", "Tirs", "TOI", "Pun."];
    log = rows.map(({ game, gs, adv: a, pim }) => {
      const g = gs?.goals ?? 0;
      const as = gs?.assists ?? 0;
      return {
        date: game.game_date,
        opponent: findTeamByOpponent(game.opponent)?.name ?? game.opponent,
        cells: [
          String(g),
          String(as),
          String(g + as),
          a?.plus_minus != null ? formatNet(a.plus_minus) : "-",
          a?.shots_on_goal != null ? String(a.shots_on_goal) : "-",
          a?.toi_seconds != null ? secondsToToi(a.toi_seconds) : "-",
          pim ? String(pim) : "-",
        ],
      };
    });
  }

  return {
    player,
    positionLabel: player.position ? POSITION_LABEL[player.position] : "-",
    heightLabel: formatHeight(player.height_cm),
    boxes,
    logColumns,
    log,
  };
}
