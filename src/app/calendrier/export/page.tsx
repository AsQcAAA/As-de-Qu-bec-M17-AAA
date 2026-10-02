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
import type { Game, ScheduleEvent } from "@/lib/types";
import { printWithOrientation } from "@/lib/print";
import Modal from "@/components/Modal";
import EmailComposer from "@/components/EmailComposer";
import RecipientPicker from "@/components/RecipientPicker";
import { buildCalendarEmailHtml } from "@/lib/calendarExport";
import { usePlayerContacts } from "@/lib/usePlayerContacts";
import { useCoachDirectory } from "@/lib/useCoach";

import {
  cellKind,
  holidayLabel,
  isFreeWeekend,
  labelEvent,
  primaryEvent,
  type CellKind,
} from "@/lib/calendarExport";

const CELL_CLASS: Record<CellKind, string> = {
  highlight: "bg-red-300",
  freeWeekend: "bg-green-200",
  gameHome: "bg-gold-300",
  gameAway: "bg-slate-300",
  holiday: "bg-green-200",
  event: "bg-slate-100",
  empty: "",
};

export default function CalendrierExportPage() {
  const supabase = createClient();
  const [month, setMonth] = useState(new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});
  const [highlights, setHighlights] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { isHeadCoach } = useCoachDirectory();
  const [showEmail, setShowEmail] = useState(false);
  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const { players: allPlayers, contacts } = usePlayerContacts();

  // Le calendrier tel qu'il partira dans le courriel — recalculé à chaque
  // changement de mois ou de note, donc l'aperçu est toujours fidèle.
  const emailHtml = useMemo(
    () => buildCalendarEmailHtml({ month, events, games, dayNotes, highlights }),
    [month, events, games, dayNotes, highlights]
  );

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
          {isHeadCoach && (
            <button className="btn-secondary" onClick={() => setShowEmail(true)}>
              ✉️ Envoyer par courriel
            </button>
          )}
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
                  className={`cal-cell relative flex flex-col h-[152px] overflow-hidden rounded-md border p-1 text-[11px] font-semibold text-center ${CELL_CLASS[cellKind(primary, label, game, freeWeekend, highlighted)]} ${
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
                      {!game.is_home && game.bus_departure_time && (
                        <div className="cal-label text-[9px] font-semibold leading-tight">
                          🚌 Départ de Québec {game.bus_departure_time.slice(0, 5)}
                        </div>
                      )}
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

      {showEmail && (
        <Modal onClose={() => setShowEmail(false)}>
          <div className="space-y-4 no-print">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Envoyer le calendrier de {format(month, "MMMM yyyy", { locale: fr })} par courriel
                </h2>
                <p className="text-sm text-slate-400">
                  Le calendrier ci-dessous (notes du jour comprises) est inséré dans le courriel, avant ta signature.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setShowEmail(false)}>
                ✕ Fermer
              </button>
            </div>
            <section className="card space-y-3">
              <h3 className="font-semibold">1. Destinataires</h3>
              <RecipientPicker players={allPlayers} contacts={contacts} selected={recipients} onChange={setRecipients} />
            </section>
            <section className="card space-y-3">
              <h3 className="font-semibold">2. Message</h3>
              <EmailComposer
                playerIds={[...recipients]}
                defaultSubject={`Calendrier de ${format(month, "MMMM yyyy", { locale: fr })} — As de Québec M17 AAA`}
                defaultMessage={"Bonjour,\n\nVoici le calendrier du mois pour {joueur}.\n\n"}
                extraHtml={emailHtml}
                extraPreview={<div dangerouslySetInnerHTML={{ __html: emailHtml }} />}
              />
            </section>
          </div>
        </Modal>
      )}
    </div>
  );
}
