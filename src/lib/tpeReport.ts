// Rapport de statistiques avancées TPE (portal.tpeteam.com).
//
// Contrairement à la feuille de match officielle (un formulaire PDF, lu champ
// par champ dans gameSheet.ts), ce rapport n'a pas de champs nommés — c'est un
// PDF texte (pas un scan) mis en page librement. Il est lu directement, sans
// IA ni clé API, en reconstituant les tableaux à partir de la position de
// chaque fragment de texte (voir src/lib/tpeReportParser.ts, utilisé par
// src/app/api/advanced-stats/extract/route.ts) — présenté pour relecture
// avant tout enregistrement, comme la feuille de match.
//
// Ce rapport n'est JAMAIS la source des buts/passes (voir la feuille de
// match) ni des attributions de plus/moins d'avant cette fonctionnalité :
// il fournit le temps de jeu, les tirs, les mises au jeu, le xG individuel et
// d'équipe, et le +/- (calculé par TPE lui-même à partir des présences sur
// glace, plus fiable qu'une lecture manuscrite).

export interface TpePlayerLine {
  jersey: number;
  sheetName: string;
  toiSeconds: number | null;
  shotsOnGoal: number | null;
  faceoffsWon: number | null;
  faceoffsLost: number | null;
  plusMinus: number | null;
  onIceXgFor: number | null;
  onIceXgAgainst: number | null;
  onIceXgForPer20: number | null;
  onIceXgAgainstPer20: number | null;
  xg: number | null;
  xgPer20: number | null;
}

export interface TpeShotsLine {
  shotAttempts: number;
  shotsOnGoal: number;
  goals: number;
}

const ZERO_SHOTS: TpeShotsLine = { shotAttempts: 0, shotsOnGoal: 0, goals: 0 };

export interface TpeShotsBreakdown {
  us: Record<"total" | "p1" | "p2" | "p3" | "pp" | "pk" | "even", TpeShotsLine>;
  opponent: Record<"total" | "p1" | "p2" | "p3" | "pp" | "pk" | "even", TpeShotsLine>;
}

export interface TpeFaceoffLine {
  won: number;
  lost: number;
}

const ZERO_FACEOFF: TpeFaceoffLine = { won: 0, lost: 0 };

export interface TpeFaceoffBreakdown {
  total: TpeFaceoffLine;
  p1: TpeFaceoffLine;
  p2: TpeFaceoffLine;
  p3: TpeFaceoffLine;
  pp: TpeFaceoffLine;
  pk: TpeFaceoffLine;
  even: TpeFaceoffLine;
  dz: TpeFaceoffLine;
  nz: TpeFaceoffLine;
  oz: TpeFaceoffLine;
}

/**
 * Les 9 ronds de mise au jeu du diagramme « Face-Offs by zones » du rapport —
 * une reproduction du schéma de patinoire, pas un agrégat par grande zone
 * (voir TpeFaceoffBreakdown.dz/nz/oz pour ça). Nommés par position sur la
 * patinoire, de notre zone défensive vers la zone offensive :
 *  dz     = zone défensive (2 ronds, haut/bas)
 *  nzDef  = zone neutre, côté défensif (2 ronds)
 *  center = mise au jeu du centre de la patinoire (1 seul rond)
 *  nzOff  = zone neutre, côté offensif (2 ronds)
 *  oz     = zone offensive (2 ronds, haut/bas)
 */
export interface TpeFaceoffZoneGrid {
  dzTop: TpeFaceoffLine;
  dzBottom: TpeFaceoffLine;
  nzDefTop: TpeFaceoffLine;
  nzDefBottom: TpeFaceoffLine;
  center: TpeFaceoffLine;
  nzOffTop: TpeFaceoffLine;
  nzOffBottom: TpeFaceoffLine;
  ozTop: TpeFaceoffLine;
  ozBottom: TpeFaceoffLine;
}

