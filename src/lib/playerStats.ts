import type { Game, GameCategory, PlayerGameStat } from "./types";
import { findTeamByOpponent } from "./lheqTeams";

/** Les matchs préparatoires ne comptent pas dans une fiche. */
export const OFFICIAL_CATEGORIES: GameCategory[] = ["saison_reguliere", "series", "tournoi"];

export interface SkaterTotals {
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
}

export function skaterTotals(stats: PlayerGameStat[]): SkaterTotals {
  return stats.reduce(
    (acc, s) => ({
      gamesPlayed: acc.gamesPlayed + 1,
      goals: acc.goals + s.goals,
      assists: acc.assists + s.assists,
      points: acc.points + s.goals + s.assists,
    }),
    { gamesPlayed: 0, goals: 0, assists: 0, points: 0 }
  );
}

/**
 * Durée réglementaire d'un match, en minutes.
 *
 * Au M17 AAA on joue 50 minutes, sauf en tournoi où les périodes sont
 * raccourcies à 45. C'est cette durée — et non les 60 minutes du hockey
 * professionnel — qui sert de base à la moyenne de buts alloués.
 */
export function regulationMinutes(game: { category: GameCategory }): number {
  return game.category === "tournoi" ? 45 : 50;
}

export interface GoalieTotals {
  gamesPlayed: number;
  minutes: number;
  goalsAgainst: number;
  /**
   * Équivalent de matchs complets réellement gardés : minutes jouées divisées
   * par la durée réglementaire de CHAQUE match. Un gardien retiré en fin de
   * rencontre, ou une prolongation, se répercutent donc naturellement.
   */
  gamesEquivalent: number;
  /** Moyenne de buts alloués par match complet (50 min, 45 en tournoi). */
  average: number | null;
  wins: number;
  losses: number;
  ties: number;
}

/**
 * Fiche d'un gardien. Une partie ne compte que si des minutes lui sont
 * attribuées : sur une feuille de match, le deuxième gardien est inscrit même
 * s'il n'a pas joué une seconde.
 *
 * La décision (V/D) est celle de l'équipe ce match-là. C'est une approximation
 * assumée quand deux gardiens se partagent la rencontre — la feuille de la
 * ligue n'attribue pas la décision à un gardien en particulier.
 */
export function goalieTotals(stats: PlayerGameStat[], gameById: Map<string, Game>): GoalieTotals {
  let gamesPlayed = 0;
  let minutes = 0;
  let goalsAgainst = 0;
  let gamesEquivalent = 0;
  let wins = 0;
  let losses = 0;
  let ties = 0;

  for (const s of stats) {
    const played = (s.toi_minutes ?? 0) > 0;
    if (!played) continue;
    const g = gameById.get(s.game_id);
    gamesPlayed += 1;
    minutes += s.toi_minutes ?? 0;
    goalsAgainst += s.goals_against ?? 0;
    if (g) gamesEquivalent += (s.toi_minutes ?? 0) / regulationMinutes(g);

    if (g?.result === "W") wins += 1;
    else if (g?.result === "L" || g?.result === "OTL" || g?.result === "SOL") losses += 1;
    else if (g?.result === "T") ties += 1;
  }

  return {
    gamesPlayed,
    minutes,
    goalsAgainst,
    gamesEquivalent,
    average: gamesEquivalent > 0 ? goalsAgainst / gamesEquivalent : null,
    wins,
    losses,
    ties,
  };
}

export interface OpponentRecord {
  opponent: string;
  /** Nom complet de la ligue quand l'abréviation est reconnue. */
  label: string;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
  played: number;
}

/**
 * Fiche de l'équipe contre chaque adversaire. Les abréviations utilisées dans
 * la base (SAG, COR, TR…) sont regroupées sous le nom complet de l'équipe pour
 * qu'un même adversaire ne soit pas compté deux fois.
 */
export function recordsByOpponent(games: Game[], categories: GameCategory[] = OFFICIAL_CATEGORIES): OpponentRecord[] {
  const byTeam = new Map<string, OpponentRecord>();

  for (const g of games) {
    if (!g.result || !categories.includes(g.category)) continue;
    const team = findTeamByOpponent(g.opponent);
    const key = team?.slug ?? g.opponent.toLowerCase();
    const cur =
      byTeam.get(key) ??
      ({
        opponent: g.opponent,
        label: team?.name ?? g.opponent,
        wins: 0,
        losses: 0,
        ties: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        played: 0,
      } as OpponentRecord);

    cur.played += 1;
    cur.goalsFor += g.goals_for ?? 0;
    cur.goalsAgainst += g.goals_against ?? 0;
    if (g.result === "W") cur.wins += 1;
    else if (g.result === "T") cur.ties += 1;
    else cur.losses += 1;

    byTeam.set(key, cur);
  }

  return [...byTeam.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Fiche affichée en abrégé : « 3-1-0 ». */
export function recordLabel(r: { wins: number; losses: number; ties: number }): string {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

/**
 * Parties réellement jouées par un joueur.
 *
 * On ne peut pas se fier à player_game_stats : ce tableau ne contient que les
 * joueurs ayant récolté un point. Un joueur habillé mais non pointeur affichait
 * donc 0 partie jouée. C'est l'ALIGNEMENT de la journée qui fait foi.
 */
export function gamesPlayedFor(
  playerId: string,
  games: Game[],
  rosterByDate: Map<string, Set<string>>,
  categories?: GameCategory[]
): Game[] {
  return games.filter(
    (g) =>
      g.result &&
      (!categories || categories.includes(g.category)) &&
      rosterByDate.get(g.game_date)?.has(playerId)
  );
}

/** date d'alignement → identifiants des joueurs habillés ce jour-là. */
export function buildRosterByDate(
  lineups: { id: string; lineup_date: string }[],
  units: { lineup_id: string; unit_label: string; player_ids: string[] }[]
): Map<string, Set<string>> {
  const dateByLineup = new Map(lineups.map((l) => [l.id, l.lineup_date]));
  const map = new Map<string, Set<string>>();
  for (const u of units) {
    if (!u.unit_label.endsWith("(effectif)")) continue;
    const date = dateByLineup.get(u.lineup_id);
    if (!date) continue;
    const set = map.get(date) ?? new Set<string>();
    for (const id of u.player_ids) if (id) set.add(id);
    map.set(date, set);
  }
  return map;
}
