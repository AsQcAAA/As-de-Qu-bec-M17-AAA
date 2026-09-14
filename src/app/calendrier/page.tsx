"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isSameDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { EVENT_TYPE_LABEL, EVENT_TYPE_ORDER, EVENT_TYPE_SOLID_COLOR } from "@/lib/eventTypes";
import { scoreInDisplayOrder } from "@/lib/gameResults";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import Modal from "@/components/Modal";
import JourContent from "@/components/JourContent";
import type { EventType, Game, ScheduleEvent, WeeklyTheme } from "@/lib/types";

// Priorité d'affichage quand plusieurs évènements tombent le même jour —
// un match prend toujours le dessus visuellement sur la case.
const PRIORITY: EventType[] = ["game", "practice", "team_meeting", "pp_meeting", "team_building", "training", "individual_meeting", "other"];

function primaryEvent(events: ScheduleEvent[]): ScheduleEvent | null {
  // Un rappel n'a pas sa place dans PRIORITY (il n'a rien à afficher sur la
  // case du calendrier) : indexOf renverrait -1 et le ferait passer devant
  // le match ou la pratique. On l'exclut du choix de la case principale.
  const candidates = events.filter((e) => e.event_type !== "reminder");
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => PRIORITY.indexOf(a.event_type) - PRIORITY.indexOf(b.event_type))[0];
}

// Ordre de v\u00e9rification important : "pedago" avant "conge" au cas o\u00f9 les deux
// mots appara\u00eetraient dans le m\u00eame titre.
const HOLIDAY_LABELS: { keyword: string; label: string }[] = [
  { keyword: "pedago", label: "P\u00e9dago" },
  { keyword: "ferie", label: "F\u00e9ri\u00e9" },
  { keyword: "fete", label: "F\u00eate" },
  { keyword: "conge", label: "Cong\u00e9" },
];

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Retourne l'\u00e9tiquette pr\u00e9cise (P\u00e9dago/F\u00e9ri\u00e9/F\u00eate/Cong\u00e9) ou null si ce n'en
// est pas un \u2014 on ne doit jamais afficher "Autre" dans les calendriers.
function holidayLabel(title: string): string | null {
  const normalized = stripAccents(title.toLowerCase());
  return HOLIDAY_LABELS.find((h) => normalized.includes(h.keyword))?.label ?? null;
}

function isHoliday(title: string) {
  return holidayLabel(title) !== null;
}

function isMenage(title: string) {
  return stripAccents(title.toLowerCase()).includes("menage");
}

function isMultisport(title: string) {
  return stripAccents(title.toLowerCase()).includes("multisport");
}

// Mots-clés qui déclenchent la semaine complète (jeudi à dimanche) en rouge :
// Challenge, séries éliminatoires, Coupe Chevrolet.
const RED_WEEK_KEYWORDS = ["challenge", "series", "coupe chevrolet"];

function isRedWeekTrigger(title: string) {
  const normalized = stripAccents(title.toLowerCase());
  return RED_WEEK_KEYWORDS.some((k) => normalized.includes(k));
}

// Ne garde que "Challenge <lieu>" (ou Séries / Coupe Chevrolet) — jamais le
// titre complet brut ("... + Tournoi M13 AAA ...").
function redWeekLabel(title: string): string {
  const normalized = stripAccents(title.toLowerCase());
  if (normalized.includes("coupe chevrolet")) return "Coupe Chevrolet";
  if (normalized.includes("series")) return "Séries";
  const withoutM17 = title.replace(/M17\s*AAA/i, " ").replace(/\s+/g, " ").trim();
  const beforePlus = withoutM17.split("+")[0].trim();
  return beforePlus || "Challenge";
}

