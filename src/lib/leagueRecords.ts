// Fiche de chaque équipe d'après le calendrier : sans dépendance serveur, utilisable aussi dans le navigateur.

import { OPPONENT_TEAMS } from "./lheqTeams";
import type { LeagueGame } from "./leagueSchedule";

export interface TeamRecord {
  slug: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  /** Chronologique, du plus ancien au plus récent : V, D ou N. */
  results: ("V" | "D" | "N")[];
}

/** Fiche de chaque équipe d'après les matchs déjà joués (score connu). */
export function computeRecords(games: LeagueGame[]): TeamRecord[] {
  const byTeam = new Map<string, TeamRecord>();
  for (const t of OPPONENT_TEAMS) byTeam.set(t.slug, { slug: t.slug, name: t.name, wins: 0, losses: 0, ties: 0, results: [] });
  // Un « 0 - 0 » n'est jamais un vrai résultat : c'est un match pas encore saisi
  // (ex. Piché–Albatros du 4 octobre, absent du classement officiel).
  const played = games
    .filter((g) => g.homeScore != null && g.awayScore != null && !(g.homeScore === 0 && g.awayScore === 0))
    .sort((a, b) => a.date.localeCompare(b.date));
  const apply = (slug: string, own: number, other: number) => {
    const rec = byTeam.get(slug);
    if (!rec) return;
    if (own > other) {
      rec.wins++;
      rec.results.push("V");
    } else if (own < other) {
      rec.losses++;
      rec.results.push("D");
    } else {
      rec.ties++;
      rec.results.push("N");
    }
  };
  for (const g of played) {
    apply(g.home, g.homeScore!, g.awayScore!);
    apply(g.away, g.awayScore!, g.homeScore!);
  }
  return [...byTeam.values()];
}
