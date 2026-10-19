/**
 * Meilleurs pointeurs et gardiens de la ligue (classements « Stats de joueurs »
 * et « Stats de gardiens » de la LHEQ), recopiés des captures d'écran du lundi.
 * On n'y trouve donc que les joueurs apparus dans ces classements. Clé :
 * le slug de l'équipe (voir lheqTeams.ts). Les As de Québec n'y figurent pas.
 */
export const LEADERS_UPDATED = "2026-10-19";

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
  /** Moyenne de buts alloués : null quand la capture ne la donnait pas. */
  gaa: number | null;
}

const s = (name: string, gp: number, g: number, a: number): ScorerLine => ({ name, gp, g, a });
const k = (name: string, gp: number, w: number | null, l: number | null, otl: number | null, gaa: number | null = null): GoalieLine => ({ name, gp, w, l, otl, gaa });

export const LEAGUE_SCORERS: Record<string, ScorerLine[]> = {
  "canam-ba": [
    s("Ludovik Doyon", 11, 3, 12),
    s("Jacob Carrier", 11, 5, 8),
    s("Thomas Thibault", 11, 8, 3),
    s("Félix Couture", 11, 4, 6),
    s("Loic Fortin", 11, 1, 7),
    s("Marcus Morin", 11, 4, 4),
    s("Gabriel Poulin", 11, 4, 2),
    s("Adam Lachance", 11, 2, 3),
    s("Olivier Tanguay", 11, 3, 2),
  ],
  "corsaires-pointe-levy": [
    s("Clément Gosselin", 9, 9, 6),
    s("Shawn Aubert", 9, 6, 9),
    s("Jacob Fournier", 10, 5, 5),
    s("Maxandre Viens", 10, 2, 5),
  ],
  "rousseau-royal-lav-mtl": [
    s("Leo Fernandez Pisanu", 9, 10, 5),
    s("Thomas Staeger", 9, 2, 11),
    s("Mathis Cloutier", 8, 2, 8),
    s("Jonah Puma", 9, 5, 4),
    s("Gianluca Angelo Cioffi", 9, 4, 2),
    s("Andrea Arcaro", 8, 1, 5),
    s("Mathis Cal", 9, 4, 1),
    s("Tristan Passarelli", 9, 2, 3),
    s("Lucas Belanger", 8, 3, 2),
    s("Nicolas Blouin", 8, 1, 4),
  ],
  "dynamiques-ccl": [
    s("Olivier Dumas", 8, 7, 6),
    s("Luca Cuerrier", 8, 6, 5),
    s("Jaydan Belleus", 8, 3, 7),
    s("Benjamin Lahaie", 8, 6, 3),
    s("Jordan Davis", 8, 3, 6),
    s("Alex Sanésac", 8, 2, 5),
    s("Karl-Etienne Perron", 8, 3, 4),
    s("Felix Theriault", 8, 2, 4),
  ],
  "pionniers-lan": [
    s("Theo Lamarche", 8, 5, 8),
    s("Antoine Landry", 8, 6, 2),
    s("Alexandre Roudnik", 8, 4, 3),
    s("Jakob Brouillette", 7, 1, 6),
    s("Ludovik Gauthier", 8, 3, 3),
    s("Clément Richer", 7, 3, 3),
    s("Xavier Paquin", 8, 1, 4),
  ],
  "piche": [
    s("Jacob Morin-Vigneault", 8, 5, 4),
    s("Samuel Lemire", 8, 2, 6),
    s("Félix Sylvestre", 6, 5, 2),
    s("Robin Ducharme", 8, 1, 5),
    s("Wesley Régis", 8, 3, 3),
    s("William Leblanc", 8, 1, 5),
    s("Benjamin Rousseau", 8, 3, 2),
    s("Jacob Rousseau", 8, 3, 2),
  ],
  "select-du-nord": [
    s("Mathis Delisle", 11, 4, 3),
    s("Félix Dufour", 10, 2, 5),
    s("Gabriel Aubin", 9, 4, 2),
    s("Felix Martinet", 11, 3, 2),
    s("Justin Farrell", 11, 3, 2),
    s("Luka Houari", 11, 1, 4),
    s("Justin Alvaro", 9, 2, 3),
  ],
  "gaulois-ric": [
    s("Emile Maheu", 8, 3, 4),
    s("Theodore Braconnier", 8, 3, 4),
    s("Victor Lopez-Courcy", 8, 2, 5),
    s("Charles Dufour", 6, 1, 5),
  ],
  "citadelles-rn": [
    s("Lucas Belisle", 8, 4, 4),
    s("Loic Lebel", 8, 5, 2),
    s("William Ayotte", 8, 2, 4),
    s("Jacob Gauthier", 8, 1, 4),
    s("Jules Poirier", 8, 1, 4),
  ],
  "estacades-mauricie": [
    s("Charlot Bélanger", 7, 5, 2),
    s("Loïc Caron", 7, 5, 2),
    s("Brendon Demers", 7, 2, 3),
  ],
  "senateurs-out": [
    s("Malik Drolet McAllister", 7, 5, 2),
    s("Taylor Lauzon", 7, 4, 3),
    s("Flavias Saumier-Altema", 6, 2, 4),
  ],
  "blizzard-ssf": [
    s("Emrick Jackson", 6, 5, 2),
    s("Édouard Pronovost", 5, 1, 6),
  ],
  "seigneurs-mi": [
    s("Jacob Pion", 6, 5, 2),
  ],
  "lions-lsl": [
    s("Eric Khayretdinov", 8, 3, 2),
    s("Miles Saadé", 8, 3, 2),
  ],
  "espoirs-sag-lsj": [
    s("Vincent Larouche", 8, 1, 4),
  ],
};

