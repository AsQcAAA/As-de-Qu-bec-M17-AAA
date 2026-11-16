/**
 * Classement et statistiques d'équipe de la ligue (M17 AAA, saison régulière), recopiés du classement général
 * du site de la LHEQ (avec « statistiques avancées »). Clé : slug de l'équipe (voir lheqTeams.ts).
 * Mise à jour : voir TEAM_STATS_UPDATED.
 */
export const TEAM_STATS_UPDATED = "2026-11-16";

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
  "canam-ba": { rank: 1, gp: 15, w: 10, wReg: 10, wOt: 0, wSo: 0, ties: 0, l: 5, lReg: 4, lOt: 1, lSo: 0, fj: 15, pts: 46, ptsPct: ".767", gf: 56, ga: 45, diff: "+11", gfPerGame: "3.73", gaPerGame: "3.00", pim: 164, pimPerGame: "10:56", pp: "9/44", ppPct: "20.45", pk: "40/52", pkPct: "76.92" },
  "dynamiques-ccl": { rank: 2, gp: 12, w: 10, wReg: 10, wOt: 0, wSo: 0, ties: 0, l: 2, lReg: 1, lOt: 0, lSo: 1, fj: 12, pts: 43, ptsPct: ".896", gf: 52, ga: 20, diff: "+32", gfPerGame: "4.33", gaPerGame: "1.67", pim: 122, pimPerGame: "10:10", pp: "8/54", ppPct: "14.81", pk: "44/51", pkPct: "86.27" },
  "piche": { rank: 3, gp: 12, w: 10, wReg: 8, wOt: 0, wSo: 2, ties: 0, l: 2, lReg: 0, lOt: 1, lSo: 1, fj: 11, pts: 41, ptsPct: ".854", gf: 40, ga: 23, diff: "+17", gfPerGame: "3.33", gaPerGame: "1.92", pim: 140, pimPerGame: "11:40", pp: "9/40", ppPct: "22.50", pk: "41/50", pkPct: "82.00" },
  "select-du-nord": { rank: 4, gp: 15, w: 10, wReg: 7, wOt: 3, wSo: 0, ties: 0, l: 5, lReg: 5, lOt: 0, lSo: 0, fj: 13, pts: 40, ptsPct: ".667", gf: 55, ga: 40, diff: "+15", gfPerGame: "3.67", gaPerGame: "2.67", pim: 192, pimPerGame: "12:48", pp: "8/52", ppPct: "15.38", pk: "47/56", pkPct: "83.93" },
  "rousseau-royal-lav-mtl": { rank: 5, gp: 13, w: 9, wReg: 8, wOt: 1, wSo: 0, ties: 0, l: 4, lReg: 3, lOt: 1, lSo: 0, fj: 12, pts: 39, ptsPct: ".750", gf: 62, ga: 38, diff: "+24", gfPerGame: "4.77", gaPerGame: "2.92", pim: 138, pimPerGame: "10:37", pp: "11/37", ppPct: "29.73", pk: "42/48", pkPct: "87.50" },
  "as-de-quebec": { rank: 6, gp: 11, w: 9, wReg: 9, wOt: 0, wSo: 0, ties: 0, l: 2, lReg: 2, lOt: 0, lSo: 0, fj: 11, pts: 38, ptsPct: ".864", gf: 53, ga: 17, diff: "+36", gfPerGame: "4.82", gaPerGame: "1.55", pim: 108, pimPerGame: "9:49", pp: "7/37", ppPct: "18.92", pk: "31/34", pkPct: "91.18" },
  "corsaires-pointe-levy": { rank: 7, gp: 14, w: 8, wReg: 7, wOt: 1, wSo: 0, ties: 0, l: 6, lReg: 4, lOt: 2, lSo: 0, fj: 13, pts: 38, ptsPct: ".679", gf: 36, ga: 46, diff: "-10", gfPerGame: "2.57", gaPerGame: "3.29", pim: 114, pimPerGame: "8:08", pp: "7/44", ppPct: "15.91", pk: "24/33", pkPct: "72.73" },
  "gaulois-ric": { rank: 8, gp: 13, w: 9, wReg: 6, wOt: 1, wSo: 2, ties: 0, l: 4, lReg: 3, lOt: 0, lSo: 1, fj: 11, pts: 36, ptsPct: ".692", gf: 40, ga: 26, diff: "+14", gfPerGame: "3.08", gaPerGame: "2.00", pim: 160, pimPerGame: "12:19", pp: "7/41", ppPct: "17.07", pk: "40/42", pkPct: "95.24" },
  "conquerants-bl": { rank: 9, gp: 12, w: 7, wReg: 6, wOt: 0, wSo: 1, ties: 0, l: 5, lReg: 5, lOt: 0, lSo: 0, fj: 11, pts: 31, ptsPct: ".646", gf: 32, ga: 36, diff: "-4", gfPerGame: "2.67", gaPerGame: "3.00", pim: 170, pimPerGame: "14:10", pp: "5/32", ppPct: "15.63", pk: "32/36", pkPct: "88.89" },
  "senateurs-out": { rank: 10, gp: 13, w: 6, wReg: 5, wOt: 0, wSo: 1, ties: 0, l: 7, lReg: 7, lOt: 0, lSo: 0, fj: 12, pts: 29, ptsPct: ".558", gf: 40, ga: 56, diff: "-16", gfPerGame: "3.08", gaPerGame: "4.31", pim: 137, pimPerGame: "10:32", pp: "7/46", ppPct: "15.22", pk: "22/32", pkPct: "68.75" },
  "citadelles-rn": { rank: 11, gp: 12, w: 5, wReg: 4, wOt: 0, wSo: 1, ties: 0, l: 7, lReg: 5, lOt: 2, lSo: 0, fj: 12, pts: 28, ptsPct: ".583", gf: 31, ga: 38, diff: "-7", gfPerGame: "2.58", gaPerGame: "3.17", pim: 110, pimPerGame: "9:10", pp: "13/44", ppPct: "29.55", pk: "26/32", pkPct: "81.25" },
  "estacades-mauricie": { rank: 12, gp: 12, w: 6, wReg: 6, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 6, lOt: 0, lSo: 0, fj: 9, pts: 27, ptsPct: ".563", gf: 47, ga: 30, diff: "+17", gfPerGame: "3.92", gaPerGame: "2.50", pim: 179, pimPerGame: "14:55", pp: "14/42", ppPct: "33.33", pk: "33/39", pkPct: "84.62" },
  "seigneurs-mi": { rank: 13, gp: 11, w: 5, wReg: 5, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 5, lOt: 0, lSo: 1, fj: 10, pts: 26, ptsPct: ".591", gf: 30, ga: 30, diff: "+0", gfPerGame: "2.73", gaPerGame: "2.73", pim: 108, pimPerGame: "9:49", pp: "6/33", ppPct: "18.18", pk: "25/31", pkPct: "80.65" },
  "pionniers-lan": { rank: 14, gp: 11, w: 4, wReg: 4, wOt: 0, wSo: 0, ties: 0, l: 7, lReg: 5, lOt: 0, lSo: 2, fj: 10, pts: 24, ptsPct: ".545", gf: 39, ga: 33, diff: "+6", gfPerGame: "3.55", gaPerGame: "3.00", pim: 134, pimPerGame: "12:11", pp: "4/44", ppPct: "9.09", pk: "32/39", pkPct: "82.05" },
  "lions-lsl": { rank: 15, gp: 14, w: 4, wReg: 4, wOt: 0, wSo: 0, ties: 0, l: 10, lReg: 10, lOt: 0, lSo: 0, fj: 12, pts: 24, ptsPct: ".429", gf: 29, ga: 40, diff: "-11", gfPerGame: "2.07", gaPerGame: "2.86", pim: 213, pimPerGame: "15:13", pp: "7/43", ppPct: "16.28", pk: "38/47", pkPct: "80.85" },
  "espoirs-sag-lsj": { rank: 16, gp: 13, w: 4, wReg: 1, wOt: 3, wSo: 0, ties: 0, l: 9, lReg: 9, lOt: 0, lSo: 0, fj: 11, pts: 20, ptsPct: ".385", gf: 26, ga: 45, diff: "-19", gfPerGame: "2.00", gaPerGame: "3.46", pim: 140, pimPerGame: "10:46", pp: "9/47", ppPct: "19.15", pk: "25/32", pkPct: "78.13" },
  "blizzard-ssf": { rank: 17, gp: 12, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 0, l: 10, lReg: 9, lOt: 1, lSo: 0, fj: 10, pts: 17, ptsPct: ".354", gf: 23, ga: 49, diff: "-26", gfPerGame: "1.92", gaPerGame: "4.08", pim: 166, pimPerGame: "13:50", pp: "5/25", ppPct: "20.00", pk: "35/40", pkPct: "87.50" },
  "albatros": { rank: 18, gp: 12, w: 1, wReg: 1, wOt: 0, wSo: 0, ties: 0, l: 11, lReg: 11, lOt: 0, lSo: 0, fj: 12, pts: 15, ptsPct: ".313", gf: 22, ga: 58, diff: "-36", gfPerGame: "1.83", gaPerGame: "4.83", pim: 136, pimPerGame: "11:20", pp: "9/53", ppPct: "16.98", pk: "37/52", pkPct: "71.15" },
  "harfangs-sherbrooke": { rank: 19, gp: 7, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 1, l: 4, lReg: 3, lOt: 0, lSo: 1, fj: 6, pts: 14, ptsPct: ".500", gf: 18, ga: 25, diff: "-7", gfPerGame: "2.57", gaPerGame: "3.57", pim: 94, pimPerGame: "13:26", pp: "4/18", ppPct: "22.22", pk: "20/23", pkPct: "86.96" },
  "grenadiers-lsl": { rank: 20, gp: 12, w: 1, wReg: 1, wOt: 0, wSo: 0, ties: 1, l: 10, lReg: 9, lOt: 1, lSo: 0, fj: 9, pts: 14, ptsPct: ".292", gf: 18, ga: 54, diff: "-36", gfPerGame: "1.50", gaPerGame: "4.50", pim: 203, pimPerGame: "16:55", pp: "5/50", ppPct: "10.00", pk: "45/57", pkPct: "78.95" },
};
