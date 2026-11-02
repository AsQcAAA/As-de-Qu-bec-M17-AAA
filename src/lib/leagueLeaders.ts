/**
 * Meilleurs pointeurs et gardiens de la ligue (classements « Stats de joueurs »
 * et « Stats de gardiens » de la LHEQ), recopiés des captures d'écran du lundi.
 * On n'y trouve donc que les joueurs apparus dans ces classements. Clé :
 * le slug de l'équipe (voir lheqTeams.ts). Les As de Québec n'y figurent pas.
 */
export const LEADERS_UPDATED = "2026-11-02";

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
  "rousseau-royal-lav-mtl": [
    s("Leo Fernandez Pisanu", 12, 10, 10),
    s("Thomas Staeger", 12, 7, 13),
    s("Jonah Puma", 12, 8, 7),
    s("Mathis Cloutier", 11, 4, 10),
    s("Andrea Arcaro", 10, 3, 7),
    s("André Louis Lafleur", 12, 4, 3),
    s("Mathis Cal", 12, 4, 3),
  ],
  "canam-ba": [
    s("Ludovik Doyon", 13, 6, 12),
    s("Thomas Thibault", 14, 10, 5),
    s("Jacob Carrier", 13, 5, 9),
    s("Félix Couture", 14, 4, 8),
    s("Loic Fortin", 13, 2, 10),
    s("Marcus Morin", 14, 6, 4),
    s("Gabriel Poulin", 14, 5, 3),
    s("Olivier Tanguay", 14, 4, 4),
    s("Adam Lachance", 14, 3, 3),
  ],
  "corsaires-pointe-levy": [
    s("Clément Gosselin", 12, 10, 7),
    s("Shawn Aubert", 12, 7, 9),
    s("Jacob Fournier", 13, 5, 7),
    s("Maxandre Viens", 13, 3, 7),
  ],
  "dynamiques-ccl": [
    s("Olivier Dumas", 11, 9, 8),
    s("Jaydan Belleus", 11, 3, 10),
    s("Jordan Davis", 11, 4, 7),
    s("Benjamin Lahaie", 11, 6, 4),
    s("Luca Guerrier", 11, 6, 4),
    s("Felix Theriault", 11, 3, 5),
    s("Karl-Etienne Perron", 11, 4, 4),
    s("Alex Sanésac", 10, 3, 5),
    s("Justin Labelle", 10, 2, 5),
  ],
  "citadelles-rn": [
    s("Lucas Belisle", 12, 11, 5),
    s("Éliot Galarneau", 12, 3, 5),
    s("William Ayotte", 12, 2, 6),
    s("Loïc Lebel", 11, 5, 3),
  ],
  "estacades-mauricie": [
    s("Loïc Caron", 11, 9, 7),
    s("Charlot Bélanger", 11, 7, 5),
    s("Xavier Lafontaine", 11, 4, 3),
    s("Raphael Gélinas", 10, 2, 5),
  ],
  "pionniers-lan": [
    s("Theo Lamarche", 10, 6, 8),
    s("Jakob Brouillette", 9, 4, 6),
    s("Antoine Landry", 10, 6, 2),
    s("Ludovik Gauthier", 10, 3, 5),
    s("Alexandre Roudnik", 10, 4, 3),
  ],
  "select-du-nord": [
    s("Gabriel Aubin", 12, 5, 6),
    s("Justin Farrell", 14, 6, 4),
    s("Luka Houari", 14, 4, 6),
    s("Félix Dufour", 13, 2, 8),
    s("Felix Martinet", 14, 5, 4),
    s("Jacob Lariviere", 14, 5, 3),
    s("Mathis Delisle", 14, 4, 4),
    s("Justin Alvaro", 12, 3, 4),
  ],
  "senateurs-out": [
    s("Malik Drolet McAllister", 11, 9, 2),
    s("Taylor Lauzon", 11, 7, 4),
    s("Flavias Saumier-Altema", 9, 3, 6),
    s("Manix Arseneault", 11, 1, 7),
    s("Malik Lemay", 11, 3, 4),
  ],
  "gaulois-ric": [
    s("Victor Lopez-Courcy", 11, 4, 7),
    s("Emile Maheu", 11, 4, 5),
    s("Theodore Braconnier", 11, 3, 6),
  ],
  "seigneurs-mi": [
    s("Jacob Pion", 9, 6, 5),
    s("Zachary Godard", 9, 3, 5),
    s("Charles D'Amico", 9, 6, 1),
  ],
  "piche": [
    s("Jacob Morin-Vigneault", 10, 5, 5),
    s("Samuel Lemire", 10, 2, 6),
    s("Wesley Régis", 10, 5, 3),
    s("Félix Sylvestre", 8, 5, 3),
    s("William Leblanc", 9, 1, 6),
  ],
  "conquerants-bl": [
    s("Nathan Bernier", 10, 8, 2),
    s("Zachary Pomerleau Lamothe", 7, 2, 5),
  ],
  "blizzard-ssf": [
    s("Édouard Pronovost", 7, 3, 6),
    s("Emerick Jackson", 7, 5, 2),
  ],
  "albatros": [
    s("Emile Cummings", 12, 1, 6),
  ],
};

