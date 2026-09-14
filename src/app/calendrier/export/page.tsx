"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import type { EventType, Game, ScheduleEvent } from "@/lib/types";
import { printWithOrientation } from "@/lib/print";

const PRIORITY: EventType[] = ["game", "practice", "team_meeting", "pp_meeting", "team_building", "individual_meeting", "other"];

function primaryEvent(events: ScheduleEvent[]): ScheduleEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => PRIORITY.indexOf(a.event_type) - PRIORITY.indexOf(b.event_type))[0];
}

const HOLIDAY_LABELS: { keyword: string; label: string }[] = [
  { keyword: "pedago", label: "P\u00e9dago" },
  { keyword: "ferie", label: "F\u00e9ri\u00e9" },
  { keyword: "fete", label: "F\u00eate" },
  { keyword: "conge", label: "Cong\u00e9" },
];

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function holidayLabel(title: string): string | null {
  const normalized = stripAccents(title);
  return HOLIDAY_LABELS.find((h) => normalized.includes(h.keyword))?.label ?? null;
}

function isHoliday(title: string) {
  return holidayLabel(title) !== null;
}

// L'export s'adresse aux joueurs et aux parents. Trois choses n'y figurent pas :
//  - les pratiques régulières, implicites (la case dit « Encadrement Sport-Études ») ;
//  - les tâches internes à l'équipe, comme le ménage du gym ;
//  - les rencontres d'équipe et individuelles, qui relèvent du staff.
// Tout le reste garde son nom : Multisport, Challenge, match intra-équipe, etc.
const SILENT_EVENT_TYPES = new Set<EventType>(["team_meeting", "individual_meeting", "pp_meeting"]);
const SILENT_EXACT = new Set(["pratique", "training"]);
const SILENT_KEYWORDS = ["menage", "meeting"];

function isSilentActivity(event: ScheduleEvent): boolean {
  if (SILENT_EVENT_TYPES.has(event.event_type)) return true;
  const title = stripAccents(event.title).trim();
  return SILENT_EXACT.has(title) || SILENT_KEYWORDS.some((k) => title.includes(k));
}

// Ce qu'on écrit dans la case sous la date. On saute les pratiques et trainings
// (implicites), mais on garde les activités nommées d'une journée de pratique —
// « Ménage du Gym », par exemple, ne doit pas disparaître.
function labelEvent(events: ScheduleEvent[]): ScheduleEvent | null {
  return events.find((e) => e.event_type !== "game" && !isSilentActivity(e)) ?? null;
}

// Une journée de fin de semaine sans match ni activité d'équipe est un congé,
// au même titre qu'un congé scolaire ou une journée pédagogique.
function isFreeWeekend(day: Date, events: ScheduleEvent[], game: Game | undefined): boolean {
  const dow = getDay(day);
  const isWeekend = dow === 0 || dow === 6;
  if (!isWeekend || game) return false;
  return events.every((e) => e.event_type !== "game" && isHoliday(e.title));
}

// Même logique de couleur que le calendrier principal : jaune = match domicile,
// gris = match extérieur, vert = congé/férié/pédago/fête et fins de semaine libres.
function cellColor(
  primary: ScheduleEvent | null,
  label: ScheduleEvent | null,
  game: Game | undefined,
  freeWeekend: boolean,
  highlighted: boolean
): string {
  // Un changement majeur signalé à la main prime sur toute autre couleur.
  if (highlighted) return "bg-red-300";
  if (freeWeekend) return "bg-green-200";
  if (primary?.event_type === "game") {
    return game?.is_home === false ? "bg-slate-300" : "bg-gold-300";
  }
  if (label && isHoliday(label.title)) return "bg-green-200";
  return primary ? "bg-slate-100" : "";
}

