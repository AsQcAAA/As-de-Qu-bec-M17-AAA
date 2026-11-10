import { regulationMinutes } from "@/lib/playerStats";
import type { Game, GameEvent, Player, PlayerGameAdvancedStat } from "@/lib/types";

/**
 * Temps de glace « égal » : ce que chaque patineur jouerait si tout le monde
 * se partageait la glace à parts égales.
 *
 * Par match, on simule le nombre de patineurs de l'équipe sur la glace, seconde
 * après seconde : 5 en temps normal et en avantage numérique, 4 pendant une
 * punition à nous, 3 pendant deux punitions simultanées. Le total de
 * patineurs-minutes, divisé par le nombre de patineurs qui ont joué, donne la
 * part égale du match.
 *
 * Punitions (code = lettre de sévérité + numéro d'infraction) :
 *  - A : 2 min, qui prend fin si l'adversaire marque pendant l'avantage numérique ;
 *  - B : 5 min, sans fin anticipée ;
 *  - les autres lettres (inconduites, expulsions) ne laissent pas l'équipe en
 *    désavantage numérique : elles sont ignorées.
 * Les périodes sont de durée égale (50 min en saison, 45 en tournoi) ; les temps
 * de la feuille de match sont du temps écoulé dans la période.
 */

/** Joueurs retirés du tableau (appels en renfort trop peu représentatifs). */
const HIDDEN_PLAYERS = ["jacob lapointe", "samuel boivin", "william dionne", "raphael delarosbil"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const isHiddenFromIceTime = (p: Player) => HIDDEN_PLAYERS.includes(norm(p.full_name));

const clockSeconds = (t: string | null) => {
  const m = /^(\d+):(\d+)$/.exec((t ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

interface Pen {
  side: "us" | "opponent";
  start: number;
  end: number;
  minor: boolean;
}

/** Fin anticipée des mineures : un but contre pendant que l'équipe est réellement en désavantage. */
function endEarly(mine: Pen[], theirs: Pen[], goalsAgainst: number[]) {
  for (const gs of goalsAgainst) {
    const act = mine.filter((p) => p.start <= gs && p.end > gs).sort((a, b) => a.start - b.start);
    const oppAct = theirs.filter((p) => p.start <= gs && p.end > gs).length;
    if (act.length > oppAct) {
      const m = act.find((p) => p.minor);
      if (m) m.end = gs;
    }
  }
}

/** Patineurs-secondes de l'équipe pour un match, d'après ses punitions et les buts. */
export function skaterSecondsAvailable(game: Pick<Game, "category">, events: GameEvent[]): number {
  const total = regulationMinutes(game) * 60;
  const periodLen = total / 3;
  const at = (e: GameEvent) => {
    const s = clockSeconds(e.time);
    if (s == null) return null;
    const period = Math.min(Math.max(Number(e.period) || 1, 1), 3);
    return (period - 1) * periodLen + Math.min(s, periodLen);
  };

  const pens: Pen[] = [];
  for (const e of events) {
    if (e.event_type !== "penalty") continue;
    const sev = (e.penalty_code ?? "")[0];
    if (sev !== "A" && sev !== "B") continue;
    const start = at(e);
    if (start == null) continue;
    pens.push({ side: e.side, start, end: Math.min(start + (sev === "A" ? 120 : 300), total), minor: sev === "A" });
  }
  const mine = pens.filter((p) => p.side === "us");
  const theirs = pens.filter((p) => p.side === "opponent");
  const goalTimes = (side: GameEvent["side"]) =>
    events
      .filter((e) => e.event_type === "goal" && e.side === side)
      .map(at)
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b);
  endEarly(mine, theirs, goalTimes("opponent"));
  endEarly(theirs, mine, goalTimes("us"));

  const cuts = [0, total, ...mine.flatMap((p) => [p.start, p.end])].filter((x) => x >= 0 && x <= total).sort((a, b) => a - b);
  let pool = 0;
  for (let i = 0; i < cuts.length - 1; i++) {
    const dt = cuts[i + 1] - cuts[i];
    if (dt <= 0) continue;
    const mid = (cuts[i] + cuts[i + 1]) / 2;
    const k = mine.filter((p) => p.start <= mid && p.end > mid).length;
    pool += dt * (5 - Math.min(k, 2));
  }
  return pool;
}

export interface IceTimeEqualRow {
  player: Player;
  games: number;
  /** Secondes par match. */
  toi: number;
  equal: number;
  /** Écart moyen par match (secondes) : positif = plus de glace que la part égale. */
  diff: number;
  /** Écart cumulé sur les matchs (secondes). */
  diffTotal: number;
  /** Écart en % de la part égale. */
  pct: number;
}

export interface IceTimeEqualResult {
  rows: IceTimeEqualRow[];
  /** Part égale moyenne par match (secondes) et nombre de matchs comptés. */
  equalAvg: number | null;
  games: number;
}

export function computeIceTimeEqual(
  games: Game[],
  stats: PlayerGameAdvancedStat[],
  events: GameEvent[],
  skaters: Player[]
): IceTimeEqualResult {
  const skaterById = new Map(skaters.map((p) => [p.id, p]));
  const eventsByGame = new Map<string, GameEvent[]>();
  for (const e of events) eventsByGame.set(e.game_id, [...(eventsByGame.get(e.game_id) ?? []), e]);

  const acc = new Map<string, { games: number; toi: number; equal: number }>();
  let equalSum = 0;
  let equalN = 0;
  let counted = 0;
  for (const g of games) {
    const rows = stats.filter((s) => s.game_id === g.id && s.toi_seconds != null && s.toi_seconds > 0 && skaterById.has(s.player_id));
    if (rows.length === 0) continue;
    const equal = skaterSecondsAvailable(g, eventsByGame.get(g.id) ?? []) / rows.length;
    counted += 1;
    for (const r of rows) {
      const cur = acc.get(r.player_id) ?? { games: 0, toi: 0, equal: 0 };
      cur.games += 1;
      cur.toi += r.toi_seconds as number;
      cur.equal += equal;
      acc.set(r.player_id, cur);
      equalSum += equal;
      equalN += 1;
    }
  }

  const out: IceTimeEqualRow[] = [];
  for (const [id, a] of acc) {
    const player = skaterById.get(id);
    if (!player || isHiddenFromIceTime(player)) continue;
    out.push({
      player,
      games: a.games,
      toi: a.toi / a.games,
      equal: a.equal / a.games,
      diff: (a.toi - a.equal) / a.games,
      diffTotal: a.toi - a.equal,
      pct: a.equal > 0 ? ((a.toi - a.equal) / a.equal) * 100 : 0,
    });
  }
  out.sort((a, b) => b.diff - a.diff);
  return { rows: out, equalAvg: equalN > 0 ? equalSum / equalN : null, games: counted };
}