export const LEAGUE_GOALIES: Record<string, GoalieLine[]> = {
  "canam-ba": [
    k("Thomas Giguère", 9, 7, 1, 0),
    k("Matthew McCrea", 5, 1, 1, 1),
  ],
  "rousseau-royal-lav-mtl": [
    k("Noah Laporte", 7, 6, 1, 0),
    k("Gianni Ricci", 3, 1, 1, 1),
  ],
  "dynamiques-ccl": [
    k("Benjamin Carreau", 4, 4, 0, 0),
    k("Charles Mathieu", 4, 3, 0, 1),
  ],
  "corsaires-pointe-levy": [
    k("Antoine Charest", 5, 4, 1, 0),
    k("Alexandre Talbot", 5, 2, 2, 1),
  ],
  "gaulois-ric": [
    k("Anthony Perron", 5, 4, 1, 0),
    k("Laurent Martel-Latanasuk", 3, 1, 1, 1),
  ],
  "piche": [
    k("Andrew Mallette", 4, 4, 0, 0),
    k("Alexis Poulin", 4, 3, 0, 1),
  ],
  "conquerants-bl": [
    k("David Dumas", 3, 3, 0, 0),
    k("Alexandre Leblanc", 3, 1, 2, 0),
  ],
  "select-du-nord": [
    k("Zachary Bourque", 5, 3, 2, 0),
    k("Loic Cabana", 6, 3, 3, 0),
  ],
  "lions-lsl": [
    k("Simon D'Andrea", 5, 2, 2, 0),
    k("Lucas Elias", 4, 1, 3, 0),
  ],
  "seigneurs-mi": [
    k("Loic Belzile", 3, 2, 1, 0),
    k("Owyn Lapointe", 3, 0, 3, 0),
  ],
  "pionniers-lan": [
    k("Jacob Lavallee", 4, 2, 1, 1),
    k("Mattis Theriault", 5, 1, 2, 1),
  ],
  "senateurs-out": [
    k("Marc-Etienne Perreault", 4, 2, 1, 0),
    k("Théo Dupuis", 4, 1, 3, 0),
  ],
  "citadelles-rn": [
    k("Gabriel Morin", 4, 2, 1, 1),
    k("Étienne Jarret", 4, 1, 2, 1),
  ],
  "espoirs-sag-lsj": [
    k("Nathan Cleary", 5, 1, 4, 0),
    k("Olivier Huet", 3, 1, 2, 0),
  ],
  "blizzard-ssf": [
    k("Lincoln IV Anderson", 3, 1, 2, 0),
    k("Charles-Olivier Guénette", 4, 0, 3, 1),
  ],
  "estacades-mauricie": [
    k("Ethan Beaudry", 4, 1, 3, 0),
    k("Maxence Chouinard", 3, 1, 2, 0),
  ],
  "harfangs-sherbrooke": [
    k("Caleb Dumas", 4, 1, 2, 0),
    k("Megan Savard", 2, 1, 1, 0),
  ],
  "albatros": [
    k("Justin Raymond", 6, 0, 6, 0),
    k("Felix Berube", 3, 0, 3, 0),
  ],
  "grenadiers-lsl": [
    k("Kayson-Francesco Bertrand-Saldana", 4, 0, 3, 0),
    k("Sheldon Hills-Lefebvre", 4, 0, 2, 1),
  ],
};
