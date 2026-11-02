/**
 * Classement et statistiques d'équipe de la ligue (M17 AAA, saison régulière), recopiés des captures
 * du classement général (avec « statistiques avancées »). Clé : slug de l'équipe (voir lheqTeams.ts).
 * Mise à jour : voir TEAM_STATS_UPDATED.
 */
export const TEAM_STATS_UPDATED = "2026-11-02";

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
  "canam-ba": { rank: 1, gp: 14, w: 10, wReg: 10, wOt: 0, wSo: 0, ties: 0, l: 4, lReg: 3, lOt: 1, lSo: 0, fj: 14, pts: 45, ptsPct: ".804", gf: 55, ga: 40, diff: "+15", gfPerGame: "3.93", gaPerGame: "2.86", pim: 148, pimPerGame: "10:34", pp: "9/40", ppPct: "22.50", pk: "35/45", pkPct: "77.78" },
  "dynamiques-ccl": { rank: 2, gp: 11, w: 9, wReg: 9, wOt: 0, wSo: 0, ties: 0, l: 2, lReg: 1, lOt: 0, lSo: 1, fj: 11, pts: 39, ptsPct: ".886", gf: 47, ga: 20, diff: "+27", gfPerGame: "4.27", gaPerGame: "1.82", pim: 112, pimPerGame: "10:11", pp: "7/49", ppPct: "14.29", pk: "39/46", pkPct: "84.78" },
  "rousseau-royal-lav-mtl": { rank: 3, gp: 12, w: 9, wReg: 8, wOt: 1, wSo: 0, ties: 0, l: 3, lReg: 3, lOt: 0, lSo: 0, fj: 11, pts: 37, ptsPct: ".771", gf: 58, ga: 33, diff: "+25", gfPerGame: "4.83", gaPerGame: "2.75", pim: 132, pimPerGame: "11:00", pp: "11/35", ppPct: "31.43", pk: "39/45", pkPct: "86.67" },
  "select-du-nord": { rank: 4, gp: 14, w: 9, wReg: 7, wOt: 2, wSo: 0, ties: 0, l: 5, lReg: 5, lOt: 0, lSo: 0, fj: 11, pts: 36, ptsPct: ".643", gf: 50, ga: 36, diff: "+14", gfPerGame: "3.57", gaPerGame: "2.57", pim: 201, pimPerGame: "14:22", pp: "8/49", ppPct: "16.33", pk: "45/54", pkPct: "83.33" },
  "corsaires-pointe-levy": { rank: 5, gp: 13, w: 8, wReg: 7, wOt: 1, wSo: 0, ties: 0, l: 5, lReg: 4, lOt: 1, lSo: 0, fj: 12, pts: 36, ptsPct: ".692", gf: 35, ga: 36, diff: "-1", gfPerGame: "2.69", gaPerGame: "2.77", pim: 100, pimPerGame: "7:41", pp: "7/42", ppPct: "16.67", pk: "23/29", pkPct: "79.31" },
  "piche": { rank: 6, gp: 10, w: 9, wReg: 7, wOt: 0, wSo: 2, ties: 0, l: 1, lReg: 0, lOt: 0, lSo: 1, fj: 9, pts: 35, ptsPct: ".875", gf: 33, ga: 17, diff: "+16", gfPerGame: "3.30", gaPerGame: "1.70", pim: 122, pimPerGame: "12:12", pp: "8/35", ppPct: "22.86", pk: "35/42", pkPct: "83.33" },
  "as-de-quebec": { rank: 7, gp: 10, w: 8, wReg: 8, wOt: 0, wSo: 0, ties: 0, l: 2, lReg: 2, lOt: 0, lSo: 0, fj: 10, pts: 34, ptsPct: ".850", gf: 48, ga: 16, diff: "+32", gfPerGame: "4.80", gaPerGame: "1.60", pim: 98, pimPerGame: "9:48", pp: "5/30", ppPct: "16.67", pk: "27/30", pkPct: "90.00" },
  "gaulois-ric": { rank: 8, gp: 11, w: 7, wReg: 5, wOt: 0, wSo: 2, ties: 0, l: 4, lReg: 3, lOt: 0, lSo: 1, fj: 10, pts: 30, ptsPct: ".682", gf: 30, ga: 26, diff: "+4", gfPerGame: "2.73", gaPerGame: "2.36", pim: 122, pimPerGame: "11:05", pp: "4/32", ppPct: "12.50", pk: "33/35", pkPct: "94.29" },
  "citadelles-rn": { rank: 9, gp: 12, w: 5, wReg: 4, wOt: 0, wSo: 1, ties: 0, l: 7, lReg: 5, lOt: 2, lSo: 0, fj: 12, pts: 28, ptsPct: ".583", gf: 31, ga: 38, diff: "-7", gfPerGame: "2.58", gaPerGame: "3.17", pim: 110, pimPerGame: "9:10", pp: "13/44", ppPct: "29.55", pk: "26/32", pkPct: "81.25" },
  "conquerants-bl": { rank: 10, gp: 10, w: 6, wReg: 5, wOt: 0, wSo: 1, ties: 0, l: 4, lReg: 4, lOt: 0, lSo: 0, fj: 10, pts: 27, ptsPct: ".675", gf: 27, ga: 32, diff: "-5", gfPerGame: "2.70", gaPerGame: "3.20", pim: 124, pimPerGame: "12:24", pp: "5/26", ppPct: "19.23", pk: "21/23", pkPct: "91.30" },
  "seigneurs-mi": { rank: 11, gp: 9, w: 5, wReg: 5, wOt: 0, wSo: 0, ties: 0, l: 4, lReg: 4, lOt: 0, lSo: 0, fj: 9, pts: 24, ptsPct: ".667", gf: 25, ga: 23, diff: "+2", gfPerGame: "2.78", gaPerGame: "2.56", pim: 66, pimPerGame: "7:20", pp: "5/29", ppPct: "17.24", pk: "18/22", pkPct: "81.82" },
  "estacades-mauricie": { rank: 12, gp: 11, w: 5, wReg: 5, wOt: 0, wSo: 0, ties: 0, l: 6, lReg: 6, lOt: 0, lSo: 0, fj: 9, pts: 24, ptsPct: ".545", gf: 37, ga: 29, diff: "+8", gfPerGame: "3.36", gaPerGame: "2.64", pim: 159, pimPerGame: "14:27", pp: "11/38", ppPct: "28.95", pk: "31/37", pkPct: "83.78" },
  "senateurs-out": { rank: 13, gp: 11, w: 4, wReg: 4, wOt: 0, wSo: 0, ties: 0, l: 7, lReg: 7, lOt: 0, lSo: 0, fj: 10, pts: 22, ptsPct: ".500", gf: 33, ga: 51, diff: "-18", gfPerGame: "3.00", gaPerGame: "4.64", pim: 115, pimPerGame: "10:27", pp: "5/37", ppPct: "13.51", pk: "19/28", pkPct: "67.86" },
  "pionniers-lan": { rank: 14, gp: 10, w: 3, wReg: 3, wOt: 0, wSo: 0, ties: 0, l: 7, lReg: 5, lOt: 0, lSo: 2, fj: 9, pts: 20, ptsPct: ".500", gf: 34, ga: 33, diff: "+1", gfPerGame: "3.40", gaPerGame: "3.30", pim: 112, pimPerGame: "11:12", pp: "3/39", ppPct: "7.69", pk: "25/32", pkPct: "78.13" },
  "lions-lsl": { rank: 15, gp: 12, w: 3, wReg: 3, wOt: 0, wSo: 0, ties: 0, l: 9, lReg: 9, lOt: 0, lSo: 0, fj: 11, pts: 20, ptsPct: ".417", gf: 25, ga: 35, diff: "-10", gfPerGame: "2.08", gaPerGame: "2.92", pim: 178, pimPerGame: "14:50", pp: "5/30", ppPct: "16.67", pk: "32/41", pkPct: "78.05" },
  "espoirs-sag-lsj": { rank: 16, gp: 11, w: 3, wReg: 1, wOt: 2, wSo: 0, ties: 0, l: 8, lReg: 8, lOt: 0, lSo: 0, fj: 9, pts: 16, ptsPct: ".364", gf: 20, ga: 38, diff: "-18", gfPerGame: "1.82", gaPerGame: "3.45", pim: 128, pimPerGame: "11:38", pp: "7/39", ppPct: "17.95", pk: "21/27", pkPct: "77.78" },
  "blizzard-ssf": { rank: 17, gp: 10, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 0, l: 8, lReg: 7, lOt: 1, lSo: 0, fj: 8, pts: 15, ptsPct: ".375", gf: 23, ga: 41, diff: "-18", gfPerGame: "2.30", gaPerGame: "4.10", pim: 142, pimPerGame: "14:12", pp: "5/18", ppPct: "27.78", pk: "30/34", pkPct: "88.24" },
  "albatros": { rank: 18, gp: 12, w: 1, wReg: 1, wOt: 0, wSo: 0, ties: 0, l: 11, lReg: 11, lOt: 0, lSo: 0, fj: 12, pts: 15, ptsPct: ".313", gf: 22, ga: 58, diff: "-36", gfPerGame: "1.83", gaPerGame: "4.83", pim: 136, pimPerGame: "11:20", pp: "9/53", ppPct: "16.98", pk: "37/52", pkPct: "71.15" },
  "harfangs-sherbrooke": { rank: 19, gp: 7, w: 2, wReg: 2, wOt: 0, wSo: 0, ties: 1, l: 4, lReg: 3, lOt: 0, lSo: 1, fj: 6, pts: 14, ptsPct: ".500", gf: 18, ga: 25, diff: "-7", gfPerGame: "2.57", gaPerGame: "3.57", pim: 94, pimPerGame: "13:26", pp: "4/18", ppPct: "22.22", pk: "20/23", pkPct: "86.96" },
  "grenadiers-lsl": { rank: 20, gp: 10, w: 1, wReg: 1, wOt: 0, wSo: 0, ties: 1, l: 8, lReg: 7, lOt: 1, lSo: 0, fj: 9, pts: 14, ptsPct: ".350", gf: 18, ga: 42, diff: "-24", gfPerGame: "1.80", gaPerGame: "4.20", pim: 148, pimPerGame: "14:48", pp: "5/38", ppPct: "13.16", pk: "36/44", pkPct: "81.82" },
};
