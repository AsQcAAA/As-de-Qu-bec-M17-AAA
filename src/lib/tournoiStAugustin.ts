/**
 * Challenge M17 AAA St-Augustin (5-8 novembre 2026) — tableau du tournoi, d'après le PDF
 * « TE22F1 M17 Quebec 20261013 M ». Seul le calendrier est ici : les pointages sont
 * saisis dans la table tournament_results (voir migration 049).
 *
 * Chaque case est soit une équipe (première ronde), soit « gagnant / perdant du match n ».
 * Note : le PDF imprime le match 32 comme « Perdant 22 contre Gagnant 21 » (Gagnant 21
 * y figurerait deux fois, Perdant 21 jamais). Le tableau a été lu comme « Perdant 21
 * contre Perdant 22 », seule lecture cohérente ; à confirmer avec les premiers résultats.
 */
export const TOURNAMENT_SLUG = "st-augustin-2026";
export const TOURNAMENT_TITLE = "Challenge M17 AAA St-Augustin";
export const TOURNAMENT_VENUE = "Complexe sportif Saint-Augustin-de-Desmaures";
export const TOURNAMENT_DATES = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
/** Nom de notre équipe tel qu'écrit dans le tableau. */
export const OUR_TEAM = "AS QUÉBEC";

export type TournamentSlot = { team: string } | { from: number; kind: "W" | "L" };

export interface TournamentGame {
  no: number;
  date: string;
  time: string;
  rink: string;
  a: TournamentSlot;
  b: TournamentSlot;
}

/** Équipe du tableau → équipe de la ligue (logo, nom). Les équipes Québec n'en ont pas. */
export const TOURNAMENT_TEAM_SLUG: Record<string, string | null> = {
  "AS QUÉBEC": "as-de-quebec",
  "PIONNIERS LANAUDIÈRE": "pionniers-lan",
  "PICHÉ": "piche",
  "CONQUÉRANTS": "conquerants-bl",
  "GAULOIS RICHELIEU": "gaulois-ric",
  "SÉLECTS DU NORD": "select-du-nord",
  "HARFANGS SHERBROOKE": "harfangs-sherbrooke",
  "CITADELLES": "citadelles-rn",
  "ESTACADES MAURICIE": "estacades-mauricie",
  "GRENADIERS LAC ST-LOUIS": "grenadiers-lsl",
  "ALBATROS": "albatros",
  "ROUSSEAU ROYAL": "rousseau-royal-lav-mtl",
  "CORSAIRES POINTE-LÉVY": "corsaires-pointe-levy",
  "LIONS LAC ST-LOUIS": "lions-lsl",
  "ESPOIR SAGUENAY LAC": "espoirs-sag-lsj",
  "DYNAMIQUES CCL": "dynamiques-ccl",
  "CANAM BEAUCE-APPALACHES": "canam-ba",
  "SENATEURS DE L'OUTAOUAIS": "senateurs-out",
  "SEIGNEURS DES MILLE-ILES": "seigneurs-mi",
  "BLIZZARD SSF": "blizzard-ssf",
  "ÉQUIPE QUÉBEC BLANC": null,
  "ÉQUIPE QUÉBEC NOIR": null,
};

