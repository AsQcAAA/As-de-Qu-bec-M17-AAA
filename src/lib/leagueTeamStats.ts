/**
 * Classement et statistiques d'équipe de la ligue (M17 AAA, saison régulière), recopiés des captures
 * du classement général (avec « statistiques avancées »). Clé : slug de l'équipe (voir lheqTeams.ts).
 * Mise à jour : voir TEAM_STATS_UPDATED.
 */
export const TEAM_STATS_UPDATED = "2026-10-26";

export interface TeamStats {
  rank: number;
  gp: number;
  w: number;
  /** Victoires : temps réglementaire / prolongation / fusillade */
  wReg: number;
  wOt: number;
  wSo: number;
  ties: number;
  /** Défaites : total, temps réglementaire, prolongation, fusillade */
  l: number;
  lReg: number;
  lOt: number;
  lSo: number;
  /** Fiche de jeu (FJ) */
  fj: number;
  pts: number;
  ptsPct: string;
  gf: number;
  ga: number;
  diff: string;
  gfPerGame: string;
  gaPerGame: string;
  pim: number;
  pimPerGame: string;
  /** Avantage numérique : buts/occasions et % */
  pp: string;
  ppPct: string;
  /** Désavantage numérique : arrêts/occasions et % */
  pk: string;
  pkPct: string;
}

