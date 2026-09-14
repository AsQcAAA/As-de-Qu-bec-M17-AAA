import type { Game, GameResult } from "./types";

export const RESULT_LABEL: Record<GameResult, string> = {
  W: "Victoire",
  L: "Défaite",
  OTL: "Défaite (prol.)",
  SOL: "Défaite (tirs)",
  T: "Nul",
};

export const RESULT_COLOR: Record<GameResult, string> = {
  W: "bg-green-100 text-green-800",
  L: "bg-red-100 text-red-800",
  OTL: "bg-orange-100 text-orange-800",
  SOL: "bg-orange-100 text-orange-800",
  T: "bg-slate-200 text-slate-700",
};

export const OUR_TEAM_NAME = "As de Québec";

/**
 * Formule d'affichage d'un duel. L'équipe visiteuse est toujours nommée en
 * premier, comme sur les feuilles de match et les tableaux de la ligue :
 *   à domicile  → "Espoirs du Saguenay vs As de Québec"
 *   à l'étranger → "As de Québec @ Espoirs du Saguenay"
 * Passe `opponentName` pour utiliser le nom complet de l'adversaire plutôt que
 * l'abréviation stockée en base.
 */
export function matchupLabel(g: Pick<Game, "opponent" | "is_home">, opponentName?: string): string {
  const opponent = opponentName ?? g.opponent;
  return g.is_home ? `${opponent} vs ${OUR_TEAM_NAME}` : `${OUR_TEAM_NAME} @ ${opponent}`;
}

/** Ordre d'affichage des deux équipes : la visiteuse d'abord. */
export function matchupSides(g: Pick<Game, "is_home">): { first: "us" | "opponent"; second: "us" | "opponent"; separator: string } {
  return g.is_home
    ? { first: "opponent", second: "us", separator: "vs" }
    : { first: "us", second: "opponent", separator: "@" };
}

/**
 * Pointage dans l'ORDRE D'AFFICHAGE des équipes, l'équipe visiteuse d'abord —
 * comme matchupLabel(). À domicile, « 2-1 » se lit donc « adversaire 2, nous 1 »
 * si on inversait naïvement : d'où cette fonction, qui remet les buts du bon
 * côté au lieu de toujours mettre les nôtres en premier.
 */
export function scoreInDisplayOrder(g: Pick<Game, "is_home" | "goals_for" | "goals_against">): string | null {
  if (g.goals_for == null || g.goals_against == null) return null;
  return g.is_home ? `${g.goals_against}-${g.goals_for}` : `${g.goals_for}-${g.goals_against}`;
}

// Ex: "V 1-2 — Espoirs du Saguenay vs As de Québec" (victoire à domicile 2-1).
export function gameScoreLine(g: Game): string | null {
  if (!g.result || g.goals_for == null || g.goals_against == null) return null;
  return `${g.result} ${scoreInDisplayOrder(g)} ${matchupLabel(g)}`;
}