export interface ParsedAdvancedReport {
  /** Nom d'équipe tel qu'inscrit sur le rapport, côté As de Québec — pour affichage seulement. */
  ourTeamName: string | null;
  opponentName: string | null;
  players: TpePlayerLine[];
  shots: TpeShotsBreakdown | null;
  faceoffs: TpeFaceoffBreakdown | null;
  faceoffZones: TpeFaceoffZoneGrid | null;
  teamXgUs: number | null;
  teamXgOpponent: number | null;
  warnings: string[];
}

export function emptyShotsBreakdown(): TpeShotsBreakdown {
  return {
    us: { total: { ...ZERO_SHOTS }, p1: { ...ZERO_SHOTS }, p2: { ...ZERO_SHOTS }, p3: { ...ZERO_SHOTS }, pp: { ...ZERO_SHOTS }, pk: { ...ZERO_SHOTS }, even: { ...ZERO_SHOTS } },
    opponent: { total: { ...ZERO_SHOTS }, p1: { ...ZERO_SHOTS }, p2: { ...ZERO_SHOTS }, p3: { ...ZERO_SHOTS }, pp: { ...ZERO_SHOTS }, pk: { ...ZERO_SHOTS }, even: { ...ZERO_SHOTS } },
  };
}

const ZONE_GRID_KEYS: (keyof TpeFaceoffZoneGrid)[] = [
  "dzTop",
  "dzBottom",
  "nzDefTop",
  "nzDefBottom",
  "center",
  "nzOffTop",
  "nzOffBottom",
  "ozTop",
  "ozBottom",
];

export function emptyFaceoffZoneGrid(): TpeFaceoffZoneGrid {
  return Object.fromEntries(ZONE_GRID_KEYS.map((k) => [k, { ...ZERO_FACEOFF }])) as unknown as TpeFaceoffZoneGrid;
}

/** Additionne les 9 ronds de plusieurs matchs — pour un cumul sur la saison ou un filtre. */
export function sumFaceoffZoneGrids(grids: TpeFaceoffZoneGrid[]): TpeFaceoffZoneGrid {
  const sum = emptyFaceoffZoneGrid();
  for (const g of grids) {
    for (const k of ZONE_GRID_KEYS) {
      sum[k] = { won: sum[k].won + g[k].won, lost: sum[k].lost + g[k].lost };
    }
  }
  return sum;
}

export function emptyFaceoffBreakdown(): TpeFaceoffBreakdown {
  return {
    total: { ...ZERO_FACEOFF }, p1: { ...ZERO_FACEOFF }, p2: { ...ZERO_FACEOFF }, p3: { ...ZERO_FACEOFF },
    pp: { ...ZERO_FACEOFF }, pk: { ...ZERO_FACEOFF }, even: { ...ZERO_FACEOFF },
    dz: { ...ZERO_FACEOFF }, nz: { ...ZERO_FACEOFF }, oz: { ...ZERO_FACEOFF },
  };
}

/** "22:24" → 1344 (secondes). */
export function toiToSeconds(mmss: string | null | undefined): number | null {
  const m = mmss?.match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 1344 → "22:24". */
export function secondsToToi(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Moyenne de temps de jeu, formatée — ignore les matchs sans donnée. */
export function averageToi(seconds: (number | null)[]): string {
  const valid = seconds.filter((s): s is number => s != null);
  if (valid.length === 0) return "—";
  return secondsToToi(valid.reduce((a, b) => a + b, 0) / valid.length);
}

/** Pourcentage de tirs transformés en buts — "—" si aucun tir. */
export function shootingPct(goals: number, shots: number): string {
  if (shots <= 0) return "—";
  return `${((goals / shots) * 100).toFixed(1)}%`;
}

/** « +3 », « -2 », « 0 » — le signe est ce qu'on lit en premier. */
export function formatNet(net: number): string {
  return net > 0 ? `+${net}` : String(net);
}
