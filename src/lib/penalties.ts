/**
 * Codification des punitions — Hockey Québec, saison 2026-2027.
 *
 * Un code se lit : une LETTRE de sévérité (qui donne les minutes) suivie du
 * NUMÉRO de l'infraction. « A22 » = punition mineure (2 min) pour coup de
 * bâton. Des suffixes précisent le contexte : /S après le sifflet, /G sur le
 * gardien, /NP sur le non-porteur de la rondelle.
 */

export type PenaltySeverity = "A" | "B" | "C" | "D" | "E" | "F";

export const SEVERITY_MINUTES: Record<PenaltySeverity, number> = {
  A: 2, // mineure ou mineure de banc
  B: 5, // majeure
  C: 10, // inconduite
  D: 10, // extrême inconduite / inconduite grossière (expulsion)
  E: 10, // punition de match (expulsion)
  F: 0, // tir de punition — aucune minute
};

export const SEVERITY_LABEL: Record<PenaltySeverity, string> = {
  A: "Mineure",
  B: "Majeure",
  C: "Inconduite",
  D: "Extrême inconduite",
  E: "Punition de match",
  F: "Tir de punition",
};

/** Numéro d'infraction → libellé, tel que publié par la ligue. */
export const INFRACTION_LABEL: Record<number, string> = {
  // Groupe 1 — bagarres
  1: "Agresseur",
  2: "Bagarre",
  3: "Bagarre (1 seul joueur)",
  4: "Instigateur",
  5: "Demeurer sur les lieux d'une bagarre",
  6: "Bagarre secondaire",
  7: "Troisième joueur à intervenir",
  8: "Quitter le banc lors d'une bagarre",
  9: "Gardien quittant son enceinte",
  10: "Saisir cheveux/protecteur facial",
  11: "Saisir et infliger une correction",
  12: "Protecteur facial comme arme",
  13: "Objet sur les mains",
  14: "Enlever son casque pour se battre",
  15: "Chandail non attaché",
  // Groupe 2 — bâton
  22: "Coup de bâton",
  23: "Darder",
  24: "Six pouces",
  25: "Double échec",
  26: "Bâton trop élevé",
  // Groupe 3 — physique
  31: "Assaut",
  32: "Tentative de blesser",
  34: "Donner du coude",
  35: "Donner du genou",
  36: "Coup de patin",
  37: "Coup de tête",
  39: "Mise en échec corporelle",
  40: "Mise en échec par derrière",
  41: "Charge en « T »",
  44: "Donner de la bande",
  47: "Rudesse",
  48: "Contact avec la tête",
  // Groupe 4 — entrave
  50: "Retenir",
  51: "Avoir retenu le bâton",
  52: "Accrocher",
  53: "Faire trébucher",
  54: "Faucher les patins",
  55: "Frapper en bas des hanches",
  56: "Obstruction",
  57: "Obstruction du banc",
  58: "Obstruction sur le gardien",
  // Groupe 5 — comportement
  61: "Conduite antisportive",
  62: "Insultes discriminatoires",
  63: "Manifestation antisportive d'équipe",
  64: "Instigateur d'attroupement",
  66: "Inconduite grossière",
  67: "Allégations — discrimination",
  70: "Comportement irrespectueux",
  72: "Ne pas se rendre au banc des punitions",
  75: "Geste négligent",
  76: "Force physique envers un officiel",
  77: "Menacer de frapper un officiel",
  78: "Agression envers un officiel",
  79: "Cracher",
  // Groupe 6 — autres
  80: "Trop de joueurs sur la patinoire",
  81: "Bâton illégal",
  82: "Demande de mesurage non justifiée",
  83: "Refus de mesurage",
  84: "Équipement protecteur manquant",
  85: "Équipement non certifié",
  86: "Équipement non réglementaire",
  87: "Punition de banc ou d'équipe",
  88: "Deuxième inconduite",
  89: "Tir botté",
  90: "Quitter le banc",
  91: "Lancer son bâton ou un objet",
  92: "Retarder le jeu",
  93: "Déplacer le but",
  95: "Mise au jeu illégale",
  96: "Saisir ou geler la rondelle",
  97: "Refus de se mettre au jeu",
  98: "Quitter le banc en fin de période",
  99: "Divers",
};

const SUFFIX_LABEL: Record<string, string> = {
  S: "après le sifflet",
  G: "sur le gardien",
  NP: "sur le non-porteur",
};

export interface ParsedPenaltyCode {
  raw: string;
  severity: PenaltySeverity | null;
  infraction: number | null;
  minutes: number;
  /** « Mineure — Coup de bâton » */
  label: string;
}

/**
 * Décompose un code de punition. Retourne 0 minute et un libellé brut si le
 * code est illisible : mieux vaut afficher l'inconnu que d'inventer un total.
 */
export function parsePenaltyCode(raw: string): ParsedPenaltyCode {
  const clean = raw.trim().toUpperCase();
  const m = clean.match(/^([A-F])\s*(\d{1,2})(?:\s*\/\s*(S|G|NP))?$/);
  if (!m) {
    return { raw, severity: null, infraction: null, minutes: 0, label: raw };
  }
  const severity = m[1] as PenaltySeverity;
  const infraction = Number(m[2]);
  const suffix = m[3];
  const name = INFRACTION_LABEL[infraction] ?? `Infraction ${infraction}`;
  return {
    raw: clean,
    severity,
    infraction,
    minutes: SEVERITY_MINUTES[severity],
    label: `${SEVERITY_LABEL[severity]} — ${name}${suffix ? ` (${SUFFIX_LABEL[suffix]})` : ""}`,
  };
}

/** Total des minutes de punition d'une liste de codes. */
export function totalPenaltyMinutes(codes: string[]): number {
  return codes.reduce((n, c) => n + parsePenaltyCode(c).minutes, 0);
}