// Vert pour congés/fériés/pédago/fête, jaune/gris pour matchs locaux/extérieur,
// sinon la couleur pleine habituelle du type d'évènement.
function cellColor(event: ScheduleEvent, game: Game | undefined): string {
  if (event.event_type === "game") {
    if (game?.is_home === false) return "bg-slate-400 text-ink-900";
    return "bg-gold-500 text-ink-900";
  }
  if (isHoliday(event.title)) return "bg-green-500 text-white";
  if (isMultisport(event.title)) return "bg-blue-500 text-white";
  if (isRedWeekTrigger(event.title)) return "bg-red-600 text-white";
  return EVENT_TYPE_SOLID_COLOR[event.event_type];
}

const emptyForm = {
  event_date: "",
  start_time: "",
  end_time: "",
  event_type: "practice" as EventType,
  title: "",
  location: "",
  notes: "",
};

export default function CalendrierPage() {
  const supabase = createClient();
  const [month, setMonth] = useState(new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [weeklyThemes, setWeeklyThemes] = useState<WeeklyTheme[]>([]);
  /** Thème saisi dans le rapport quotidien, par date de pratique. */
  const [practiceThemes, setPracticeThemes] = useState<{ report_date: string; practice_theme: string | null }[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  async function load() {
    const [{ data: evts }, { data: gms }, { data: themes }, { data: reports }] = await Promise.all([
      supabase.from("schedule_events").select("*").order("event_date"),
      supabase.from("games").select("*"),
      supabase.from("weekly_themes").select("*"),
      supabase.from("daily_reports").select("report_date, practice_theme"),
    ]);
    setEvents(evts ?? []);
    setGames(gms ?? []);
    setWeeklyThemes(themes ?? []);
    setPracticeThemes(reports ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  // Une rangée par semaine (7 jours), pour pouvoir glisser une bande de
  // thème hebdomadaire entre chaque semaine.
  const weekRows = useMemo(() => {
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [days]);

  const themeByWeekStart = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of weeklyThemes) {
      if (t.theme) map.set(t.week_start, t.theme);
    }
    return map;
  }, [weeklyThemes]);

  const practiceThemeByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of practiceThemes) {
      if (r.practice_theme) map.set(r.report_date, r.practice_theme);
    }
    return map;
  }, [practiceThemes]);

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

  // Semaines "Challenge" / séries / Coupe Chevrolet : jeudi à dimanche de la
  // semaine en rouge, calculé à partir de tout évènement déclencheur.
  const redWeekLabelByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      if (!isRedWeekTrigger(e.title)) continue;
      const label = redWeekLabel(e.title);
      const thursday = startOfWeek(new Date(e.event_date + "T00:00:00"), { weekStartsOn: 1 });
      thursday.setDate(thursday.getDate() + 3);
      for (let i = 0; i < 4; i++) {
        map.set(format(addDays(thursday, i), "yyyy-MM-dd"), label);
      }
    }
    return map;
  }, [events]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("schedule_events").insert({
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      event_type: form.event_type,
      title: form.title,
      location: form.location || null,
      notes: form.notes || null,
    });
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendrier mensuel</h1>
          <p className="text-slate-500 text-sm">{format(month, "MMMM yyyy")}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setMonth(subMonths(month, 1))}>
            ← Précédent
          </button>
          <button className="btn-secondary" onClick={() => setMonth(new Date())}>
            Aujourd'hui
          </button>
          <button className="btn-secondary" onClick={() => setMonth(addMonths(month, 1))}>
            Suivant →
          </button>
          <button className="btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Annuler" : "+ Évènement"}
          </button>
          <Link href="/calendrier/export" className="btn-dark">
            📄 Export mensuel
          </Link>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              required
              className="input"
              value={form.event_date}
              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value as EventType })}
            >
              {EVENT_TYPE_ORDER.map((k) => (
                <option key={k} value={k}>
                  {EVENT_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Heure début</label>
            <input
              type="time"
              className="input"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Heure fin</label>
            <input
              type="time"
              className="input"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Titre</label>
            <input
              required
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Lieu</label>
            <input
              className="input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn">
              Ajouter à l'horaire
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-7 gap-2 text-center text-sm font-bold text-slate-300">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="space-y-2">
      {weekRows.map((week, wi) => {
        const weekStartKey = format(week[0], "yyyy-MM-dd");
        const weekTheme = themeByWeekStart.get(weekStartKey);
        return (
      <div key={wi} className="space-y-1">
      {/* Le thème annonce la semaine : il se lit AVANT les journées qu'il
          gouverne, pas après. */}
      {weekTheme && (
        <div className="rounded-lg bg-gold-500/15 border border-gold-400/40 px-3 py-1.5 flex items-center gap-2">
          <span className="text-sm">🎯</span>
          <span className="text-xs font-bold text-gold-200 uppercase tracking-wide">Thème de la semaine :</span>
          <span className="text-sm text-gold-100">{weekTheme}</span>
        </div>
      )}
      <div className="grid grid-cols-7 gap-2">
        {week.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const redLabel = redWeekLabelByDate.get(key);
          // Pendant une semaine de tournoi (rouge), le Multisport du vendredi
          // ne doit jamais s'afficher — seul le tournoi compte cette semaine-là.
          const dayEvents = (eventsByDay.get(key) ?? []).filter((e) => !(redLabel && isMultisport(e.title)));
          // Un match l'emporte toujours, même sans case "game" dans l'horaire
          // du jour (ex. seulement des meetings créés à la main ce jour-là) :
          // sans quoi la case affichait un meeting au lieu du résultat.
          const primary = gameByDate.get(key)
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
          const menageEvent = dayEvents.find((e) => isMenage(e.title) && e.id !== primary?.id);
          const inMonth = isSameMonth(day, month);
          const dow = day.getDay();
          const isWeekend = dow === 0 || dow === 6;
          const isCongeFallback = !primary && isWeekend && !redLabel;
          // Un congé — qu'il soit déclaré (évènement "congé/férié/...") ou
          // simplement une fin de semaine sans rien de prévu — ne mène nulle
          // part : pas d'horaire ni d'alignement à voir ce jour-là.
          const locked = (!!primary && isHoliday(primary.title)) || isCongeFallback;
          const Tag = locked ? "div" : "button";
          return (
            <Tag
              key={key}
              onClick={locked ? undefined : () => setSelectedDate(key)}
              className={`flex flex-col h-[150px] sm:h-[165px] rounded-lg border p-2 text-sm text-left transition-colors overflow-hidden ${
                primary
                  ? `${cellColor(primary, gameByDate.get(key))} border-transparent ${locked ? "cursor-default" : "hover:brightness-110"}`
                  : redLabel
                    ? "bg-red-600 text-white border-transparent hover:brightness-110"
                    : isCongeFallback
                      ? "bg-green-500 text-white border-transparent cursor-default"
                      : inMonth
                        ? "bg-white hover:border-gold-500 border-slate-200"
                        : "bg-slate-700 text-slate-400 hover:border-gold-500 border-slate-600"
              } ${
                isSameDay(day, new Date())
                  ? "ring-4 ring-gold-400 ring-offset-2 ring-offset-ink-900 shadow-xl shadow-gold-500/40 scale-[1.04] z-10 relative"
                  : ""
              } ${!inMonth && !primary ? "opacity-60" : ""}`}
            >
              <div className={`font-black text-lg mb-1 shrink-0 ${primary || redLabel || isCongeFallback ? "" : inMonth ? "text-slate-900" : ""}`}>
                {format(day, "d")}
              </div>
              {!primary && redLabel && (
                <div className="h-full flex items-center justify-center text-center font-bold text-base leading-tight break-words">
                  {redLabel}
                </div>
              )}
              {!primary && isCongeFallback && (
                <div className="h-full flex items-center justify-center text-center font-bold text-base leading-tight break-words">Congé</div>
              )}
              {primary && (
                <div className="flex-1 min-h-0">
                  {primary.event_type === "game" && gameByDate.get(key) ? (
                    (() => {
                      const g = gameByDate.get(key)!;
                      const opponentTeam = findTeamByOpponent(g.opponent);
                      // Une fois le match joué, seuls le logo et le pointage
                      // comptent : l'heure et l'aréna n'apprennent plus rien.
                      const played = !!g.result;
                      // Notre pointage d'abord, toujours — c'est la façon de
                      // dire un résultat, et la lettre lève l'ambiguïté.
                      const scoreLine = played ? `${g.result} ${g.goals_for ?? "-"}-${g.goals_against ?? "-"}` : null;
                      const longLocation = !played && (g.location?.length ?? 0) > 20;
                      return (
                        <div className="h-full flex flex-col justify-center gap-1 relative">
                          {opponentTeam && longLocation && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={opponentTeam.logo}
                              alt={opponentTeam.name}
                              className="absolute top-0 right-0 h-9 w-9 object-contain mix-blend-multiply"
                            />
                          )}
                          {played ? (
                            <div className="flex-1 min-h-0 flex items-center justify-center">
                              {opponentTeam ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={opponentTeam.logo}
                                  alt={opponentTeam.name}
                                  className="h-full max-h-20 object-contain mix-blend-multiply"
                                />
                              ) : (
                                <span className="font-bold leading-tight break-words">{g.opponent}</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-1 min-h-0">
                              <div className={`flex flex-col justify-center gap-0.5 shrink-0 ${longLocation ? "pr-9 w-full" : ""}`}>
                                {primary.start_time && <div className="text-xs font-bold leading-tight">{primary.start_time.slice(0, 5)}</div>}
                                {g.location && <div className="text-xs font-bold leading-tight break-words">{g.location}</div>}
                                {g.bus_departure_time && (
                                  <div className="text-xs font-bold leading-tight">🚌 {g.bus_departure_time.slice(0, 5)}</div>
                                )}
                                {!opponentTeam && <div className="font-bold leading-tight break-words">{g.opponent}</div>}
                              </div>
                              {opponentTeam && !longLocation && (
                                <div className="flex-1 h-full flex items-center justify-center min-w-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={opponentTeam.logo}
                                    alt={opponentTeam.name}
                                    className="h-full max-h-20 w-full object-contain mix-blend-multiply"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          {scoreLine && (
                            <div className="text-base font-black text-center leading-none shrink-0">{scoreLine}</div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-1">
                      {/* Thème de la pratique — saisi dans le rapport quotidien
                          une fois la pratique tenue, affiché au-dessus du mot
                          « Pratique » pour se repérer d'un coup d'œil. */}
                      {primary.event_type === "practice" && practiceThemeByDate.get(key) && (
                        <div className="text-[10px] font-black uppercase tracking-wide leading-tight break-words opacity-90">
                          {practiceThemeByDate.get(key)}
                        </div>
                      )}
                      <div className="font-bold text-base leading-tight break-words">
                        {holidayLabel(primary.title) ?? (isRedWeekTrigger(primary.title) ? redWeekLabel(primary.title) : primary.title)}
                      </div>
                      {menageEvent && <div className="text-[10px] font-medium opacity-90 leading-tight break-words">{menageEvent.title}</div>}
                    </div>
                  )}
                </div>
              )}
              {menageEvent && primary?.event_type === "game" && (
                <div className="shrink-0 text-[10px] font-medium opacity-90 leading-tight break-words">{menageEvent.title}</div>
              )}
              {/* Match joué : la case ne montre plus que le logo et le pointage.
                  Le décompte des autres activités du jour n'a plus d'utilité. */}
              {!(primary?.event_type === "game" && gameByDate.get(key)?.result) &&
                dayEvents.length - (menageEvent ? 1 : 0) > 1 && (
                <div className={`shrink-0 text-xs font-bold ${primary ? "opacity-80" : "text-slate-400"}`}>
                  +{dayEvents.length - (menageEvent ? 1 : 0) - 1} autre
                  {dayEvents.length - (menageEvent ? 1 : 0) - 1 > 1 ? "s" : ""}
                </div>
              )}
            </Tag>
          );
        })}
      </div>
      </div>
        );
      })}
      </div>

      {selectedDate && (
        <Modal onClose={() => setSelectedDate(null)}>
          <JourContent date={selectedDate} onClose={() => setSelectedDate(null)} />
        </Modal>
      )}
    </div>
  );
}
