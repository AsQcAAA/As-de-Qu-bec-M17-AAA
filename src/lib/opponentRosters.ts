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
  "blizzard-ssf": {
    "31": "Charles-Olivier Guénette",
    "1": "Lincoln IV Anderson",
    "26": "Arthur Côté",
    "3": "Édouard Pronovost",
    "38": "Emile Gagné",
    "24": "Emrick Jackson",
    "29": "Félix-Olivier Matte",
    "13": "Jaden Beaupre",
    "17": "John Paris",
    "16": "Léo-Charles Bourgault",
    "25": "Loïc Paquet",
    "27": "Mathéo Lemaire-Martin",
    "28": "Mathis Lord",
    "15": "Maxence Guimont-Brochu",
    "19": "Nathan Ouellet",
    "2": "Thomas Goulet",
    "40": "Zac Marceau",
    "14": "Zachary Trudel",
  },
};
