import { eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { escapeHtml } from "@/lib/emailTemplate";
import type { EventType, Game, ScheduleEvent } from "@/lib/types";

const PRIORITY: EventType[] = ["game", "practice", "team_meeting", "pp_meeting", "team_building", "individual_meeting", "other"];

export function primaryEvent(events: ScheduleEvent[]): ScheduleEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => PRIORITY.indexOf(a.event_type) - PRIORITY.indexOf(b.event_type))[0];
}

const HOLIDAY_LABELS: { keyword: string; label: string }[] = [
  { keyword: "pedago", label: "Pédago" },
  { keyword: "ferie", label: "Férié" },
  { keyword: "fete", label: "Fête" },
  { keyword: "conge", label: "Congé" },
];

export function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function holidayLabel(title: string): string | null {
  const normalized = stripAccents(title);
  return HOLIDAY_LABELS.find((h) => normalized.includes(h.keyword))?.label ?? null;
}

export function isHoliday(title: string) {
  return holidayLabel(title) !== null;
}

// L'export s'adresse aux joueurs et aux parents. Trois choses n'y figurent pas :
//  - les pratiques régulières, implicites (la case dit « Encadrement Sport-Études ») ;
//  - les tâches internes à l'équipe (ménage du gym, Team Building) ;
//  - les rencontres d'équipe et individuelles, qui relèvent du staff.
// Tout le reste garde son nom : Multisport, Challenge, match intra-équipe, etc.
const SILENT_EVENT_TYPES = new Set<EventType>(["team_meeting", "individual_meeting", "pp_meeting", "team_building"]);
const SILENT_EXACT = new Set(["pratique", "training"]);
const SILENT_KEYWORDS = ["menage", "meeting"];

export function isSilentActivity(event: ScheduleEvent): boolean {
  if (SILENT_EVENT_TYPES.has(event.event_type)) return true;
  const title = stripAccents(event.title).trim();
  return SILENT_EXACT.has(title) || SILENT_KEYWORDS.some((k) => title.includes(k));
}

// Ce qu'on écrit dans la case sous la date. On saute les pratiques et trainings
// (implicites), mais on garde les activités nommées d'une journée de pratique.
export function labelEvent(events: ScheduleEvent[]): ScheduleEvent | null {
  return events.find((e) => e.event_type !== "game" && !isSilentActivity(e)) ?? null;
}

// Une journée de fin de semaine sans match ni activité d'équipe est un congé,
// au même titre qu'un congé scolaire ou une journée pédagogique.
export function isFreeWeekend(day: Date, events: ScheduleEvent[], game: Game | undefined): boolean {
  const dow = getDay(day);
  const isWeekend = dow === 0 || dow === 6;
  if (!isWeekend || game) return false;
  return events.every((e) => e.event_type !== "game" && isHoliday(e.title));
}

export type CellKind = "highlight" | "freeWeekend" | "gameHome" | "gameAway" | "holiday" | "event" | "empty";

/** Jaune = match domicile, gris = match extérieur, vert = congé/férié/pédago, rouge = changement majeur. */
export function cellKind(
  primary: ScheduleEvent | null,
  label: ScheduleEvent | null,
  game: Game | undefined,
  freeWeekend: boolean,
  highlighted: boolean
): CellKind {
  if (highlighted) return "highlight";
  if (freeWeekend) return "freeWeekend";
  if (primary?.event_type === "game") return game?.is_home === false ? "gameAway" : "gameHome";
  if (label && isHoliday(label.title)) return "holiday";
  return primary ? "event" : "empty";
}

const KIND_HEX: Record<CellKind, string> = {
  highlight: "#fca5a5",
  freeWeekend: "#bbf7d0",
  gameHome: "#fde68a",
  gameAway: "#cbd5e1",
  holiday: "#bbf7d0",
  event: "#f1f5f9",
  empty: "#ffffff",
};

