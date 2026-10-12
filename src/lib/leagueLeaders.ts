/**
 * Meilleurs pointeurs et gardiens de la ligue (classements « Stats de joueurs »
 * et « Stats de gardiens » de la LHEQ), recopiés des captures d'écran du lundi.
 * On n'y trouve donc que les joueurs apparus dans ces classements. Clé :
 * le slug de l'équipe (voir lheqTeams.ts). Les As de Québec n'y figurent pas.
 */
export const LEADERS_UPDATED = "2026-10-12";

export interface ScorerLine {
  name: string;
  gp: number;
  g: number;
  a: number;
}

export interface GoalieLine {
  name: string;
  gp: number;
  /** Fiche : null quand la capture ne la donnait pas pour ce gardien. */
  w: number | null;
  l: number | null;
  /** Défaites en prolongation / fusillade */
  otl: number | null;
  /** Moyenne de buts alloués */
  gaa: number;
}

const s = (name: string, gp: number, g: number, a: number): ScorerLine => ({ name, gp, g, a });
const k = (name: string, gp: number, gaa: number, w: number | null = null, l: number | null = null, otl: number | null = null): GoalieLine => ({ name, gp, w, l, otl, gaa });

export const LEAGUE_SCORERS: Record<string, ScorerLine[]> = {
  "rousseau-royal-lav-mtl": [
    s("Leo Fernandez Pisanu", 8, 10, 5),
    s("Thomas Staeger", 8, 2, 10),
    s("Jonah Puma", 8, 4, 4),
    s("Mathis Cloutier", 7, 2, 6),
    s("Mathis Cal", 8, 4, 1),
    s("Tristan Passarelli", 8, 2, 3),
    s("Andrea Arcaro", 7, 0, 5),
    s("Lucas Belanger", 7, 3, 2),
  ],
  "canam-ba": [
    s("Ludovik Doyon", 10, 2, 10),
    s("Thomas Thibault", 10, 7, 4),
    s("Félix Couture", 10, 3, 6),
    s("Marcus Morin", 10, 4, 5),
    s("Jacob Carrier", 10, 5, 3),
    s("Loïc Fortin", 10, 1, 5),
    s("Gabriel Poulin", 10, 4, 1),
  ],
  "corsaires-pointe-levy": [
    s("Clément Gosselin", 8, 9, 2),
    s("Shawn Aubert", 8, 2, 9),
    s("Jacob Fournier", 8, 4, 4),
    s("Maxandre Viens", 8, 2, 3),
  ],
  "dynamiques-ccl": [
    s("Benjamin Lahaie", 6, 4, 4),
    s("Luca Cuierrier", 6, 6, 2),
    s("Olivier Dumas", 6, 4, 4),
    s("Alex Sanésac", 6, 1, 6),
    s("Jaydan Belleus", 6, 2, 5),
    s("Jordan Davis", 6, 3, 4),
    s("Karl-Etienne Perron", 6, 3, 4),
    s("Felix Theriault", 6, 3, 3),
  ],
  "citadelles-rn": [
    s("Lucas Belisle", 8, 4, 4),
    s("Loïc Lebel", 8, 5, 2),
    s("William Ayotte", 8, 2, 4),
    s("Jacob Gauthier", 8, 1, 4),
    s("Jules Poirier", 8, 1, 4),
  ],
  "select-du-nord": [
    s("Félix Dufour", 9, 2, 5),
    s("Mathis Delisle", 9, 4, 3),
    s("Luka Houari", 9, 1, 4),
    s("Gabriel Aubin", 7, 3, 2),
  ],
  "estacades-mauricie": [
    s("Charlot Bélanger", 7, 5, 2),
    s("Loïc Caron", 7, 5, 2),
    s("Brendon Demers", 7, 2, 3),
  ],
  piche: [
    s("Jacob Morin-Vigneault", 7, 3, 4),
    s("Félix Sylvestre", 6, 5, 2),
    s("Samuel Lemire", 7, 2, 4),
    s("William Leblanc", 7, 1, 5),
  ],
  "gaulois-ric": [s("Victor Lopez-Courcy", 7, 2, 5), s("Emile Maheu", 7, 2, 4)],
  "senateurs-out": [
    s("Malik Drolet McAllister", 6, 5, 2),
    s("Flavias Saumier-Altema", 6, 2, 4),
    s("Taylor Lauzon", 6, 4, 2),
  ],
  "blizzard-ssf": [s("Édouard Pronovost", 5, 1, 6), s("Emrick Jackson", 5, 5, 2)],
  "seigneurs-mi": [s("Jacob Pion", 5, 5, 2)],
  "pionniers-lan": [s("Theo Lamarche", 6, 2, 4)],
  "lions-lsl": [s("Miles Saadé", 7, 3, 2)],
};