export const TOURNAMENT_GAMES: TournamentGame[] = [
  { no: 1, date: "2026-11-05", time: "08:00", rink: "CSSAD A", a: { team: "AS QUÉBEC" }, b: { team: "PIONNIERS LANAUDIÈRE" } },
  { no: 2, date: "2026-11-05", time: "09:00", rink: "CSSAD B", a: { team: "PICHÉ" }, b: { team: "CONQUÉRANTS" } },
  { no: 3, date: "2026-11-05", time: "09:40", rink: "CSSAD A", a: { team: "GAULOIS RICHELIEU" }, b: { team: "SÉLECTS DU NORD" } },
  { no: 4, date: "2026-11-05", time: "10:40", rink: "CSSAD B", a: { team: "HARFANGS SHERBROOKE" }, b: { team: "CITADELLES" } },
  { no: 5, date: "2026-11-05", time: "11:20", rink: "CSSAD A", a: { team: "ESTACADES MAURICIE" }, b: { team: "GRENADIERS LAC ST-LOUIS" } },
  { no: 6, date: "2026-11-05", time: "12:20", rink: "CSSAD B", a: { team: "ALBATROS" }, b: { team: "ROUSSEAU ROYAL" } },
  { no: 7, date: "2026-11-05", time: "13:00", rink: "CSSAD A", a: { team: "CORSAIRES POINTE-LÉVY" }, b: { team: "LIONS LAC ST-LOUIS" } },
  { no: 8, date: "2026-11-05", time: "14:00", rink: "CSSAD B", a: { team: "ESPOIR SAGUENAY LAC" }, b: { team: "DYNAMIQUES CCL" } },
  { no: 9, date: "2026-11-05", time: "14:40", rink: "CSSAD A", a: { team: "CANAM BEAUCE-APPALACHES" }, b: { team: "SENATEURS DE L'OUTAOUAIS" } },
  { no: 10, date: "2026-11-05", time: "16:10", rink: "CSSAD B", a: { team: "ÉQUIPE QUÉBEC BLANC" }, b: { team: "ÉQUIPE QUÉBEC NOIR" } },
  { no: 11, date: "2026-11-05", time: "17:00", rink: "CSSAD A", a: { team: "SEIGNEURS DES MILLE-ILES" }, b: { team: "BLIZZARD SSF" } },
  { no: 12, date: "2026-11-06", time: "09:00", rink: "CSSAD B", a: { from: 1, kind: "L" }, b: { from: 11, kind: "W" } },
  { no: 13, date: "2026-11-06", time: "08:00", rink: "CSSAD A", a: { from: 2, kind: "L" }, b: { from: 9, kind: "W" } },
  { no: 14, date: "2026-11-06", time: "10:40", rink: "CSSAD B", a: { from: 3, kind: "L" }, b: { from: 6, kind: "W" } },
  { no: 15, date: "2026-11-06", time: "12:20", rink: "CSSAD B", a: { from: 10, kind: "L" }, b: { from: 8, kind: "W" } },
  { no: 16, date: "2026-11-05", time: "20:20", rink: "CSSAD A", a: { from: 7, kind: "L" }, b: { from: 8, kind: "L" } },
  { no: 17, date: "2026-11-05", time: "18:00", rink: "CSSAD B", a: { from: 4, kind: "L" }, b: { from: 1, kind: "W" } },
  { no: 18, date: "2026-11-05", time: "18:40", rink: "CSSAD A", a: { from: 5, kind: "L" }, b: { from: 2, kind: "W" } },
  { no: 19, date: "2026-11-05", time: "19:40", rink: "CSSAD B", a: { from: 6, kind: "L" }, b: { from: 3, kind: "W" } },
  { no: 20, date: "2026-11-06", time: "13:00", rink: "CSSAD A", a: { from: 4, kind: "W" }, b: { from: 7, kind: "W" } },
  { no: 21, date: "2026-11-06", time: "09:40", rink: "CSSAD A", a: { from: 9, kind: "L" }, b: { from: 5, kind: "W" } },
  { no: 22, date: "2026-11-06", time: "11:20", rink: "CSSAD A", a: { from: 11, kind: "L" }, b: { from: 10, kind: "W" } },
  { no: 23, date: "2026-11-07", time: "11:40", rink: "HS-SSF", a: { from: 12, kind: "L" }, b: { from: 13, kind: "W" } },
  { no: 24, date: "2026-11-06", time: "19:30", rink: "CSSAD B", a: { from: 13, kind: "L" }, b: { from: 12, kind: "W" } },
  { no: 25, date: "2026-11-07", time: "12:20", rink: "CSSAD A", a: { from: 14, kind: "L" }, b: { from: 15, kind: "W" } },
  { no: 26, date: "2026-11-06", time: "20:20", rink: "CSSAD A", a: { from: 15, kind: "L" }, b: { from: 14, kind: "W" } },
  { no: 27, date: "2026-11-06", time: "14:00", rink: "CSSAD B", a: { from: 16, kind: "L" }, b: { from: 17, kind: "W" } },
  { no: 28, date: "2026-11-06", time: "14:40", rink: "CSSAD A", a: { from: 17, kind: "L" }, b: { from: 16, kind: "W" } },
  { no: 29, date: "2026-11-06", time: "16:10", rink: "CSSAD B", a: { from: 18, kind: "L" }, b: { from: 19, kind: "W" } },
  { no: 30, date: "2026-11-06", time: "17:00", rink: "CSSAD A", a: { from: 19, kind: "L" }, b: { from: 18, kind: "W" } },
  { no: 31, date: "2026-11-06", time: "17:50", rink: "CSSAD B", a: { from: 21, kind: "W" }, b: { from: 22, kind: "W" } },
  { no: 32, date: "2026-11-06", time: "18:40", rink: "CSSAD A", a: { from: 21, kind: "L" }, b: { from: 22, kind: "L" } },
  { no: 33, date: "2026-11-07", time: "18:40", rink: "CSSAD A", a: { from: 23, kind: "W" }, b: { from: 25, kind: "W" } },
  { no: 34, date: "2026-11-07", time: "16:30", rink: "CSSAD B", a: { from: 24, kind: "W" }, b: { from: 26, kind: "W" } },
  { no: 35, date: "2026-11-07", time: "09:00", rink: "CSSAD A", a: { from: 27, kind: "W" }, b: { from: 29, kind: "W" } },
  { no: 36, date: "2026-11-07", time: "08:30", rink: "HS-SSF", a: { from: 28, kind: "W" }, b: { from: 30, kind: "W" } },
  { no: 37, date: "2026-11-07", time: "10:40", rink: "CSSAD A", a: { from: 20, kind: "L" }, b: { from: 31, kind: "W" } },
  { no: 38, date: "2026-11-07", time: "10:10", rink: "HS-SSF", a: { from: 20, kind: "W" }, b: { from: 32, kind: "W" } },
  { no: 39, date: "2026-11-07", time: "17:00", rink: "CSSAD A", a: { from: 35, kind: "W" }, b: { from: 37, kind: "W" } },
  { no: 40, date: "2026-11-07", time: "18:10", rink: "CSSAD B", a: { from: 36, kind: "W" }, b: { from: 38, kind: "W" } },
  { no: 41, date: "2026-11-08", time: "08:50", rink: "CSSAD A", a: { from: 33, kind: "W" }, b: { from: 39, kind: "W" } },
  { no: 42, date: "2026-11-08", time: "09:20", rink: "CSSAD B", a: { from: 34, kind: "W" }, b: { from: 40, kind: "W" } },
  { no: 43, date: "2026-11-08", time: "15:00", rink: "CSSAD A", a: { from: 41, kind: "W" }, b: { from: 42, kind: "W" } },
];
