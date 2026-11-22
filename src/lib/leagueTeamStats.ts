/**
 * Classement et statistiques d'équipe de la ligue (M17 AAA, saison régulière), recopiés du classement général
 * du site de la LHEQ (avec « statistiques avancées »). Clé : slug de l'équipe (voir lheqTeams.ts).
 * Mise à jour : voir TEAM_STATS_UPDATED.
 */
export const TEAM_STATS_UPDATED = "2026-11-22";

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
  "piche": { rank: 2, gp: 13, w: 11, wReg: 9, wOt: 0, wSo: 2, ties: 0, l: 2, lReg: 0, lOt: 1, lSo: 1, fj: 12, pts: 45, ptsPct: ".865", gf: 44, ga: 23, diff: "+21", gfPerGame: "3.38", gaPerGame: "1.77", pim: 144, pimPerGame: "11:05", pp: "11/44", ppPct: "25.00", pk: "42/51", pkPct: "82.35" },
  "dynamiques-ccl": { rank: 3, gp: 12, w: 10, wReg: 10, wOt: 0, wSo: 0, ties: 0, l: 2, lReg: 1, lOt: 0, lSo: 1, fj: 12, pts: 43, ptsPct: ".896", gf: 52, ga: 20, diff: "+32", gfPerGame: "4.33", gaPerGame: "1.67", pim: 122, pimPerGame: "10:10", pp: "8/54", ppPct: "14.81", pk: "44/51", pkPct: "86.27" },
  "as-de-quebec": { rank: 4, gp: 12, w: 10, wReg: 10, wOt: 0, wSo: 0, ties: 0, l: 2, lReg: 2, lOt: 0, lSo: 0, fj: 12, pts: 42, ptsPct: ".875", gf: 62, ga: 21, diff: "+41", gfPerGame: "5.17", gaPerGame: "1.75", pim: 116, pimPerGame: "9:40", pp: "9/41", ppPct: "21.95", pk: "33/38", pkPct: "86.84" },
  "rousseau-royal-lav-mtl": { rank: 5, gp: 14, w: 10, wReg: 9, wOt: 1, wSo: 0, ties: 0, l: 4, lReg: 3, lOt: 1, lSo: 0, fj: 12, pts: 42, ptsPct: ".750", gf: 69, ga: 39, diff: "+30", gfPerGame: "4.93", gaPerGame: "2.79", pim: 182, pimPerGame: "13:00", pp: "12/42", ppPct: "28.57", pk: "46/53", pkPct: "86.79" },
  "gaulois-ric": { rank: 6, gp: 15, w: 10, wReg: 7, wOt: 1, wSo: 2, ties: 0, l: 5, lReg: 4, lOt: 0, lSo: 1, fj: 13, pts: 41, ptsPct: ".683", gf: 45, ga: 31, diff: "+14", gfPerGame: "3.00", gaPerGame: "2.07", pim: 172, pimPerGame: "11:28", pp: "7/47", ppPct: "14.89", pk: "43/46", pkPct: "93.48" },
  "select-du-nord": { rank: 7, gp: 15, w: 10, wReg: 7, wOt: 3, wSo: 0, ties: 0, l: 5, lReg: 5, lOt: 0, lSo: 0, fj: 13, pts: 40, ptsPct: ".667", gf: 55, ga: 40, diff: "+15", gfPerGame: "3.67", gaPerGame: "2.67", pim: 192, pimPerGame: "12:48", pp: "8/52", ppPct: "15.38", pk: "47/56", pkPct: "83.93" },
  "corsaires-pointe-levy": { rank: 8, gp: 14, w: 8, wReg: 7, wOt: 1, wSo: 0, ties: 0, l: 6, lReg: 4, lOt: 2, lSo: 0, fj: 13, pts: 38, ptsPct: ".679", gf: 36, ga: 46, diff: "-10", gfPerGame: "2.57", gaPerGame: "3.29", pim: 114, pimPerGame: "8:08", pp: "7/44", ppPct: "15.91", pk: "24/33", pkPct: "72.73" },
  "estacades-mauricie": { rank: 9, gp: 13, w: 7, wReg: 7, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 6, lOt: 0, lSo: 0, fj: 10, pts: 31, ptsPct: ".596", gf: 49, ga: 31, diff: "+18", gfPerGame: "3.77", gaPerGame: "2.38", pim: 183, pimPerGame: "14:05", pp: "15/43", ppPct: "34.88", pk: "35/41", pkPct: "85.37" },
  "conquerants-bl": { rank: 10, gp: 13, w: 7, wReg: 6, wOt: 0, wSo: 1, ties: 0, l: 6, lReg: 6, lOt: 0, lSo: 0, fj: 11, pts: 31, ptsPct: ".596", gf: 34, ga: 41, diff: "-7", gfPerGame: "2.62", gaPerGame: "3.15", pim: 195, pimPerGame: "15:00", pp: "5/37", ppPct: "13.51", pk: "33/38", pkPct: "86.84" },
  "seigneurs-mi": { rank: 11, gp: 12, w: 6, wReg: 6, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 5, lOt: 0, lSo: 1, fj: 11, pts: 30, ptsPct: ".625", gf: 35, ga: 32, diff: "+3", gfPerGame: "2.92", gaPerGame: "2.67", pim: 122, pimPerGame: "10:10", pp: "7/35", ppPct: "20.00", pk: "30/36", pkPct: "83.33" },
  "senateurs-out": { rank: 12, gp: 14, w: 6, wReg: 5, wOt: 0, wSo: 1, ties: 0, l: 8, lReg: 8, lOt: 0, lSo: 0, fj: 13, pts: 30, ptsPct: ".536", gf: 43, ga: 62, diff: "-19", gfPerGame: "3.07", gaPerGame: "4.43", pim: 145, pimPerGame: "10:22", pp: "7/47", ppPct: "14.89", pk: "24/36", pkPct: "66.67" },
  "pionniers-lan": { rank: 13, gp: 12, w: 5, wReg: 5, wOt: 0, wSo: 0, ties: 0, l: 7, lReg: 5, lOt: 0, lSo: 2, fj: 11, pts: 28, ptsPct: ".583", gf: 45, ga: 36, diff: "+9", gfPerGame: "3.75", gaPerGame: "3.00", pim: 136, pimPerGame: "11:20", pp: "6/48", ppPct: "12.50", pk: "33/40", pkPct: "82.50" },
  "citadelles-rn": { rank: 14, gp: 12, w: 5, wReg: 4, wOt: 0, wSo: 1, ties: 0, l: 7, lReg: 5, lOt: 2, lSo: 0, fj: 12, pts: 28, ptsPct: ".583", gf: 31, ga: 38, diff: "-7", gfPerGame: "2.58", gaPerGame: "3.17", pim: 110, pimPerGame: "9:10", pp: "13/44", ppPct: "29.55", pk: "26/32", pkPct: "81.25" },
  "lions-lsl": { rank: 15, gp: 14, w: 4, wReg: 4, wOt: 0, wSo: 0, ties: 0, l: 10, lReg: 10, lOt: 0, lSo: 0, fj: 13, pts: 25, ptsPct: ".446", gf: 29, ga: 40, diff: "-11", gfPerGame: "2.07", gaPerGame: "2.86", pim: 200, pimPerGame: "14:17", pp: "7/43", ppPct: "16.28", pk: "38/47", pkPct: "80.85" },
  "espoirs-sag-lsj": { rank: 16, gp: 14, w: 4, wReg: 1, wOt: 3, wSo: 0, ties: 0, l: 10, lReg: 10, lOt: 0, lSo: 0, fj: 12, pts: 21, ptsPct: ".375", gf: 30, ga: 54, diff: "-24", gfPerGame: "2.14", gaPerGame: "3.86", pim: 148, pimPerGame: "10:34", pp: "11/51", ppPct: "21.57", pk: "27/36", pkPct: "75.00" },
  "albatros": { rank: 17, gp: 14, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 0, l: 12, lReg: 12, lOt: 0, lSo: 0, fj: 14, pts: 20, ptsPct: ".357", gf: 27, ga: 63, diff: "-36", gfPerGame: "1.93", gaPerGame: "4.50", pim: 152, pimPerGame: "10:52", pp: "10/57", ppPct: "17.54", pk: "43/58", pkPct: "74.14" },
  "blizzard-ssf": { rank: 18, gp: 13, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 0, l: 11, lReg: 10, lOt: 1, lSo: 0, fj: 11, pts: 18, ptsPct: ".346", gf: 24, ga: 51, diff: "-27", gfPerGame: "1.85", gaPerGame: "3.92", pim: 170, pimPerGame: "13:05", pp: "5/27", ppPct: "18.52", pk: "35/41", pkPct: "85.37" },
  "harfangs-sherbrooke": { rank: 19, gp: 9, w: 3, wReg: 3, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 5, lOt: 0, lSo: 1, fj: 7, pts: 17, ptsPct: ".472", gf: 21, ga: 34, diff: "-13", gfPerGame: "2.33", gaPerGame: "3.78", pim: 143, pimPerGame: "15:53", pp: "4/23", ppPct: "17.39", pk: "27/33", pkPct: "81.82" },
  "grenadiers-lsl": { rank: 20, gp: 14, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 0, l: 12, lReg: 11, lOt: 1, lSo: 0, fj: 10, pts: 17, ptsPct: ".304", gf: 24, ga: 64, diff: "-40", gfPerGame: "1.71", gaPerGame: "4.57", pim: 260, pimPerGame: "18:34", pp: "7/61", ppPct: "11.48", pk: "53/66", pkPct: "80.30" },
};
