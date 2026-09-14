import { parsePenaltyCode } from "./penalties";

/**
 * Unités spéciales calculées à partir des TEMPS de la feuille de match, jamais
 * du résumé écrit par le marqueur — celui-ci s'est déjà révélé faux (un but en
 * avantage numérique déclaré à zéro).
 *
 * Deux règles portent tout le calcul :
 *
 *  1. Seules les punitions MINEURES (A, 2 min) et MAJEURES (B, 5 min) mettent
 *     une équipe en infériorité. Une inconduite (C, D, E) se purge sans retirer
 *     de joueur sur la glace : elle ne crée ni avantage ni désavantage.
 *
 *  2. Les punitions COÏNCIDENTES s'annulent : quand les deux équipes écopent
 *     au même moment d'une punition de même durée, personne n'est en avantage.
 *     On retire donc autant de punitions de chaque côté.
 */

export interface PenaltyLike {
  side: "us" | "opponent";
  period: string | null;
  time: string | null;
  code: string | null;
}

export interface GoalLike {
  side: "us" | "opponent";
  period: string | null;
  time: string | null;
}

export interface SpecialTeamsResult {
  ppGoals: number;
  ppOpportunities: number;
  pkKills: number;
  pkOpportunities: number;
  /** Fenêtres retenues, pour déduire la situation de chaque but. */
  windows: { side: "us" | "opponent"; period: number; start: number; end: number }[];
}

export function timeToSeconds(t: string | null): number {
  const m = t?.match(/(\d+)\s*[:.]\s*(\d+)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Punitions qui mettent réellement une équipe en infériorité. */
function isAdvantageCreating(code: string | null): boolean {
  const p = parsePenaltyCode(code ?? "");
  return p.severity === "A" || p.severity === "B";
}

/**
 * Retire les punitions coïncidentes : même période, même seconde, même durée,
 * une de chaque côté. Retourne les punitions qui créent vraiment une supériorité.
 */
export function removeCoincidental(penalties: PenaltyLike[]): PenaltyLike[] {
  const eligible = penalties.filter((p) => isAdvantageCreating(p.code));

  // Clé = période + temps + durée. Les punitions d'une même clé s'annulent
  // une pour une entre les deux équipes.
  const groups = new Map<string, { us: PenaltyLike[]; opponent: PenaltyLike[] }>();
  for (const p of eligible) {
    const key = `${p.period ?? "?"}|${timeToSeconds(p.time)}|${parsePenaltyCode(p.code ?? "").minutes}`;
    const g = groups.get(key) ?? { us: [], opponent: [] };
    g[p.side].push(p);
    groups.set(key, g);
  }

  const kept: PenaltyLike[] = [];
  for (const g of groups.values()) {
    const cancel = Math.min(g.us.length, g.opponent.length);
    kept.push(...g.us.slice(cancel), ...g.opponent.slice(cancel));
  }
  return kept;
}

export function computeSpecialTeams(penalties: PenaltyLike[], goals: GoalLike[]): SpecialTeamsResult {
  const effective = removeCoincidental(penalties);

  const windows = effective.map((p) => {
    const start = timeToSeconds(p.time);
    return {
      side: p.side,
      period: Number(p.period ?? 0),
      start,
      end: start + parsePenaltyCode(p.code ?? "").minutes * 60,
    };
  });

  const shorthanded = (side: "us" | "opponent", period: number, t: number) =>
    windows.some((w) => w.side === side && w.period === period && t >= w.start && t < w.end);

  let ppGoals = 0;
  let ppGoalsAgainst = 0;
  for (const g of goals) {
    const period = Number(g.period ?? 0);
    const t = timeToSeconds(g.time);
    const usShort = shorthanded("us", period, t);
    const themShort = shorthanded("opponent", period, t);
    if (usShort === themShort) continue; // forces égales (ou 4 contre 4)
    if (g.side === "us" && themShort) ppGoals += 1;
    if (g.side === "opponent" && usShort) ppGoalsAgainst += 1;
  }

  const ppOpportunities = effective.filter((p) => p.side === "opponent").length;
  const pkOpportunities = effective.filter((p) => p.side === "us").length;

  return {
    ppGoals,
    ppOpportunities,
    pkKills: pkOpportunities - ppGoalsAgainst,
    pkOpportunities,
    windows,
  };
}

/** Situation d'un but, à partir des fenêtres retenues. */
export function goalSituation(
  goal: GoalLike,
  windows: SpecialTeamsResult["windows"]
): "even" | "pp" | "sh" {
  const period = Number(goal.period ?? 0);
  const t = timeToSeconds(goal.time);
  const active = (side: "us" | "opponent") =>
    windows.some((w) => w.side === side && w.period === period && t >= w.start && t < w.end);
  const usShort = active("us");
  const themShort = active("opponent");
  if (usShort === themShort) return "even";
  if (goal.side === "us") return themShort ? "pp" : "sh";
  return usShort ? "pp" : "sh";
}
