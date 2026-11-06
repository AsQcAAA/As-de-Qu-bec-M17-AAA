import type { SupabaseClient } from "@supabase/supabase-js";
import { OPPONENT_TEAMS } from "@/lib/lheqTeams";
import {
  OUR_TEAM,
  TOURNAMENT_GAMES,
  TOURNAMENT_SLUG,
  TOURNAMENT_TITLE,
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

let syncing: Promise<boolean> | null = null;

/**
 * Dès que l'adversaire de notre prochain match du tournoi est connu, crée le match
 * (et sa ligne d'horaire) s'ils n'existent pas. Renvoie « true » si quelque chose a été créé.
 */
export function syncTournamentNextGame(supabase: SupabaseClient): Promise<boolean> {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const { data: res } = await supabase.from("tournament_results").select("game_no, score_a, score_b").eq("tournament", TOURNAMENT_SLUG);
      const next = nextOurGame(resolveTournament((res ?? []) as TournamentResult[]));
      if (!next || !next.opponent) return false;
      const g = next.game;
      const opp = teamDisplay(next.opponent).name;
      const { data: existing } = await supabase.from("games").select("id, opponent").eq("game_date", g.date);
      if ((existing ?? []).some((x) => x.opponent.toLowerCase() === opp.toLowerCase())) return false;
      const { error } = await supabase.from("games").insert({
        game_date: g.date,
        opponent: opp,
        location: `${g.rink} — Complexe sportif St-Augustin`,
        is_home: null,
        category: "tournoi",
        notes: `${TOURNAMENT_TITLE} — match #${g.no}`,
      });
      if (error) return false;
      await supabase.from("schedule_events").insert({
        event_date: g.date,
        start_time: g.time,
        event_type: "game",
        title: `M17 AAA vs ${opp} - ${g.time.slice(0, 2)}h${g.time.slice(3, 5)} - ${g.rink}`,
      });
      return true;
    } finally {
      setTimeout(() => (syncing = null), 2000);
    }
  })();
  return syncing;
}

export interface ParsedLike {
  no: number;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
}

const letters = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const sameTeam = (pdfName: string | null, key: string | null) => !!pdfName && !!key && letters(pdfName).includes(letters(key).slice(0, 5));

/**
 * Remet les pointages du PDF dans l'ordre des cases du tableau. Le PDF peut placer les équipes
 * visiteur / local dans l'ordre inverse de notre tableau : on se fie aux noms d'équipes, pas
 * aux colonnes. Les matchs sont traités dans l'ordre (chaque case ne dépend que de matchs
 * précédents), en comptant les pointages du PDF lui-même.
 */
export function orientParsed(parsed: ParsedLike[], existing: TournamentResult[]): (ParsedLike & { swapped: boolean })[] {
  const acc = new Map(existing.map((r) => [r.game_no, r]));
  const out: (ParsedLike & { swapped: boolean })[] = [];
  for (const g of [...parsed].sort((x, y) => x.no - y.no)) {
    let cur = { ...g, swapped: false };
    if (g.scoreA !== null && g.scoreB !== null) {
      const known = resolveTournament([...acc.values()]).find((x) => x.no === g.no);
      const a = known?.ra.team ?? null;
      const b = known?.rb.team ?? null;
      const straight = sameTeam(g.teamA, a) || sameTeam(g.teamB, b);
      const flipped = sameTeam(g.teamA, b) || sameTeam(g.teamB, a);
      if (flipped && !straight) cur = { ...g, teamA: g.teamB, teamB: g.teamA, scoreA: g.scoreB, scoreB: g.scoreA, swapped: true };
      if (cur.scoreA !== cur.scoreB) acc.set(g.no, { game_no: g.no, score_a: cur.scoreA!, score_b: cur.scoreB! });
    }
    out.push(cur);
  }
  return out;
}
