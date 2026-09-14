"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, startOfWeek, addDays, isSameDay, isBefore } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { computeMeetingStatuses } from "@/lib/meetings";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL } from "@/lib/eventTypes";
import { isDayOff } from "@/lib/dayType";
import { RESULT_LABEL, gameScoreLine, scoreInDisplayOrder } from "@/lib/gameResults";
import { findTeamByOpponent, LHEQ_M17_AAA_TEAMS } from "@/lib/lheqTeams";
import Modal from "@/components/Modal";
import JourContent from "@/components/JourContent";
import AbsencePopupContent from "@/components/AbsencePopupContent";
import DailyReportPopupContent from "@/components/DailyReportPopupContent";
import WeeklyThemePopupContent from "@/components/WeeklyThemePopupContent";
import TeamBuildingPopupContent from "@/components/TeamBuildingPopupContent";
import PostGameUploadsReminder from "@/components/PostGameUploadsReminder";
import PhysioAlert from "@/components/PhysioAlert";
import type { Absence, DailyReport, Game, Injury, Meeting, Player, ScheduleEvent } from "@/lib/types";

const UNJUSTIFIED_ALERT_THRESHOLD = 2;

const todayStr = () => format(new Date(), "yyyy-MM-dd");

// La saison 2026-27 démarre la semaine du 24 août — tant que la vraie date
// du jour est avant ça, on ancre l'accueil sur cette première semaine plutôt
// que d'afficher une semaine morte sans activité.
const SEASON_START = new Date(2026, 7, 24); // mois 0-indexé : 7 = août

// La semaine du 31 août 2026 est la semaine #1 de la saison.
const WEEK_1_START = new Date(2026, 7, 31);

