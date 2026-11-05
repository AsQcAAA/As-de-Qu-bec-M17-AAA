import type { Game } from "@/lib/types";

/**
 * Match d'une journée. Plusieurs matchs le même jour (tournoi) : le premier match à
 * jouer, sinon le dernier joué. Les matchs doivent arriver triés par création.
 */
export function pickGameOfDay(games: Game[] | null | undefined): Game | null {
  const list = games ?? [];
  if (list.length === 0) return null;
  return list.find((g) => !g.result) ?? list[list.length - 1];
}
