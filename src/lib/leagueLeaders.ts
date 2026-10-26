/**
 * Meilleurs pointeurs et gardiens de la ligue (classements « Stats de joueurs »
 * et « Stats de gardiens » de la LHEQ), recopiés des captures d'écran du lundi.
 * On n'y trouve donc que les joueurs apparus dans ces classements. Clé :
 * le slug de l'équipe (voir lheqTeams.ts). Les As de Québec n'y figurent pas.
 */
export const LEADERS_UPDATED = "2026-10-26";

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
  "corsaires-pointe-levy": [
    s("Clément Gosselin", 11, 10, 7),
    s("Shawn Aubert", 11, 7, 9),
    s("Jacob Fournier", 12, 5, 6),
    s("Maxandre Viens", 12, 3, 5),
    s("Frederic Gagne", 12, 0, 5),
    s("Alexis Roy", 12, 2, 2),
  ],
  "rousseau-royal-lav-mtl": [
    s("Leo Fernandez Pisanu", 10, 10, 6),
    s("Thomas Staeger", 10, 3, 12),
    s("Jonah Puma", 10, 6, 5),
    s("Mathis Cloutier", 9, 2, 8),
    s("Andrea Arcaro", 9, 2, 6),
    s("André Louis Lafleur", 10, 3, 3),
    s("Gianluca Angelo Cioffi", 10, 4, 2),
    s("Dominic Blanchet", 10, 3, 2),
    s("Mathis Cal", 10, 4, 1),
    s("Tristan Passarelli", 10, 2, 3),
    s("Lucas Belanger", 9, 3, 2),
    s("Nicolas Blouin", 9, 1, 4),
    s("Ante Baljak", 10, 1, 3),
    s("Dario Zappoli", 10, 2, 2),
  ],
  "canam-ba": [
    s("Ludovik Doyon", 11, 3, 12),
    s("Thomas Thibault", 12, 10, 4),
    s("Jacob Carrier", 11, 5, 8),
    s("Félix Couture", 12, 4, 8),
    s("Marcus Morin", 12, 5, 4),
    s("Loic Fortin", 11, 1, 7),
    s("Gabriel Poulin", 12, 4, 3),
    s("Adam Lachance", 12, 2, 3),
    s("Olivier Tanguay", 12, 3, 2),
    s("Nathan Giguère", 12, 1, 3),
  ],
  "dynamiques-ccl": [
    s("Olivier Dumas", 9, 7, 7),
    s("Jaydan Belleus", 9, 3, 8),
    s("Luca Cuerrier", 9, 6, 4),
    s("Benjamin Lahaie", 9, 6, 3),
    s("Karl-Etienne Perron", 9, 4, 4),
    s("Felix Theriault", 9, 3, 4),
    s("Jordan Davis", 9, 3, 4),
    s("Alex Sanésac", 8, 2, 5),
    s("Justin Labelle", 9, 1, 5),
  ],
  "pionniers-lan": [
    s("Theo Lamarche", 9, 6, 8),
    s("Jakob Brouillette", 8, 3, 6),
    s("Antoine Landry", 9, 6, 2),
    s("Alexandre Roudnik", 9, 4, 3),
    s("Ludovik Gauthier", 9, 3, 4),
    s("Clément Richer", 8, 3, 3),
    s("Xavier Paquin", 9, 1, 4),
    s("Leo Pelletier", 3, 1, 4),
  ],
  "senateurs-out": [
    s("Taylor Lauzon", 9, 7, 4),
    s("Malik Drolet McAllister", 9, 6, 2),
    s("Flavias Saumier-Altema", 8, 3, 4),
    s("Malik Lemay", 9, 3, 3),
    s("Manix Arseneault", 9, 0, 6),
  ],
  "seigneurs-mi": [
    s("Jacob Pion", 8, 6, 5),
    s("Zachary Godard", 8, 3, 3),
  ],
  "piche": [
    s("Jacob Morin-Vigneault", 10, 5, 5),
    s("Samuel Lemire", 10, 2, 6),
    s("Wesley Régis", 10, 5, 3),
    s("Félix Sylvestre", 8, 5, 3),
    s("Benjamin Rousseau", 10, 3, 4),
    s("William Leblanc", 9, 1, 6),
    s("Jacob Rousseau", 10, 3, 3),
    s("Robin Ducharme", 8, 1, 5),
    s("Alexy Legault", 10, 0, 4),
    s("Enzo Plamondon", 10, 1, 3),
  ],
  "citadelles-rn": [
    s("Lucas Belisle", 10, 5, 5),
    s("Loic Lebel", 10, 5, 3),
    s("Éliot Galarneau", 10, 2, 4),
    s("William Ayotte", 10, 2, 4),
    s("Jacob Gauthier", 10, 1, 4),
    s("Jules Poirier", 10, 1, 4),
  ],
  "conquerants-bl": [
    s("Nathan Bernier", 8, 8, 1),
    s("Cedric Belanger", 8, 2, 3),
    s("Elliott Duchesneault", 8, 2, 3),
    s("Zachary Pomerleau Lamothe", 6, 1, 4),
  ],
  "select-du-nord": [
    s("Luka Houari", 12, 3, 5),
    s("Félix Dufour", 11, 2, 6),
    s("Felix Martinet", 12, 4, 3),
    s("Justin Farrell", 12, 4, 3),
    s("Mathis Delisle", 12, 4, 3),
    s("Gabriel Aubin", 10, 5, 2),
    s("Jacob Lariviere", 12, 2, 3),
    s("Justin Alvaro", 10, 2, 3),
    s("Ély Fitzgerald", 11, 1, 3),
  ],
  "estacades-mauricie": [
    s("Charlot Bélanger", 9, 6, 2),
    s("Loïc Caron", 9, 6, 2),
    s("Brendon Demers", 9, 2, 3),
    s("Raphael Gélinas", 8, 2, 3),
    s("Benjamin Ethier", 9, 2, 2),
  ],
  "gaulois-ric": [
    s("Emile Maheu", 9, 4, 4),
    s("Victor Lopez-Courcy", 9, 2, 6),
    s("Theodore Braconnier", 9, 3, 4),
    s("Charles Dufour", 6, 1, 5),
    s("Gregory Tremblay", 9, 2, 2),
  ],
  "blizzard-ssf": [
    s("Emrick Jackson", 7, 5, 2),
    s("Édouard Pronovost", 5, 1, 6),
  ],
  "albatros": [
    s("Dylan Boudreau", 10, 2, 4),
    s("Emile Cummings", 10, 1, 5),
    s("Lucas Harrisson", 10, 2, 3),
    s("Max Damours", 10, 4, 0),
    s("Nick Beliveau", 10, 3, 1),
    s("Zackary Caissy", 10, 1, 3),
  ],
  "lions-lsl": [
    s("Eric Khayretdinov", 10, 3, 3),
    s("Gabriel Lazanis", 10, 2, 3),
    s("Miles Saadé", 10, 3, 2),
    s("Xander Parker", 7, 2, 3),
    s("Tyson Ito", 6, 3, 2),
    s("Aidan Kelly", 10, 2, 2),
    s("Michael Jean-Baptiste", 10, 1, 3),
  ],
  "espoirs-sag-lsj": [
    s("Vincent Larouche", 8, 1, 4),
    s("Ethan St-Hilaire", 9, 2, 2),
  ],
};

