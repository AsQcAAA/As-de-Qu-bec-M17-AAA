import { OPPONENT_TEAMS } from "@/lib/lheqTeams";
import {
  OUR_TEAM,
  TOURNAMENT_GAMES,
  TOURNAMENT_TEAM_SLUG,
  type TournamentGame,
  type TournamentSlot,
} from "@/lib/tournoiStAugustin";

export interface TournamentResult {
  game_no: number;
  score_a: number;
  score_b: number;
}

/** Une case du tableau une fois résolue : l'équipe si elle est connue, sinon d'où elle viendra. */
export interface ResolvedSlot {
  /** Nom tel qu'écrit dans le tableau (clé de TOURNAMENT_TEAM_SLUG), ou null si pas encore connue. */
  team: string | null;
  /** « Gagnant #12 » / « Perdant #7 » quand l'équipe n'est pas encore connue. */
  pending: string | null;
  /** Match dont on attend le résultat. */
  waitingOn: number | null;
}

export interface ResolvedGame extends TournamentGame {
  ra: ResolvedSlot;
  rb: ResolvedSlot;
  scoreA: number | null;
  scoreB: number | null;
  played: boolean;
}

/** Résout tout le tableau d'après les pointages saisis (aucun nul : le plus haut pointage gagne). */
export function resolveTournament(results: TournamentResult[]): ResolvedGame[] {
  const byNo = new Map(results.map((r) => [r.game_no, r]));
  const gameByNo = new Map(TOURNAMENT_GAMES.map((g) => [g.no, g]));
  const memo = new Map<number, ResolvedGame>();

  const resolveSlot = (slot: TournamentSlot): ResolvedSlot => {
    if ("team" in slot) return { team: slot.team, pending: null, waitingOn: null };
    const src = resolveGame(slot.from);
    if (src.played && src.scoreA !== src.scoreB) {
      const aWins = src.scoreA! > src.scoreB!;
      const pick = (slot.kind === "W") === aWins ? src.ra : src.rb;
      if (pick.team) return { team: pick.team, pending: null, waitingOn: null };
      return { team: null, pending: `${slot.kind === "W" ? "Gagnant" : "Perdant"} #${slot.from}`, waitingOn: pick.waitingOn };
    }
    return { team: null, pending: `${slot.kind === "W" ? "Gagnant" : "Perdant"} #${slot.from}`, waitingOn: slot.from };
  };

  function resolveGame(no: number): ResolvedGame {
    const cached = memo.get(no);
    if (cached) return cached;
    const g = gameByNo.get(no)!;
    const r = byNo.get(no);
    const out: ResolvedGame = {
      ...g,
      ra: { team: null, pending: null, waitingOn: null },
      rb: { team: null, pending: null, waitingOn: null },
      scoreA: r?.score_a ?? null,
      scoreB: r?.score_b ?? null,
      played: !!r,
    };
    memo.set(no, out);
    out.ra = resolveSlot(g.a);
    out.rb = resolveSlot(g.b);
    return out;
  }

  return TOURNAMENT_GAMES.map((g) => resolveGame(g.no));
}

/** Nom affiché + logo d'une équipe du tableau. */
export function teamDisplay(team: string): { name: string; logo: string | null; slug: string | null } {
  const slug = TOURNAMENT_TEAM_SLUG[team] ?? null;
  const league = slug ? OPPONENT_TEAMS.find((t) => t.slug === slug) : undefined;
  if (league) return { name: league.name, logo: league.logo, slug };
  if (slug === "as-de-quebec") return { name: "As de Québec", logo: "/logos/as-de-quebec.png", slug };
  const pretty = team.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return { name: pretty, logo: null, slug: null };
}

export const isOurs = (r: ResolvedSlot) => r.team === OUR_TEAM;

/** Nos matchs du tableau, dans l'ordre chronologique, dès que notre case est connue. */
export function ourGames(games: ResolvedGame[]): ResolvedGame[] {
  return games
    .filter((g) => isOurs(g.ra) || isOurs(g.rb))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Notre prochain match à jouer : le premier sans pointage, avec l'adversaire s'il est connu. */
export function nextOurGame(games: ResolvedGame[]) {
  const next = ourGames(games).find((g) => !g.played);
  if (!next) return null;
  const opp = isOurs(next.ra) ? next.rb : next.ra;
  return { game: next, opponent: opp.team, waitingOn: opp.waitingOn, pending: opp.pending };
}
