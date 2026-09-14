/**
 * Position détaillée (AG, C, AD, DG, DD, G) d'un joueur dans un alignement.
 *
 * L'information n'existe pas en base : c'est la COLONNE occupée dans la grille
 * de l'effectif qui la porte — les attaquants sont disposés 3 de front (aile
 * gauche, centre, aile droite), les défenseurs 2 de front (gauche, droite).
 *
 * Le calcul vit ici plutôt que dans une page, parce que l'écran d'alignement,
 * son export imprimé et la vue en lecture seule doivent annoncer les partants
 * dans le même ordre. Une seule règle, trois affichages.
 */

/** Ordre d'annonce d'un alignement partant. */
export const ANNOUNCE_ORDER = ["AG", "C", "AD", "DG", "DD", "G"];

const DETAILED_POSITION: Record<"F" | "D" | "G", string[]> = {
  F: ["AG", "C", "AD"],
  D: ["DG", "DD"],
  G: ["G"],
};

/** Case `index` de la grille des `position` → AG, C, AD… */
export function slotPosition(position: "F" | "D" | "G", index: number): string {
  const labels = DETAILED_POSITION[position];
  return labels[index % labels.length];
}

/** L'effectif du jour, tel qu'affiché : une entrée par grille. */
export interface RosterGrid {
  position: "F" | "D" | "G";
  playerIds: (string | null)[];
}

export function detailedPositionOf(playerId: string, roster: RosterGrid[]): string | null {
  for (const grid of roster) {
    const idx = grid.playerIds.indexOf(playerId);
    if (idx >= 0) return slotPosition(grid.position, idx);
  }
  return null;
}

/** Comparateur prêt à passer à `sort()`, pour des joueurs de cet effectif. */
export function byAnnounceOrder(roster: RosterGrid[]) {
  const rank = (id: string) => {
    const i = ANNOUNCE_ORDER.indexOf(detailedPositionOf(id, roster) ?? "");
    // Un joueur introuvable dans l'effectif passe en fin de liste plutôt que
    // de remonter en tête, ce que donnerait le -1 brut d'indexOf.
    return i < 0 ? ANNOUNCE_ORDER.length : i;
  };
  return (a: { id: string }, b: { id: string }) => rank(a.id) - rank(b.id);
}