export const LEAGUE_GOALIES: Record<string, GoalieLine[]> = {
  "rousseau-royal-lav-mtl": [
    k("Noah Laporte", 8, 7, 1, 0, 2.25),
    k("Gianni Ricci", 3, 1, 1, 1, 3.52),
  ],
  "canam-ba": [
    k("Thomas Giguère", 9, 7, 1, 0, 2.35),
    k("Matthew McCrea", 6, 1, 2, 1, 3.69),
  ],
  "corsaires-pointe-levy": [
    k("Antoine Charest", 6, 5, 1, 0, 1.84),
    k("Alexandre Talbot", 6, 3, 2, 1, 3.31),
  ],
  "piche": [
    k("Andrew Mallette", 5, 5, 0, 0, 2.18),
    k("Alexis Poulin", 5, 4, 0, 1, 1.0),
  ],
  "dynamiques-ccl": [
    k("Benjamin Carreau", 4, 4, 0, 0, 0.75),
    k("Charles Mathieu", 5, 4, 0, 1, 1.61),
  ],
  "conquerants-bl": [
    k("David Dumas", 4, 4, 0, 0, 1.75),
    k("Alexandre Leblanc", 4, 1, 3, 0, 4.62),
  ],
  "select-du-nord": [
    k("Zachary Bourque", 6, 4, 2, 0, 2.18),
    k("Loic Cabana", 6, 3, 3, 0, 3.28),
  ],
  "gaulois-ric": [
    k("Anthony Perron", 5, 4, 1, 0, 2.21),
    k("Laurent Martel-Latanasuk", 4, 2, 1, 1, 1.72),
  ],
  "seigneurs-mi": [
    k("Loic Belzile", 4, 3, 1, 0, 1.91),
    k("Owyn Lapointe", 4, 1, 3, 0, 2.52),
  ],
  "senateurs-out": [
    k("Marc-Etienne Perreault", 5, 3, 1, 0, 3.91),
    k("Théo Dupuis", 5, 1, 4, 0, 4.97),
  ],
  "estacades-mauricie": [
    k("Maxence Chouinard", 4, 2, 2, 0, 2.5),
    k("Ethan Beaudry", 5, 1, 4, 0, 3.03),
  ],
  "lions-lsl": [
    k("Simon D'Andrea", 6, 2, 3, 0, 2.5),
    k("Lucas Elias", 5, 1, 3, 0, 2.57),
  ],
  "pionniers-lan": [
    k("Jacob Lavallee", 5, 2, 2, 0, 3.34),
    k("Mattis Theriault", 5, 1, 2, 2, 1.81),
  ],
  "citadelles-rn": [
    k("Gabriel Morin", 5, 2, 2, 1, 2.93),
    k("Étienne Jarret", 6, 1, 3, 1, 3.47),
  ],
  "espoirs-sag-lsj": [
    k("Nathan Cleary", 6, 1, 5, 0, 2.0),
    k("Olivier Huet", 3, 1, 2, 0, 4.34),
  ],
  "blizzard-ssf": [
    k("Lincoln IV Anderson", 3, 1, 2, 0, 3.03),
    k("Charles-Olivier Guénette", 6, 1, 3, 1, 4.48),
  ],
  "albatros": [
    k("Justin Raymond", 7, 1, 6, 0, 3.48),
    k("Felix Berube", 3, 0, 3, 0, 6.27),
  ],
  "harfangs-sherbrooke": [
    k("Caleb Dumas", 4, 1, 2, 0, 4.05),
    k("Megan Savard", 3, 1, 1, 1, 3.2),
  ],
  "grenadiers-lsl": [
    k("Kayson-Francesco Bertrand-Saldana", 5, 0, 4, 0, 4.15),
    k("Sheldon Hills-Lefebvre", 6, 0, 3, 1, 4.87),
  ],
};
