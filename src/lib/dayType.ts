import { getDay, parseISO } from "date-fns";
import type { ScheduleEvent } from "./types";

// Mêmes mots-clés que le calendrier (voir calendrier/page.tsx) : congé, férié,
// fête ou journée pédagogique, peu importe le libellé exact de l'évènement.
const DAY_OFF_KEYWORDS = ["pedago", "ferie", "fete", "conge"];

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Les vendredis sont fixes dans l'horaire de l'équipe : jamais de pratique ni
// d'alignement ce jour-là.
export function isNoPracticeDay(dateStr: string): boolean {
  return getDay(parseISO(dateStr)) === 5; // date-fns : 0 = dimanche, 5 = vendredi
}

// Vrai si un congé, jour férié, fête ou journée pédagogique est inscrit à
// l'horaire ce jour-là — dans ce cas, pas de rapport, d'alignement ni
// d'horaire à voir/remplir.
export function isDayOff(events: Pick<ScheduleEvent, "event_type" | "title">[]): boolean {
  return events.some(
    (e) => e.event_type === "other" && DAY_OFF_KEYWORDS.some((k) => stripAccents((e.title ?? "").toLowerCase()).includes(k))
  );
}
