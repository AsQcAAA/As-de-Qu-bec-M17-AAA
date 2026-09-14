import { timeToSeconds } from "./specialTeams";

/**
 * But gagnant.
 *
 * Convention du hockey : c'est le but qui donne à l'équipe victorieuse une
 * avance définitive, autrement dit son (N+1)ᵉ but, où N est le total final du
 * perdant. Une victoire 2-1 fait donc du 2ᵉ but de l'équipe gagnante le but
 * gagnant — pas le dernier marqué.
 *
 * Rien n'est attribué en cas de match nul.
 *
 * Le calcul se fait à l'affichage plutôt que d'être stocké : si un pointage est
 * corrigé, le but gagnant suit automatiquement, sans données à reprendre.
 */
export interface GoalLike {
  id: string;
  side: "us" | "opponent";
  event_type: string;
  period: string | null;
  time: string | null;
}

export function gameWinningGoalId(
  events: GoalLike[],
  game: { goals_for: number | null; goals_against: number | null }
): string | null {
  const { goals_for: gf, goals_against: ga } = game;
  if (gf == null || ga == null || gf === ga) return null;

  const winner: "us" | "opponent" = gf > ga ? "us" : "opponent";
  const loserTotal = Math.min(gf, ga);

  const winnerGoals = events
    .filter((e) => e.event_type === "goal" && e.side === winner)
    .sort(
      (a, b) =>
        Number(a.period ?? 0) - Number(b.period ?? 0) || timeToSeconds(a.time) - timeToSeconds(b.time)
    );

  // Le but qui fait passer devant pour de bon : celui d'indice loserTotal.
  return winnerGoals[loserTotal]?.id ?? null;
}