export default function CalendrierExportPage() {
  const supabase = createClient();
  const [month, setMonth] = useState(new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});
  const [highlights, setHighlights] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const from = format(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const to = format(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const [{ data: evts }, { data: gms }, { data: notes }] = await Promise.all([
      supabase.from("schedule_events").select("*").gte("event_date", from).lte("event_date", to),
      supabase.from("games").select("*").gte("game_date", from).lte("game_date", to),
      supabase.from("calendar_day_notes").select("*").gte("day", from).lte("day", to),
    ]);
    setEvents(evts ?? []);
    setGames(gms ?? []);
    setDayNotes(Object.fromEntries((notes ?? []).map((n) => [n.day, n.notes ?? ""])));
    setHighlights(Object.fromEntries((notes ?? []).map((n) => [n.day, n.highlight ?? false])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function saveDayNote(day: string) {
    await supabase
      .from("calendar_day_notes")
      .upsert({ day, notes: dayNotes[day] ?? "", highlight: highlights[day] ?? false }, { onConflict: "day" });
  }

  /** Marque/démarque une journée comme « changement majeur » (case rouge). */
  async function toggleHighlight(day: string) {
    const next = !(highlights[day] ?? false);
    setHighlights((prev) => ({ ...prev, [day]: next }));
    await supabase
      .from("calendar_day_notes")
      .upsert({ day, notes: dayNotes[day] ?? "", highlight: next }, { onConflict: "day" });
  }

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const list = map.get(e.event_date) ?? [];
      list.push(e);
      map.set(e.event_date, list);
    }
    return map;
  }, [events]);

  const gameByDate = useMemo(() => new Map(games.map((g) => [g.game_date, g])), [games]);

  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Export mensuel — Calendrier</h1>
          <p className="text-slate-400 text-sm">À envoyer aux joueurs/parents. Ajoute des notes par jour, puis exporte en PDF.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setMonth(subMonths(month, 1))}>
            ← Précédent
          </button>
          <span className="btn-dark capitalize">{format(month, "MMMM yyyy", { locale: fr })}</span>
          <button className="btn-secondary" onClick={() => setMonth(addMonths(month, 1))}>
            Suivant →
          </button>
          <button className="btn" onClick={() => printWithOrientation("landscape", "8mm")}>
            🖨️ Exporter en PDF
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : (
        <div className="print-card bg-white text-ink-900 rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h2 className="text-xl font-bold capitalize text-center">As de Québec M17 AAA — {format(month, "MMMM yyyy", { locale: fr })}</h2>

          <div className="cal-headers grid grid-cols-7 gap-1 text-center text-sm font-bold text-slate-700">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              const game = gameByDate.get(key);
              // Un match l'emporte toujours, même sans case "game" dans l'horaire
              // du jour (ex. seulement des meetings créés à la main ce jour-là).
              const primary = game
                ? (dayEvents.find((e) => e.event_type === "game") ?? {
                    id: `game-${key}`,
                    event_date: key,
                    event_type: "game" as const,
                    title: "Match",
                    start_time: null,
                    end_time: null,
                    location: null,
                    notes: null,
                  })
                : primaryEvent(dayEvents);
              const opponentTeam = game ? findTeamByOpponent(game.opponent) : undefined;
              const isWeekday = getDay(day) >= 1 && getDay(day) <= 5;
              const freeWeekend = inMonth && isFreeWeekend(day, dayEvents, game);
              const label = labelEvent(dayEvents);
              const holiday = label ? holidayLabel(label.title) : null;
              // Pas d'encadrement scolaire les jours de congé ou de pédago :
              // l'école est fermée ces journées-là.
              const showEncadrement = inMonth && isWeekday && !holiday && !freeWeekend;
              const highlighted = inMonth && (highlights[key] ?? false);
              return (
                <div
                  key={key}
                  className={`cal-cell relative flex flex-col h-[138px] overflow-hidden rounded-md border p-1 text-[11px] font-semibold text-center ${cellColor(primary, label, game, freeWeekend, highlighted)} ${
                    highlighted ? "border-red-500" : inMonth ? "border-slate-200" : "border-slate-100 opacity-40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="cal-date font-extrabold text-sm leading-none">{format(day, "d")}</span>
                    {inMonth && (
                      <button
                        type="button"
                        onClick={() => toggleHighlight(key)}
                        title={highlighted ? "Retirer le changement majeur" : "Marquer un changement majeur"}
                        aria-pressed={highlighted}
                        className={`no-print shrink-0 h-3.5 w-3.5 rounded-full border transition-colors ${
                          highlighted
                            ? "bg-red-600 border-red-700"
                            : "bg-white/70 border-slate-400 hover:bg-red-200 hover:border-red-500"
                        }`}
                      />
                    )}
                  </div>
                  {showEncadrement && (
                    <div className="cal-sub text-[10px] italic font-semibold text-slate-700 leading-tight">Encadrement Sport-Études</div>
                  )}
                  {primary && primary.event_type === "game" && game && (
                    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-0.5 text-center">
                      {opponentTeam && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={opponentTeam.logo} alt={opponentTeam.name} className="cal-logo h-9 w-9 object-contain mix-blend-multiply" />
                      )}
                      <div className="cal-label font-extrabold leading-tight">{game.is_home ? "Domicile" : "Visiteur"}</div>
                      {primary.start_time && <div className="cal-label font-bold leading-tight">{primary.start_time.slice(0, 5)}</div>}
                      {game.location && <div className="cal-label font-bold leading-tight">{game.location}</div>}
                    </div>
                  )}
                  {freeWeekend && inMonth && (
                    <div className="cal-label flex-1 min-h-0 flex items-center justify-center text-center font-extrabold leading-tight">
                      Congé
                    </div>
                  )}
                  {!freeWeekend && label && (
                    <div className="cal-label flex-1 min-h-0 flex items-center justify-center text-center font-extrabold leading-tight">
                      {holiday ?? label.title}
                    </div>
                  )}
                  {inMonth && (
                    <textarea
                      className="cal-note mt-auto w-full text-[10px] font-semibold text-center border-0 bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-gold-400 rounded"
                      rows={2}
                      placeholder="Note..."
                      value={dayNotes[key] ?? ""}
                      onChange={(e) => setDayNotes({ ...dayNotes, [key]: e.target.value })}
                      onBlur={() => saveDayNote(key)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
