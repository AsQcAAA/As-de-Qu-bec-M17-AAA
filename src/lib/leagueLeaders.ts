/**
 * Meilleurs pointeurs et gardiens de la ligue (classements « Stats de joueurs »
 * et « Stats de gardiens » de la LHEQ), recopiés des captures d'écran du lundi.
 * On n'y trouve donc que les joueurs apparus dans ces classements. Clé :
 * le slug de l'équipe (voir lheqTeams.ts). Les As de Québec n'y figurent pas.
 */
export const LEADERS_UPDATED = "2026-10-11";

export interface ScorerLine {
  name: string;
  gp: number;
  g: number;
  a: number;
}

export interface GoalieLine {
  name: string;
  gp: number;
  w: number;
  l: number;
  /** Défaites en prolongation / fusillade */
  otl: number;
}

const s = (name: string, gp: number, g: number, a: number): ScorerLine => ({ name, gp, g, a });
const k = (name: string, gp: number, w: number, l: number, otl = 0): GoalieLine => ({ name, gp, w, l, otl });

export const LEAGUE_SCORERS: Record<string, ScorerLine[]> = {
  "rousseau-royal-lav-mtl": [
    s("Leo Fernandez Pisanu", 7, 8, 5),
    s("Thomas Staeger", 7, 2, 8),
    s("Jonah Puma", 7, 3, 3),
    s("Lucas Belanger", 6, 3, 2),
    s("Mathis Cloutier", 6, 1, 4),
  ],
  "canam-ba": [
    s("Ludovik Doyon", 7, 2, 9),
    s("Thomas Thibault", 9, 6, 4),
    s("Marcus Morin", 9, 4, 5),
    s("Félix Couture", 9, 3, 5),
    s("Jacob Carrier", 9, 4, 3),
    s("Loïc Fortin", 9, 1, 5),
  ],
  "corsaires-pointe-levy": [
    s("Clément Gosselin", 7, 9, 2),
    s("Shawn Aubert", 7, 2, 9),
    s("Jacob Fournier", 7, 4, 4),
    s("Maxandre Viens", 7, 2, 3),
  ],
  "estacades-mauricie": [
    s("Charlot Bélanger", 7, 5, 2),
    s("Loïc Caron", 7, 5, 2),
    s("Brendon Demers", 7, 2, 3),
    s("Raphael Gélinas", 7, 2, 3),
  ],
  piche: [
    s("Jacob Morin-Vigneault", 6, 3, 4),
    s("Félix Sylvestre", 5, 5, 2),
    s("Samuel Lemire", 6, 2, 4),
  ],
  "dynamiques-ccl": [
    s("Alex Sanésac", 5, 1, 6),
    s("Olivier Dumas", 5, 3, 4),
    s("Luca Cuierrier", 5, 4, 2),
  ],
  "blizzard-ssf": [s("Édouard Pronovost", 5, 1, 6), s("Emrick Jackson", 5, 5, 2)],
  "seigneurs-mi": [s("Jacob Pion", 5, 5, 2)],
  "select-du-nord": [s("Mathis Delisle", 7, 3, 3), s("Félix Dufour", 7, 2, 3)],
  "citadelles-rn": [s("Loïc Lebel", 6, 4, 2), s("Lucas Belisle", 6, 3, 3), s("Jules Poirier", 6, 1, 4)],
  "senateurs-out": [s("Flavias Saumier-Altema", 5, 2, 4)],
  "pionniers-lan": [s("Theo Lamarche", 5, 2, 4)],
  "gaulois-ric": [s("Victor Lopez-Courcy", 5, 2, 4)],
  "lions-lsl": [s("Miles Saadé", 6, 3, 2)],
};

export const LEAGUE_GOALIES: Record<string, GoalieLine[]> = {
  "canam-ba": [k("Thomas Giguère", 8, 6, 1)],
  "rousseau-royal-lav-mtl": [k("Noah Laporte", 6, 5, 1)],
  piche: [k("Alexis Poulin", 3, 3, 0), k("Andrew Mallette", 3, 3, 0)],
  "gaulois-ric": [k("Anthony Perron", 3, 3, 0)],
  "corsaires-pointe-levy": [k("Antoine Charest", 4, 3, 1), k("Alexandre Talbot", 3, 1, 1, 1)],
  "dynamiques-ccl": [k("Benjamin Carreau", 2, 2, 0), k("Charles Mathieu", 3, 2, 0, 1)],
  "conquerants-bl": [k("David Dumas", 2, 2, 0), k("Alexandre Leblanc", 2, 1, 1)],
  "pionniers-lan": [k("Jacob Lavallee", 3, 2, 1)],
  "seigneurs-mi": [k("Loic Belzile", 3, 2, 1)],
  "lions-lsl": [k("Simon D'Andrea", 4, 2, 1)],
  "select-du-nord": [k("Zachary Bourque", 3, 2, 1), k("Loic Cabana", 4, 2, 2)],
  "citadelles-rn": [k("Gabriel Morin", 3, 2, 0, 1)],
  "espoirs-sag-lsj": [k("Nathan Cleary", 3, 1, 2), k("Olivier Huet", 3, 1, 2)],
  "blizzard-ssf": [k("Lincoln IV Anderson", 2, 1, 1)],
  "harfangs-sherbrooke": [k("Megan Savard", 1, 1, 0), k("Caleb Dumas", 2, 1, 1)],
  "estacades-mauricie": [k("Ethan Beaudry", 4, 1, 3), k("Maxence Chouinard", 3, 1, 2)],
  "senateurs-out": [k("Théo Dupuis", 3, 1, 2), k("Marc-Etienne Perreault", 2, 1, 1)],
};