export const LEAGUE_GOALIES: Record<string, GoalieLine[]> = {
  "rousseau-royal-lav-mtl": [k("Noah Laporte", 7, 2.35, 6, 1, 0), k("Gianni Ricci", 2, 3.21, 0, 1, 0)],
  "canam-ba": [k("Thomas Giguère", 8, 2.41, 6, 1, 0), k("Matthew McCrea", 5, 4.25, 1, 1, 1)],
  "gaulois-ric": [k("Anthony Perron", 4, 1.67, 4, 0, 0), k("Laurent Martel-Latanasuk", 3, 2.03, 1, 1, 1)],
  "dynamiques-ccl": [k("Benjamin Carreau", 3, 0.5, 3, 0, 0), k("Charles Mathieu", 3, 1.67, 2, 0, 1)],
  "corsaires-pointe-levy": [k("Antoine Charest", 4, 2.0, 3, 1, 0), k("Alexandre Talbot", 4, 3.62, 1, 2, 1)],
  piche: [k("Andrew Mallette", 3, 2.67, 3, 0, 0), k("Alexis Poulin", 4, 1.34, 3, 0, 1)],
  "select-du-nord": [k("Loic Cabana", 5, 3.86, 3, 2, 0), k("Zachary Bourque", 4, 3.01, 2, 2, 0)],
  "conquerants-bl": [k("David Dumas", 2, 1.0, 2, 0, 0), k("Alexandre Leblanc", 3, 4.22, 1, 2, 0)],
  "pionniers-lan": [k("Jacob Lavallee", 3, 2.12, 2, 1, 0), k("Mattis Theriault", 3, 2.82, 0, 2, 1)],
  "seigneurs-mi": [k("Loic Belzile", 3, 2.19, 2, 1, 0), k("Owyn Lapointe", 2, 2.03, 0, 2, 0)],
  "lions-lsl": [k("Simon D'Andrea", 5, 2.22, 2, 2, 0), k("Lucas Elias", 3, 4.34, 0, 3, 0)],
  "senateurs-out": [k("Marc-Etienne Perreault", 3, 4.35, 2, 1, 0), k("Théo Dupuis", 3, 3.37, 1, 2, 0)],
  "citadelles-rn": [k("Gabriel Morin", 4, 1.4, 2, 1, 1), k("Étienne Jarret", 4, 3.99, 1, 2, 1)],
  "espoirs-sag-lsj": [k("Nathan Cleary", 4, 1.98, 1, 3, 0), k("Olivier Huet", 3, 4.34, 1, 2, 0)],
  "blizzard-ssf": [k("Lincoln IV Anderson", 2, 2.0, 1, 1, 0), k("Charles-Olivier Guénette", 3, 5.68, 0, 2, 1)],
  "harfangs-sherbrooke": [k("Caleb Dumas", 3, 3.07, 1, 1, 0), k("Megan Savard", 2, 2.0, 1, 1, 0)],
  "estacades-mauricie": [k("Ethan Beaudry", 4, 3.26, 1, 3, 0), k("Maxence Chouinard", 3, 3.34, 1, 2, 0)],
  albatros: [k("Justin Raymond", 5, 3.68, 0, 5, 0), k("Felix Berube", 1, 8.01, 0, 1, 0)],
  "grenadiers-lsl": [
    k("Kayson-Francesco Bertrand-Saldana", 3, 4.6, 0, 2, 1),
    k("Sheldon Hills-Lefebvre", 3, 6.11, 0, 2, 1),
  ],
};
