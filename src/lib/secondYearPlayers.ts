/**
 * Joueurs de 2e année des autres équipes M17 AAA LHEQ, avec leurs statistiques
 * de la saison 2025-26 (source : stats de joueurs LHEQ). Clé : slug de lheqTeams.ts.
 * Les As de Québec n'y figurent pas : ce sont nos joueurs.
 */
export interface SecondYearPlayer {
  name: string;
  /** Précision : « ex-Conquérants », « homonyme possible »… */
  note?: string;
  gp: number;
  /** Patineurs */
  g?: number;
  a?: number;
  /** Gardiens */
  goalie?: boolean;
  record?: string;
  gaa?: number;
}

const sk = (name: string, gp: number, g: number, a: number, note?: string): SecondYearPlayer => ({ name, gp, g, a, note });
const gk = (name: string, gp: number, record: string, gaa: number, note?: string): SecondYearPlayer => ({
  name,
  gp,
  goalie: true,
  record,
  gaa,
  note,
});

export const SECOND_YEAR_PLAYERS: Record<string, SecondYearPlayer[]> = {
  "canam-ba": [
    sk("Thomas Thibault", 29, 12, 10),
    sk("Félix Couture", 32, 0, 10),
    sk("Jacob Carrier", 31, 4, 5),
    sk("Ludovik Doyon", 30, 5, 2),
    sk("Nathan Giguère", 32, 2, 3),
  ],
  "estacades-mauricie": [
    sk("Loïc Caron", 32, 10, 11),
    sk("Benjamin Ethier", 31, 4, 8),
    sk("Raphael Gélinas", 31, 0, 10),
    sk("Zachary Cloutier", 30, 2, 6),
    sk("Frédéric Fortin", 30, 3, 3),
    gk("Ethan Beaudry", 16, "13-1-1", 1.83),
  ],
  "select-du-nord": [
    sk("William Legault", 31, 7, 5),
    sk("Félix Dufour", 32, 2, 7),
    sk("Mathis Delisle", 32, 4, 5),
    sk("Justin Farrell", 29, 3, 6),
    sk("Gabriel Gagne", 32, 1, 3),
  ],
  "pionniers-lan": [
    sk("Jakob Brouillette", 32, 11, 13),
    sk("Ludovik Gauthier", 31, 13, 8),
    sk("Alexandre Roudnik", 32, 5, 4),
    sk("Mathis Dubois", 32, 0, 7),
    gk("Jacob Lavallee", 18, "7-8-1", 3.65),
  ],
  albatros: [
    sk("Max Damours", 30, 4, 7),
    sk("Nick Beliveau", 32, 2, 5),
    sk("Noa Cyr", 26, 2, 5),
    sk("Clovis Dube", 32, 0, 1),
    gk("Justin Raymond", 19, "6-9-3", 4.04),
  ],
  "citadelles-rn": [
    sk("Adam Falardeau", 28, 1, 4),
    sk("Éliot Galarneau", 32, 1, 3),
    sk("Christophe Dorval", 32, 0, 2),
    sk("Samuel St-Pierre", 31, 0, 0),
  ],
  "conquerants-bl": [
    sk("Logan Gauthier", 26, 2, 7),
    sk("Elliott Duchesneau", 31, 3, 4),
    sk("Trystan Lebel", 26, 2, 1),
    sk("Xavier Couturier", 31, 1, 0, "ex-Pionniers"),
    gk("Alexandre Leblanc", 14, "10-3-1", 2.69),
  ],
  "corsaires-pointe-levy": [sk("Maxandre Viens", 32, 3, 5), sk("Clément Gosselin", 27, 3, 4)],
  piche: [
    sk("William Dufresne", 29, 4, 4, "ex-Canimex"),
    sk("William Leblanc", 32, 3, 3, "ex-Canimex"),
  ],
  "rousseau-royal-lav-mtl": [
    sk("Antonio Di Girolamo", 32, 2, 4),
    sk("Théo Bertrand", 32, 2, 2),
    gk("Noah Laporte", 17, "9-6-1", 2.25),
  ],
  "senateurs-out": [sk("Isaiya Saikaley", 32, 7, 3, "ex-Intrépide")],
  "grenadiers-lsl": [sk("Philippe Charron", 31, 4, 1)],
  "gaulois-ric": [sk("Zachary D'Aquila", 15, 0, 3)],
  "dynamiques-ccl": [
    sk("Félix Theriault", 32, 4, 14, "ex-Conquérants"),
    gk("Charles Mathieu", 17, "12-4-1", 1.93),
  ],
  "seigneurs-mi": [sk("Théodore Chayer", 28, 6, 1, "ex-Conquérants")],
  "espoirs-sag-lsj": [],
  "lions-lsl": [gk("Simon D'Andrea", 20, "7-13-0", 3.37)],
  "blizzard-ssf": [gk("Lincoln IV Anderson", 17, "10-6-1", 1.93, "ex-As Québec")],
  "harfangs-sherbrooke": [],
};

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Ce nom (tel qu'écrit sur une feuille ou un alignement) est-il un joueur de 2e année de l'équipe ? */
export function isSecondYear(teamSlug: string | undefined, name: string | null | undefined): boolean {
  if (!teamSlug || !name) return false;
  const n = norm(name);
  if (!n) return false;
  return (SECOND_YEAR_PLAYERS[teamSlug] ?? []).some((p) => norm(p.name) === n);
}