// Popups automatiques — uniquement sur l'accueil.
const ABSENCE_POPUP_HOUR = 12;
const ABSENCE_POPUP_MINUTE = 45;
const DAILY_REPORT_POPUP_HOUR = 15;
const DAILY_REPORT_POPUP_MINUTE = 30;
const DAILY_REPORT_SEASON_START = "2026-08-26";
const WEEKLY_THEME_POPUP_HOUR = 8;
const TEAM_BUILDING_POPUP_HOUR = 18;

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [weekEvents, setWeekEvents] = useState<ScheduleEvent[]>([]);
  const [weekGames, setWeekGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [activeInjuries, setActiveInjuries] = useState<Injury[]>([]);
  const [weekAbsences, setWeekAbsences] = useState<Absence[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showOverdueCard, setShowOverdueCard] = useState(true);
  const [showAbsencePopup, setShowAbsencePopup] = useState(false);
  const [dailyReportPopup, setDailyReportPopup] = useState<{ existing: DailyReport | null } | null>(null);
  const [showWeeklyThemePopup, setShowWeeklyThemePopup] = useState(false);
  const [showTeamBuildingPopup, setShowTeamBuildingPopup] = useState(false);
  const [weeklyTheme, setWeeklyTheme] = useState<string | null>(null);
  const [playedGames, setPlayedGames] = useState<Game[]>([]);

  const realWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekStart = isBefore(realWeekStart, SEASON_START) ? startOfWeek(SEASON_START, { weekStartsOn: 1 }) : realWeekStart;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekNumber = Math.floor((weekStart.getTime() - WEEK_1_START.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  const weekStartKey = format(weekStart, "yyyy-MM-dd");

  async function load() {
    const today = todayStr();
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(addDays(weekStart, 6), "yyyy-MM-dd");
    const realWeekFrom = format(realWeekStart, "yyyy-MM-dd");
    const realWeekTo = format(addDays(realWeekStart, 6), "yyyy-MM-dd");

    const [{ data: evts }, { data: gms }, { data: pls }, { data: meetingsAll }, { data: report }, { data: injuries }, { data: absences }, { data: theme }, { data: played }] =
      await Promise.all([
        supabase.from("schedule_events").select("*").gte("event_date", from).lte("event_date", to),
        supabase.from("games").select("*").gte("game_date", from).lte("game_date", to),
        supabase.from("players").select("*").eq("active", true).eq("is_call_up", false).order("jersey_number"),
        supabase.from("meetings").select("*"),
        supabase.from("daily_reports").select("*").eq("report_date", today).maybeSingle(),
        supabase.from("injuries").select("*").eq("status", "active"),
        supabase
          .from("absences")
          .select("*")
          .eq("reason", "non_justifie")
          .gte("absence_date", realWeekFrom)
          .lte("absence_date", realWeekTo),
        supabase.from("weekly_themes").select("theme").eq("week_start", format(weekStart, "yyyy-MM-dd")).maybeSingle(),
        supabase.from("games").select("*").not("result", "is", null).order("game_date", { ascending: false }),
      ]);

    setWeekEvents(evts ?? []);
    setWeekGames(gms ?? []);
    setPlayers(pls ?? []);
    setAllMeetings(meetingsAll ?? []);
    setDailyReport(report ?? null);
    setActiveInjuries(injuries ?? []);
    setWeekAbsences(absences ?? []);
    setWeeklyTheme(theme?.theme ?? null);
    setPlayedGames(played ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function checkAutoPopups() {
      const now = new Date();
      const today = todayStr();

      // Les jours de match, on ne demande pas les absences : les joueurs
      // blessés ou suspendus se saisissent directement dans l'alignement du match.
      const { data: gameToday } = await supabase
        .from("games")
        .select("id")
        .eq("game_date", today)
        .limit(1)
        .maybeSingle();

      // Un congé, férié, fête ou pédago n'a rien à saisir non plus : personne
      // n'est « absent » d'une journée où il n'y avait rien de prévu.
      const { data: todayScheduleEvents } = await supabase
        .from("schedule_events")
        .select("event_type, title")
        .eq("event_date", today);

      const afterAbsenceTime =
        now.getHours() > ABSENCE_POPUP_HOUR || (now.getHours() === ABSENCE_POPUP_HOUR && now.getMinutes() >= ABSENCE_POPUP_MINUTE);
      if (afterAbsenceTime && !gameToday && !isDayOff(todayScheduleEvents ?? [])) {
        const { data } = await supabase.from("daily_checks").select("check_date").eq("check_date", today).maybeSingle();
        if (!data) {
          setShowAbsencePopup(true);
          return;
        }
      }

      const afterReportTime =
        now.getHours() > DAILY_REPORT_POPUP_HOUR ||
        (now.getHours() === DAILY_REPORT_POPUP_HOUR && now.getMinutes() >= DAILY_REPORT_POPUP_MINUTE);
      if (afterReportTime && today >= DAILY_REPORT_SEASON_START) {
        const { data: practiceToday } = await supabase
          .from("schedule_events")
          .select("id")
          .eq("event_date", today)
          .eq("event_type", "practice")
          .limit(1)
          .maybeSingle();
        if (practiceToday) {
          const { data: report } = await supabase.from("daily_reports").select("*").eq("report_date", today).maybeSingle();
          if (!report) setDailyReportPopup({ existing: null });
        }
      }

      // À partir du mardi (jamais le lundi, veille trop tôt) et tant que le
      // thème de la semaine n'est pas encore fixé — pas seulement le mardi
      // pile, sinon une semaine où l'app n'est pas ouverte ce jour-là ne
      // redemande jamais.
      const isMondayOrEarlier = now.getDay() === 1;
      const afterWeeklyThemeTime = now.getHours() >= WEEKLY_THEME_POPUP_HOUR;
      if (!isMondayOrEarlier && afterWeeklyThemeTime) {
        const weekStartToday = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
        const { data: theme } = await supabase
          .from("weekly_themes")
          .select("week_start")
          .eq("week_start", weekStartToday)
          .maybeSingle();
        if (!theme) setShowWeeklyThemePopup(true);
      }

      const afterTeamBuildingTime = now.getHours() >= TEAM_BUILDING_POPUP_HOUR;
      if (afterTeamBuildingTime) {
        const { data: tbEvent } = await supabase
          .from("schedule_events")
          .select("id")
          .eq("event_date", today)
          .eq("event_type", "team_building")
          .limit(1)
          .maybeSingle();
        if (tbEvent) {
          const { data: tbLog } = await supabase.from("team_building_log").select("log_date").eq("log_date", today).maybeSingle();
          if (!tbLog) setShowTeamBuildingPopup(true);
        }
      }
    }
    checkAutoPopups();
  }, []);

  const meetingStatuses = computeMeetingStatuses(players, allMeetings);
  const overdue = meetingStatuses.filter((s) => s.overdue);

  if (loading) return <p className="text-slate-300">Chargement...</p>;

  const unjustifiedCountByPlayer = new Map<string, number>();
  for (const a of weekAbsences) {
    unjustifiedCountByPlayer.set(a.player_id, (unjustifiedCountByPlayer.get(a.player_id) ?? 0) + 1);
  }
  const flaggedAbsences = [...unjustifiedCountByPlayer.entries()]
    .filter(([, count]) => count >= UNJUSTIFIED_ALERT_THRESHOLD)
    .map(([playerId, count]) => ({ player: players.find((p) => p.id === playerId), count }));

  const eventsByDay = new Map<string, ScheduleEvent[]>();
  for (const e of weekEvents) {
    const list = eventsByDay.get(e.event_date) ?? [];
    list.push(e);
    eventsByDay.set(e.event_date, list);
  }
  const gameByDate = new Map(weekGames.map((g) => [g.game_date, g]));

  const todayKey = todayStr();
  const todayGame = gameByDate.get(todayKey);
  const todayEvents = eventsByDay.get(todayKey) ?? [];
  const todayOpponentTeam = todayGame ? findTeamByOpponent(todayGame.opponent) : undefined;
  const todayGameEvent = todayEvents.find((e) => e.event_type === "game");
  const ourTeam = LHEQ_M17_AAA_TEAMS.find((t) => t.slug === "as-de-quebec");
  const todayPractice = todayEvents.find((e) => e.event_type === "practice");
  const todayIsDayOff = isDayOff(todayEvents);

  // Les matchs hors concours ne comptent pas dans la fiche : ce sont des
  // matchs préparatoires, pas des matchs de saison. Ils restent visibles dans
  // l'onglet Résultats et dans les Pointeurs, avec leur propre filtre.
  const officialGames = playedGames.filter((g) => g.category !== "hors_concours");
  const record = officialGames.reduce(
    (acc, g) => {
      if (g.result === "W") acc.w++;
      else if (g.result === "L") acc.l++;
      else if (g.result === "OTL" || g.result === "SOL") acc.otl++;
      else if (g.result === "T") acc.t++;
      return acc;
    },
    { w: 0, l: 0, otl: 0, t: 0 }
  );
  const lheqUrl = LHEQ_M17_AAA_TEAMS.find((t) => t.slug === "as-de-quebec")?.lheqUrl;

  return (
    <div className="space-y-6">
      {/* Pense-bête des trois téléversements d'après-match — posé à droite,
          sans jamais couvrir la navigation. */}
      <PostGameUploadsReminder today={todayKey} />

      {/* Nouvelles consultations relevées dans la feuille de la clinique. */}
      <PhysioAlert />

      <div className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-sm p-6 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white drop-shadow">
              Semaine du {format(weekStart, "d MMMM", { locale: fr })}
              {weekNumber >= 1 && <span className="text-gold-400"> — Semaine #{weekNumber}</span>}
            </h1>
            <p className="text-slate-300 text-sm mt-1">Clique sur une journée pour voir l'alignement, l'horaire, les rencontres et la pratique.</p>
          </div>
          <button onClick={() => setShowAbsencePopup(true)} className="btn-secondary text-sm shrink-0">
            🩹 Absences
          </button>
        </div>

        {weeklyTheme && (
          <div className="rounded-xl bg-gold-500/15 border border-gold-400/40 px-4 py-2.5 flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <span className="text-sm text-gold-100">
              <span className="font-bold">Thème de la semaine :</span> {weeklyTheme}
            </span>
          </div>
        )}

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const today = isSameDay(day, new Date());
            const dayEvents = eventsByDay.get(key) ?? [];
            const game = gameByDate.get(key);
            const opponentTeam = game ? findTeamByOpponent(game.opponent) : undefined;
            // Un congé, férié, fête ou pédago ne mène nulle part : pas
            // d'horaire ni d'alignement à voir ce jour-là.
            const locked = !game && isDayOff(dayEvents);
            const DayTag = locked ? "div" : "button";
            return (
              <DayTag
                key={key}
                onClick={locked ? undefined : () => setSelectedDate(key)}
                className={`flex flex-col items-center rounded-xl border transition-all py-2 gap-1 ${
                  today
                    ? "bg-gradient-to-b from-gold-400 to-gold-500 border-gold-200 text-ink-900 shadow-lg shadow-gold-500/30"
                    : locked
                      ? "bg-white/5 border-white/10 text-white/50 cursor-default"
                      : "bg-white/10 border-white/10 hover:border-gold-400/60 hover:bg-white/15 text-white"
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wide ${today ? "text-ink-800" : "text-slate-400"}`}>
                  {format(day, "EEE", { locale: fr })}
                </span>
                <span className="font-black text-lg leading-none">{format(day, "d")}</span>
                {game ? (
                  opponentTeam ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={opponentTeam.logo} alt={opponentTeam.name} className="h-6 w-6 object-contain mix-blend-multiply" />
                  ) : (
                    <span className="text-[9px] font-bold truncate max-w-full px-0.5">{game.opponent}</span>
                  )
                ) : dayEvents.length > 0 ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`text-[9px] font-bold leading-none truncate max-w-full px-0.5 ${today ? "text-ink-800" : "text-gold-300"}`}>
                      {dayEvents[0].start_time ? dayEvents[0].start_time.slice(0, 5) : EVENT_TYPE_LABEL[dayEvents[0].event_type]}
                    </span>
                    <div className="flex gap-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={`h-1.5 w-1.5 rounded-full ${today ? "bg-ink-900" : EVENT_TYPE_COLOR[e.event_type].split(" ")[0]}`}
                          title={EVENT_TYPE_LABEL[e.event_type]}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <span className="h-1.5" />
                )}
              </DayTag>
            );
          })}
        </div>

        {todayGame ? (
          // Les jours de match, la bannière remplace la grille de raccourcis :
          // elle doit donc mener elle-même à l'alignement du jour.
          <Link
            // Une fois le résultat connu, l'alignement n'a plus d'intérêt :
            // la bannière mène au résumé du match.
            href={todayGame.result ? `/resultats/${todayGame.id}` : `/jour/${todayKey}/alignement`}
            className="group block relative overflow-hidden rounded-3xl border-2 border-gold-400/30 hover:border-gold-400/80 bg-gradient-to-br from-ink-800/80 via-ink-900/85 to-black/90 px-4 py-10 sm:py-14 text-center transition-colors"
          >
            {/* Halo doré derrière le duel + filigrane « Game Day ». */}
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-[36rem] max-w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-500/10 blur-3xl"
              aria-hidden
            />
            <span
              className="pointer-events-none select-none absolute inset-0 flex items-center justify-center text-[17vw] sm:text-8xl font-black text-white/[0.05] uppercase tracking-widest whitespace-nowrap"
              aria-hidden
            >
              Game Day
            </span>

            {/* L'équipe visiteuse est toujours nommée en premier : à domicile
                « Adversaire vs As de Québec », sur la route « As de Québec @
                Adversaire ». Les deux blocs de logo s'échangent donc. */}
            <div className="relative flex items-center justify-center gap-3 sm:gap-12">
              <div className="flex flex-col items-center gap-3 w-32 sm:w-48">
                {(todayGame.is_home ? todayOpponentTeam : ourTeam) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(todayGame.is_home ? todayOpponentTeam : ourTeam)!.logo}
                    alt={(todayGame.is_home ? todayOpponentTeam : ourTeam)!.name}
                    className="h-24 w-24 sm:h-36 sm:w-36 rounded-full bg-white object-contain p-2 sm:p-3 ring-4 ring-white/15 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
                  />
                )}
                <span className="font-black text-sm sm:text-xl text-white uppercase tracking-wide text-center leading-tight">
                  {todayGame.is_home ? todayOpponentTeam?.name ?? todayGame.opponent : "As de Québec"}
                </span>
              </div>

              <div className="flex flex-col items-center gap-1 shrink-0">
                {gameScoreLine(todayGame) ? (
                  <span className="font-black text-4xl sm:text-6xl text-gold-400 tabular-nums drop-shadow-[0_2px_10px_rgba(253,202,55,0.35)]">
                    {scoreInDisplayOrder(todayGame)}
                  </span>
                ) : (
                  <span className="font-black text-3xl sm:text-5xl italic bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent">
                    {todayGame.is_home ? "VS" : "@"}
                  </span>
                )}
                {/* Une fois le résultat connu (feuille de match téléversée),
                    le mot Victoire/Défaite remplace Domicile/Visiteur — c'est
                    l'information qu'on cherche après la partie. */}
                {todayGame.result ? (
                  <span
                    className={`text-xs sm:text-sm font-black uppercase tracking-[0.2em] ${
                      todayGame.result === "W"
                        ? "text-green-400"
                        : todayGame.result === "T"
                          ? "text-slate-300"
                          : "text-red-400"
                    }`}
                  >
                    {RESULT_LABEL[todayGame.result]}
                  </span>
                ) : (
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-gold-500/80">
                    {todayGame.is_home ? "Domicile" : "Visiteur"}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-center gap-3 w-32 sm:w-48">
                {(todayGame.is_home ? ourTeam : todayOpponentTeam) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(todayGame.is_home ? ourTeam : todayOpponentTeam)!.logo}
                    alt={(todayGame.is_home ? ourTeam : todayOpponentTeam)!.name}
                    className="h-24 w-24 sm:h-36 sm:w-36 rounded-full bg-white object-contain p-2 sm:p-3 ring-4 ring-white/15 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
                  />
                )}
                <span className="font-black text-sm sm:text-xl text-white uppercase tracking-wide text-center leading-tight">
                  {todayGame.is_home ? "As de Québec" : todayOpponentTeam?.name ?? todayGame.opponent}
                </span>
              </div>
            </div>

            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
              {todayGameEvent?.start_time && (
                <span className="rounded-full bg-gold-500/15 border border-gold-400/30 px-3 py-1 font-black text-gold-300 tabular-nums">
                  {todayGameEvent.start_time.slice(0, 5)}
                </span>
              )}
              {todayGame.location && (
                <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 font-semibold text-slate-200">
                  {todayGame.location}
                </span>
              )}
              {todayGame.bus_departure_time && !todayGame.result && (
                <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 font-semibold text-slate-200">
                  🚌 Départ Duberger {todayGame.bus_departure_time.slice(0, 5)}
                </span>
              )}
            </div>

            <div className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-ink-900 shadow-lg transition-transform group-hover:scale-105">
              {todayGame.result ? "📄 Résumé du match →" : "🏒 Faire l'alignement du match →"}
            </div>
          </Link>
        ) : (
          <div className={`grid ${todayIsDayOff ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-3`}>
            {!todayIsDayOff && (
            <button
              onClick={() => setSelectedDate(todayKey)}
              className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-gold-400/40 transition-colors p-4 flex flex-col gap-1"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-gold-400">📋 Rapport quotidien</span>
              <span className="text-sm text-white font-medium">{dailyReport ? "Rempli aujourd'hui — modifier" : "Remplir maintenant"}</span>
              {dailyReport?.practice_theme && <span className="text-xs text-slate-400 truncate">{dailyReport.practice_theme}</span>}
            </button>
            )}
            <Link
              href={`/jour/${todayKey}/alignement`}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-gold-400/40 transition-colors p-4 flex flex-col gap-1"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-gold-400">🏒 Alignement du jour</span>
              <span className="text-sm text-white font-medium">Voir / modifier l'alignement</span>
            </Link>
            <button
              onClick={() => setSelectedDate(todayKey)}
              className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-gold-400/40 transition-colors p-4 flex flex-col gap-1"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-gold-400">📅 Horaire du jour</span>
              {todayEvents.length === 0 ? (
                <span className="text-sm text-slate-400">Aucune activité — ajouter maintenant</span>
              ) : (
                <ul className="text-sm text-white space-y-0.5">
                  {todayEvents.map((e) => (
                    <li key={e.id} className="truncate">
                      {e.start_time && <span className="font-bold text-gold-300">{e.start_time.slice(0, 5)} </span>}
                      {EVENT_TYPE_LABEL[e.event_type]}
                      {todayPractice?.id === e.id && dailyReport?.practice_theme ? ` — ${dailyReport.practice_theme}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          </div>
        )}

        {/* La bannière mène à l'alignement ; ces raccourcis donnent accès au
            reste du jour de match — dont le téléversement de la feuille, qui
            remplit le pointage et les points des joueurs. */}
        {todayGame && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href={`/resultats/${todayGame.id}`} className="btn-dark">
              📄 Détails du match
            </Link>
            <button onClick={() => setSelectedDate(todayKey)} className="btn-dark">
              📋 Plan de match et horaire
            </button>
          </div>
        )}

        <div className="text-center flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/calendrier" className="text-sm text-slate-300 hover:text-gold-400 font-medium hover:underline">
            Voir le calendrier complet →
          </Link>
        </div>
      </div>

      {officialGames.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-sm p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-white">
              Fiche : {record.w}-{record.l}
              {record.otl > 0 ? `-${record.otl}` : ""}
              {record.t > 0 ? `-${record.t}` : ""}
            </h2>
            <p className="text-slate-400 text-sm">
              {record.w} victoire{record.w > 1 ? "s" : ""}, {record.l} défaite{record.l > 1 ? "s" : ""}
              {record.otl > 0 ? `, ${record.otl} défaite(s) en prolongation/tirs` : ""}
              {record.t > 0 ? `, ${record.t} match(s) nul(s)` : ""} sur {officialGames.length} matchs joués.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/resultats" className="btn-secondary text-sm">
              Voir les résultats →
            </Link>
            {lheqUrl && (
              <a href={lheqUrl} target="_blank" rel="noreferrer" className="btn-dark text-sm">
                📊 Détails LHEQ →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Pas de rappel de rapport quotidien un jour de match : le rapport porte
          sur la pratique, et il est déjà masqué dans la fiche de la journée. */}
      {!dailyReport && !todayIsDayOff && !todayGame && (
        <div className="rounded-xl bg-black/45 backdrop-blur-sm border border-amber-400/40 border-l-4 border-l-amber-400 text-amber-100 px-4 py-3 flex items-center justify-between gap-4">
          <span>📋 Le rapport quotidien d'aujourd'hui n'a pas encore été rempli.</span>
          <Link href={`/jour/${todayKey}`} className="btn shrink-0">
            Remplir maintenant
          </Link>
        </div>
      )}

      {flaggedAbsences.length > 0 && (
        <div className="rounded-xl bg-black/45 backdrop-blur-sm border border-red-400/40 border-l-4 border-l-red-400 text-red-100 px-4 py-3">
          <p className="font-medium mb-1">🚩 Absences non justifiées répétées cette semaine :</p>
          <ul className="text-sm list-disc list-inside space-y-0.5">
            {flaggedAbsences.map(({ player, count }, i) => (
              <li key={player?.id ?? i}>
                {player?.full_name ?? "Joueur"} — {count} absences non justifiées
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeInjuries.length > 0 && (
        <div className="rounded-xl bg-black/45 backdrop-blur-sm border border-red-400/40 border-l-4 border-l-red-400 text-red-100 px-4 py-3">
          <p className="font-medium mb-1">🩹 Blessures actives ({activeInjuries.length}) :</p>
          <ul className="text-sm list-disc list-inside space-y-0.5">
            {activeInjuries.map((i) => {
              const p = players.find((pl) => pl.id === i.player_id);
              return (
                <li key={i.id}>
                  {p?.full_name ?? "Joueur"} — {i.description}
                </li>
              );
            })}
          </ul>
          <Link href="/medical" className="btn mt-2 inline-flex">
            Voir le suivi médical
          </Link>
        </div>
      )}

      {selectedDate && (
        <Modal
          onClose={() => {
            setSelectedDate(null);
            load();
          }}
        >
          <JourContent
            date={selectedDate}
            onClose={() => {
              setSelectedDate(null);
              load();
            }}
          />
        </Modal>
      )}

      {/* Rappel de rencontres en retard — carte flottante non bloquante, ne
          gêne pas la navigation vers les autres onglets. */}
      {showOverdueCard && overdue.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] card shadow-2xl">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="font-medium text-sm">⏰ Rencontres individuelles en retard (3+ semaines)</p>
            <button onClick={() => setShowOverdueCard(false)} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Fermer">
              ✕
            </button>
          </div>
          <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5 mb-3 max-h-40 overflow-y-auto">
            {overdue.map((s) => (
              <li key={s.player.id}>
                {s.player.full_name}
                {" — "}
                {s.daysSince === null ? "aucune rencontre enregistrée" : `${s.daysSince} jours`}
              </li>
            ))}
          </ul>
          <Link href="/reunions" className="btn text-sm">
            Gérer les meetings
          </Link>
        </div>
      )}

      {showAbsencePopup && (
        <Modal onClose={() => setShowAbsencePopup(false)}>
          <AbsencePopupContent onClose={() => setShowAbsencePopup(false)} />
        </Modal>
      )}

      {dailyReportPopup && (
        <Modal onClose={() => setDailyReportPopup(null)}>
          <DailyReportPopupContent existing={dailyReportPopup.existing} onClose={() => setDailyReportPopup(null)} />
        </Modal>
      )}

      {showWeeklyThemePopup && (
        <Modal onClose={() => setShowWeeklyThemePopup(false)}>
          <WeeklyThemePopupContent
            weekStart={weekStartKey}
            onClose={() => {
              setShowWeeklyThemePopup(false);
              supabase
                .from("weekly_themes")
                .select("theme")
                .eq("week_start", weekStartKey)
                .maybeSingle()
                .then(({ data }) => setWeeklyTheme(data?.theme ?? null));
            }}
          />
        </Modal>
      )}

      {showTeamBuildingPopup && (
        <Modal onClose={() => setShowTeamBuildingPopup(false)}>
          <TeamBuildingPopupContent logDate={todayStr()} onClose={() => setShowTeamBuildingPopup(false)} />
        </Modal>
      )}
    </div>
  );
}
