// Heuristique : le nom de famille est le dernier mot du nom complet
// ("Prénom Nom" → "Nom"). Suffisant pour l'affichage sur les chandails.
export function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName;
}

/**
 * Met un nom en casse normale, peu importe comment il est écrit sur la
 * source (la feuille de match inscrit les joueurs adverses TOUT EN
 * MAJUSCULES) : "JEAN-THOMAS GAGNON" → "Jean-Thomas Gagnon". Les espaces,
 * traits d'union et apostrophes comptent comme des débuts de mot.
 */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((part) => (/[a-zà-ÿ]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
}
