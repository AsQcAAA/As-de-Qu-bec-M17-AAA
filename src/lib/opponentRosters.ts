/**
 * Effectifs des équipes adverses (numéro → nom), copiés du cahier d'équipe LHEQ.
 * Servent à retrouver le nom d'un joueur adverse à partir de son numéro dans
 * l'alignement saisi après le match. Les joueurs d'appoint (JA) n'ont pas de
 * numéro fixe : ils ne figurent pas ici.
 * Clé : le slug de l'équipe dans lheqTeams.ts.
 */
export const OPPONENT_ROSTERS: Record<string, Record<string, string>> = {
  albatros: {
    "30": "Felix Berube",
    "35": "Justin Raymond",
    "58": "Anthony Desjardins",
    "18": "Baptiste Dube",
    "9": "Clovis Dube",
    "19": "Dylan Boudreau",
    "27": "Emile Cummings",
    "55": "Felix Cormier",
    "37": "Felix Ruel",
    "10": "Florent de Chantal",
    "92": "Henri Labrecque",
    "44": "Loic Marquis",
    "88": "Lucas Harrisson",
    "98": "Max Damours",
    "81": "Nick Beliveau",
    "77": "Noa Cyr",
    "68": "Pierre-Alexandre Dumais",
    "71": "Samuel Pinel",
    "59": "Zackary Caissy",
  },
};