export interface CalendarEmailInput {
  month: Date;
  events: ScheduleEvent[];
  games: Game[];
  dayNotes: Record<string, string>;
  highlights: Record<string, boolean>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Le calendrier mensuel en HTML « courriel » : tableaux et styles en ligne, qui
 * survivent à Gmail, Outlook et Apple Mail. Mêmes règles que l'export imprimable
 * (activités internes cachées, couleurs, notes du jour).
 */
export function buildCalendarEmailHtml({ month, events, games, dayNotes, highlights }: CalendarEmailInput): string {
  const eventsByDay = new Map<string, ScheduleEvent[]>();
  for (const e of events) {
    const list = eventsByDay.get(e.event_date) ?? [];
    list.push(e);
    eventsByDay.set(e.event_date, list);
  }
  const gameByDate = new Map(games.map((g) => [g.game_date, g]));
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  const cells = days.map((day) => {
    const key = format(day, "yyyy-MM-dd");
    const dayEvents = eventsByDay.get(key) ?? [];
    const inMonth = isSameMonth(day, month);
    const game = gameByDate.get(key);
    const primary = game
      ? (dayEvents.find((e) => e.event_type === "game") ?? ({ event_type: "game" } as ScheduleEvent))
      : primaryEvent(dayEvents);
    const freeWeekend = inMonth && isFreeWeekend(day, dayEvents, game);
    const label = labelEvent(dayEvents);
    const holiday = label ? holidayLabel(label.title) : null;
    const isWeekday = getDay(day) >= 1 && getDay(day) <= 5;
    const showEncadrement = inMonth && isWeekday && !holiday && !freeWeekend;
    const kind = cellKind(primary, label, game, freeWeekend, inMonth && (highlights[key] ?? false));

    const lines: string[] = [];
    if (inMonth) {
      if (showEncadrement) lines.push(`<div style="font-size:9px;font-style:italic;color:#475569;">Encadrement Sport-Études</div>`);
      if (primary?.event_type === "game" && game) {
        const opp = findTeamByOpponent(game.opponent)?.name ?? game.opponent;
        lines.push(`<div style="font-weight:800;">${game.is_home ? "Domicile" : "Visiteur"}</div>`);
        lines.push(`<div style="font-weight:700;">${escapeHtml(opp)}</div>`);
        if (primary.start_time) lines.push(`<div style="font-weight:700;">${primary.start_time.slice(0, 5)}</div>`);
        if (game.location) lines.push(`<div style="font-size:10px;">${escapeHtml(game.location)}</div>`);
        if (!game.is_home && game.bus_departure_time) {
          lines.push(`<div style="font-size:9px;font-weight:600;">🚌 Départ de Québec ${game.bus_departure_time.slice(0, 5)}</div>`);
        }
      }
      if (freeWeekend) lines.push(`<div style="font-weight:800;">Congé</div>`);
      else if (label) lines.push(`<div style="font-weight:800;">${escapeHtml(holiday ?? label.title)}</div>`);
      const note = dayNotes[key]?.trim();
      if (note) lines.push(`<div style="font-size:10px;font-weight:600;margin-top:2px;">${escapeHtml(note).replace(/\n/g, "<br>")}</div>`);
    }

    const bg = inMonth ? KIND_HEX[kind] : "#f8fafc";
    const color = inMonth ? "#1a1a1a" : "#cbd5e1";
    return `<td valign="top" style="background:${bg};color:${color};border:1px solid #e2e8f0;padding:4px;height:84px;width:14.28%;font-size:11px;line-height:1.25;text-align:center;">
<div style="text-align:left;font-weight:800;font-size:12px;">${format(day, "d")}</div>${lines.join("")}</td>`;
  });

  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);

  const head = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
    .map((d) => `<th style="background:#0d0c0c;color:#fdca37;padding:5px 0;font-size:12px;border:1px solid #0d0c0c;">${d}</th>`)
    .join("");

  return `<div style="max-width:720px;">
<div style="background:#0d0c0c;color:#fdca37;padding:12px 14px;font-size:18px;font-weight:800;border-radius:6px 6px 0 0;">As de Québec M17 AAA — ${cap(format(month, "MMMM yyyy", { locale: fr }))}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;font-family:Arial,Helvetica,sans-serif;">
<tr>${head}</tr>
${rows.join("\n")}
</table>
</div>`;
}
