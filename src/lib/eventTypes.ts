import type { EventType } from "./types";

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  game: "Match",
  practice: "Pratique",
  team_meeting: "Team Meeting",
  individual_meeting: "Meeting individuel",
  team_building: "Team Building",
  pp_meeting: "PP Meeting",
  training: "Training",
  other: "Autre",
  reminder: "Rappel",
};

export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  game: "bg-red-100 text-red-800",
  practice: "bg-blue-100 text-blue-800",
  team_meeting: "bg-purple-100 text-purple-800",
  individual_meeting: "bg-pink-100 text-pink-800",
  team_building: "bg-emerald-100 text-emerald-800",
  pp_meeting: "bg-amber-100 text-amber-800",
  training: "bg-cyan-100 text-cyan-800",
  other: "bg-slate-200 text-slate-700",
  reminder: "bg-red-100 text-red-800",
};

// Couleurs pleines (pour remplir toute une case de calendrier, contraste
// texte blanc/foncé selon la teinte) plutôt que les badges pastel ci-dessus.
export const EVENT_TYPE_SOLID_COLOR: Record<EventType, string> = {
  game: "bg-red-500 text-white",
  practice: "bg-blue-500 text-white",
  team_meeting: "bg-purple-500 text-white",
  individual_meeting: "bg-pink-500 text-white",
  team_building: "bg-emerald-500 text-white",
  pp_meeting: "bg-amber-400 text-ink-900",
  training: "bg-cyan-500 text-white",
  other: "bg-slate-400 text-white",
  reminder: "bg-red-500 text-white",
};

export const EVENT_TYPE_ORDER: EventType[] = [
  "practice",
  "game",
  "team_meeting",
  "individual_meeting",
  "team_building",
  "pp_meeting",
  "training",
  "other",
  "reminder",
];

/**
 * Les meetings sont les seuls évènements dont le lieu vaut la peine d'être
 * annoncé : ils changent de salle. La pratique et le training ont toujours
 * lieu au même endroit — écrire « (M-S Gym) » ou « (M-S Glace 1) » n'apprenait
 * rien et alourdissait l'horaire.
 */
export const MEETING_TYPES: EventType[] = ["team_meeting", "pp_meeting", "individual_meeting"];

export function showsLocation(type: EventType) {
  return MEETING_TYPES.includes(type);
}