export const TEAM_STATS: Record<string, TeamStats> = {
  "canam-ba": { rank: 1, gp: 12, w: 8, wReg: 8, wOt: 0, wSo: 0, ties: 0, l: 4, lReg: 3, lOt: 1, lSo: 0, fj: 12, pts: 37, ptsPct: ".771", gf: 46, ga: 35, diff: "+11", gfPerGame: "3.83", gaPerGame: "2.92", pim: 116, pimPerGame: "9:40", pp: "8/37", ppPct: "21.62", pk: "28/37", pkPct: "75.68" },
  "piche": { rank: 2, gp: 10, w: 9, wReg: 7, wOt: 0, wSo: 2, ties: 0, l: 1, lReg: 0, lOt: 0, lSo: 1, fj: 9, pts: 35, ptsPct: ".875", gf: 33, ga: 17, diff: "+16", gfPerGame: "3.30", gaPerGame: "1.70", pim: 122, pimPerGame: "12:12", pp: "8/35", ppPct: "22.86", pk: "35/42", pkPct: "83.33" },
  "corsaires-pointe-levy": { rank: 3, gp: 12, w: 8, wReg: 7, wOt: 1, wSo: 0, ties: 0, l: 4, lReg: 3, lOt: 1, lSo: 0, fj: 11, pts: 35, ptsPct: ".729", gf: 33, ga: 33, diff: "+0", gfPerGame: "2.75", gaPerGame: "2.75", pim: 96, pimPerGame: "8:00", pp: "7/40", ppPct: "17.50", pk: "22/28", pkPct: "78.57" },
  "dynamiques-ccl": { rank: 4, gp: 9, w: 8, wReg: 8, wOt: 0, wSo: 0, ties: 0, l: 1, lReg: 0, lOt: 0, lSo: 1, fj: 9, pts: 34, ptsPct: ".944", gf: 40, ga: 12, diff: "+28", gfPerGame: "4.44", gaPerGame: "1.33", pim: 92, pimPerGame: "10:13", pp: "6/42", ppPct: "14.29", pk: "34/38", pkPct: "89.47" },
  "rousseau-royal-lav-mtl": { rank: 5, gp: 10, w: 8, wReg: 7, wOt: 1, wSo: 0, ties: 0, l: 2, lReg: 2, lOt: 0, lSo: 0, fj: 9, pts: 32, ptsPct: ".800", gf: 48, ga: 26, diff: "+22", gfPerGame: "4.80", gaPerGame: "2.60", pim: 118, pimPerGame: "11:48", pp: "9/29", ppPct: "31.03", pk: "36/40", pkPct: "90.00" },
  "select-du-nord": { rank: 6, gp: 12, w: 7, wReg: 5, wOt: 2, wSo: 0, ties: 0, l: 5, lReg: 5, lOt: 0, lSo: 0, fj: 11, pts: 30, ptsPct: ".625", gf: 40, ga: 35, diff: "+5", gfPerGame: "3.33", gaPerGame: "2.92", pim: 154, pimPerGame: "12:50", pp: "4/40", ppPct: "10.00", pk: "33/42", pkPct: "78.57" },
  "as-de-quebec": { rank: 7, gp: 8, w: 7, wReg: 7, wOt: 0, wSo: 0, ties: 0, l: 1, lReg: 1, lOt: 0, lSo: 0, fj: 8, pts: 29, ptsPct: ".906", gf: 42, ga: 11, diff: "+31", gfPerGame: "5.25", gaPerGame: "1.38", pim: 80, pimPerGame: "10:00", pp: "5/26", ppPct: "19.23", pk: "24/26", pkPct: "92.31" },
  "gaulois-ric": { rank: 8, gp: 9, w: 6, wReg: 4, wOt: 0, wSo: 2, ties: 0, l: 3, lReg: 2, lOt: 0, lSo: 1, fj: 8, pts: 25, ptsPct: ".694", gf: 25, ga: 19, diff: "+6", gfPerGame: "2.78", gaPerGame: "2.11", pim: 90, pimPerGame: "10:00", pp: "3/28", ppPct: "10.71", pk: "26/28", pkPct: "92.86" },
  "conquerants-bl": { rank: 9, gp: 8, w: 5, wReg: 4, wOt: 0, wSo: 1, ties: 0, l: 3, lReg: 3, lOt: 0, lSo: 0, fj: 8, pts: 22, ptsPct: ".688", gf: 23, ga: 25, diff: "-2", gfPerGame: "2.88", gaPerGame: "3.13", pim: 108, pimPerGame: "13:30", pp: "4/21", ppPct: "19.05", pk: "20/21", pkPct: "95.24" },
  "seigneurs-mi": { rank: 10, gp: 8, w: 4, wReg: 4, wOt: 0, wSo: 0, ties: 0, l: 4, lReg: 4, lOt: 0, lSo: 0, fj: 8, pts: 20, ptsPct: ".625", gf: 20, ga: 19, diff: "+1", gfPerGame: "2.50", gaPerGame: "2.38", pim: 62, pimPerGame: "7:45", pp: "4/26", ppPct: "15.38", pk: "17/21", pkPct: "80.95" },
  "senateurs-out": { rank: 11, gp: 9, w: 4, wReg: 4, wOt: 0, wSo: 0, ties: 0, l: 5, lReg: 5, lOt: 0, lSo: 0, fj: 8, pts: 20, ptsPct: ".556", gf: 27, ga: 41, diff: "-14", gfPerGame: "3.00", gaPerGame: "4.56", pim: 107, pimPerGame: "11:53", pp: "4/31", ppPct: "12.90", pk: "18/27", pkPct: "66.67" },
  "pionniers-lan": { rank: 12, gp: 9, w: 3, wReg: 3, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 4, lOt: 0, lSo: 2, fj: 9, pts: 20, ptsPct: ".556", gf: 33, ga: 27, diff: "+6", gfPerGame: "3.67", gaPerGame: "3.00", pim: 84, pimPerGame: "9:20", pp: "3/32", ppPct: "9.38", pk: "21/25", pkPct: "84.00" },
  "citadelles-rn": { rank: 13, gp: 10, w: 3, wReg: 2, wOt: 0, wSo: 1, ties: 0, l: 7, lReg: 5, lOt: 2, lSo: 0, fj: 10, pts: 20, ptsPct: ".500", gf: 23, ga: 36, diff: "-13", gfPerGame: "2.30", gaPerGame: "3.60", pim: 88, pimPerGame: "8:48", pp: "9/34", ppPct: "26.47", pk: "22/28", pkPct: "78.57" },
  "lions-lsl": { rank: 14, gp: 10, w: 3, wReg: 3, wOt: 0, wSo: 0, ties: 0, l: 7, lReg: 7, lOt: 0, lSo: 0, fj: 10, pts: 19, ptsPct: ".475", gf: 23, ga: 27, diff: "-4", gfPerGame: "2.30", gaPerGame: "2.70", pim: 134, pimPerGame: "13:24", pp: "5/26", ppPct: "19.23", pk: "26/31", pkPct: "83.87" },
  "estacades-mauricie": { rank: 15, gp: 9, w: 3, wReg: 3, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 6, lOt: 0, lSo: 0, fj: 7, pts: 16, ptsPct: ".444", gf: 24, ga: 26, diff: "-2", gfPerGame: "2.67", gaPerGame: "2.89", pim: 127, pimPerGame: "14:07", pp: "7/26", ppPct: "26.92", pk: "19/24", pkPct: "79.17" },
  "blizzard-ssf": { rank: 16, gp: 8, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 5, lOt: 1, lSo: 0, fj: 6, pts: 13, ptsPct: ".406", gf: 17, ga: 32, diff: "-15", gfPerGame: "2.13", gaPerGame: "4.00", pim: 114, pimPerGame: "14:15", pp: "4/18", ppPct: "22.22", pk: "30/34", pkPct: "88.24" },
  "albatros": { rank: 17, gp: 10, w: 1, wReg: 1, wOt: 0, wSo: 0, ties: 0, l: 9, lReg: 9, lOt: 0, lSo: 0, fj: 10, pts: 13, ptsPct: ".325", gf: 19, ga: 45, diff: "-26", gfPerGame: "1.90", gaPerGame: "4.50", pim: 106, pimPerGame: "10:36", pp: "8/40", ppPct: "20.00", pk: "29/40", pkPct: "72.50" },
  "harfangs-sherbrooke": { rank: 18, gp: 6, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 0, l: 4, lReg: 3, lOt: 0, lSo: 1, fj: 5, pts: 12, ptsPct: ".500", gf: 17, ga: 24, diff: "-7", gfPerGame: "2.83", gaPerGame: "4.00", pim: 92, pimPerGame: "15:20", pp: "4/17", ppPct: "23.53", pk: "19/22", pkPct: "86.36" },
  "espoirs-sag-lsj": { rank: 19, gp: 9, w: 2, wReg: 0, wOt: 2, wSo: 0, ties: 0, l: 7, lReg: 7, lOt: 0, lSo: 0, fj: 7, pts: 11, ptsPct: ".306", gf: 16, ga: 32, diff: "-16", gfPerGame: "1.78", gaPerGame: "3.56", pim: 106, pimPerGame: "11:47", pp: "5/27", ppPct: "18.52", pk: "15/20", pkPct: "75.00" },
  "grenadiers-lsl": { rank: 20, gp: 8, w: 0, wReg: 0, wOt: 0, wSo: 0, ties: 0, l: 8, lReg: 7, lOt: 1, lSo: 0, fj: 7, pts: 8, ptsPct: ".250", gf: 11, ga: 38, diff: "-27", gfPerGame: "1.38", gaPerGame: "4.75", pim: 122, pimPerGame: "15:15", pp: "5/36", ppPct: "13.89", pk: "29/37", pkPct: "78.38" },
};
