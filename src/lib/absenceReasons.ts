import type { AbsenceReason } from "./types";

export const ABSENCE_REASON_LABEL: Record<AbsenceReason, string> = {
  malade: "Malade",
  blesse: "Blessé",
  ecole: "École",
  remplacement_m18: "Remplacement M18 AAA",
  non_justifie: "Non justifié",
  suspendu: "Suspendu",
  sans_contact: "Sans contact",
};

export const ABSENCE_REASON_ORDER: AbsenceReason[] = [
  "malade",
  "blesse",
  "ecole",
  "remplacement_m18",
  "non_justifie",
  "suspendu",
  "sans_contact",
];

// Ces raisons ne comptent pas comme des absences "réelles" dans les
// compteurs (une blessure, une suspension ou un rappel M18 AAA n'est pas un
// manquement à l'assiduité — la suspension est suivie à part, en matchs ratés).
export const EXCUSED_REASONS: AbsenceReason[] = ["blesse", "remplacement_m18", "suspendu", "sans_contact"];

// Les jours de match, on ne relève pas les absences ordinaires : on note qui
// rate la partie, et pourquoi.
export const GAME_DAY_REASONS: AbsenceReason[] = ["blesse", "suspendu"];

export const GAME_MISSED_LABEL: Record<"blesse" | "suspendu", string> = {
  blesse: "Blessure",
  suspendu: "Suspension",
};

// Les jours de PRATIQUE, trois états intéressent le coach : le joueur qui
// rate la séance pour blessure, celui qui l'a faite sans contact, et celui
// rappelé par le M18 AAA ce jour-là (absent de notre pratique, mais pas une
// vraie absence).
export const PRACTICE_STATUS_REASONS: AbsenceReason[] = ["blesse", "sans_contact", "remplacement_m18"];

// Pastille posée sur le chandail : le sans-contact reste dans l'alignement, il
// faut donc le distinguer d'un œil.
export const REASON_EMOJI: Partial<Record<AbsenceReason, string>> = {
  blesse: "🩹",
  suspendu: "⛔",
  sans_contact: "🚫",
  remplacement_m18: "⬆️",
};

/** Un joueur « sans contact » est présent : il garde sa place dans l'alignement. */
export function isPresentStatus(reason: AbsenceReason | null): boolean {
  return reason === "sans_contact";
}