export const LEAGUE_GOALIES: Record<string, GoalieLine[]> = {
  "canam-ba": [
    k("Thomas Giguère", 10, 8, 1, 0, 2.20),
    k("Matthew McCrea", 7, 2, 2, 1, 3.75),
  ],
  "rousseau-royal-lav-mtl": [
    k("Noah Laporte", 9, 8, 1, 0, 2.22),
    k("Gianni Ricci", 4, 1, 2, 0, 3.94),
  ],
  "dynamiques-ccl": [
    k("Benjamin Carreau", 5, 5, 0, 0, 1.00),
    k("Charles Mathieu", 6, 4, 1, 1, 2.18),
  ],
  "select-du-nord": [
    k("Zachary Bourque", 7, 5, 2, 0, 1.87),
    k("Loic Cabana", 7, 4, 3, 0, 2.97),
  ],
  "corsaires-pointe-levy": [
    k("Antoine Charest", 7, 5, 2, 0, 2.00),
    k("Alexandre Talbot", 6, 3, 2, 1, 3.31),
  ],
  "piche": [
    k("Andrew Mallette", 5, 5, 0, 0, 2.18),
    k("Alexis Poulin", 5, 4, 0, 1, 1.00),
  ],
  "conquerants-bl": [
    k("David Dumas", 5, 4, 1, 0, 2.20),
    k("Alexandre Leblanc", 5, 2, 3, 0, 4.29),
  ],
  "seigneurs-mi": [
    k("Loic Belzile", 5, 4, 1, 0, 2.31),
    k("Owyn Lapointe", 4, 1, 3, 0, 2.52),
  ],
  "gaulois-ric": [
    k("Anthony Perron", 6, 4, 2, 0, 2.68),
    k("Laurent Martel-Latanasuk", 5, 3, 1, 1, 1.77),
  ],
  "estacades-mauricie": [
    k("Maxence Chouinard", 5, 3, 2, 0, 2.40),
    k("Ethan Beaudry", 6, 2, 4, 0, 2.69),
  ],
  "senateurs-out": [
    k("Marc-Etienne Perreault", 6, 3, 2, 0, 3.93),
    k("Théo Dupuis", 6, 1, 4, 0, 5.16),
  ],
  "citadelles-rn": [
    k("Gabriel Morin", 6, 3, 2, 1, 2.62),
    k("Étienne Jarret", 7, 2, 3, 1, 3.09),
  ],
  "espoirs-sag-lsj": [
    k("Nathan Cleary", 7, 2, 5, 0, 2.00),
    k("Olivier Huet", 4, 1, 3, 0, 4.25),
  ],
  "lions-lsl": [
    k("Simon D'Andrea", 7, 2, 4, 0, 2.73),
    k("Lucas Elias", 6, 1, 5, 0, 2.84),
  ],
  "pionniers-lan": [
    k("Jacob Lavallee", 5, 2, 2, 0, 3.34),
    k("Mattis Theriault", 6, 1, 3, 2, 2.41),
  ],
  "blizzard-ssf": [
    k("Lincoln IV Anderson", 3, 1, 2, 0, 3.03),
    k("Charles-Olivier Guénette", 8, 1, 5, 1, 4.35),
  ],
  "harfangs-sherbrooke": [
    k("Caleb Dumas", 5, 1, 2, 0, 3.33),
    k("Megan Savard", 3, 1, 1, 1, 3.20),
  ],
  "grenadiers-lsl": [
    k("Kayson-Francesco Bertrand-Saldana", 6, 1, 4, 0, 3.91),
    k("Sheldon Hills-Lefebvre", 7, 0, 3, 1, 4.11),
  ],
  "albatros": [
    k("Justin Raymond", 8, 1, 7, 0, 3.93),
    k("Felix Berube", 4, 0, 4, 0, 6.19),
  ],
};
