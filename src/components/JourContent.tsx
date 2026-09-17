"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { lastName } from "@/lib/players";
import { EVENT_TYPE_LABEL, EVENT_TYPE_ORDER } from "@/lib/eventTypes";
import { isDayOff, isNoPracticeDay } from "@/lib/dayType";
import { ABSENCE_REASON_LABEL, REASON_EMOJI } from "@/lib/absenceReasons";
import { RESULT_LABEL, matchupLabel } from "@/lib/gameResults";
import GamePlanEditor from "@/components/GamePlanEditor";
import DayScheduleEditor from "@/components/DayScheduleEditor";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { useCoachDirectory } from "@/lib/useCoach";
import type { Absence, EventType, Game, Lineup, LineupUnit, Meeting, Player, PracticeBlock, ScheduleEvent } from "@/lib/types";

const emptyEventForm = { start_time: "", event_type: "practice" as EventType, title: "", location: "" };
/** Panneaux de l'effectif, pour le résumé d'alignement d'après-match. */
const ROSTER_PANELS = [
  { label: "Attaquants (effectif)", short: "Attaquants", cols: "grid-cols-3", positions: ["AG", "C", "AD"] },
  { label: "Défenseurs (effectif)", short: "Défenseurs", cols: "grid-cols-2", positions: ["DG", "DD"] },
  { label: "Gardiens (effectif)", short: "Gardiens", cols: "grid-cols-2", positions: ["G"] },
];

const emptyReportForm = { meeting_theme: "", practice_theme: "", coach_notes: "" };

// Delarosbil est un rappel, mais s'entraîne avec le groupe assez régulièrement
// pour rester dans les grilles Meeting individuel / Joueurs blessés (seule
// exception — les autres remplaçants n'ont pas de numéro et afficheraient "?").
const DAILY_CALL_UP_EXCEPTION_ID = "f34e7b01-52be-4810-848c-466a3ede78a6";

export default function JourContent({ date, onClose }: { date: string; onClose?: () => void }) {
  const supabase = createClient();
  const { myId, isHeadCoach, authorLabel } = useCoachDirectory();

  const [loading, setLoading] = useState(true);
  // Tout l'effectif actif, remplaçants compris : un affilié aligné doit être
  // résolu, sinon sa case s'affiche « libre ».
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [lineup, setLineup] = useState<Lineup | null>(null);
  const [units, setUnits] = useState<LineupUnit[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [blocks, setBlocks] = useState<PracticeBlock[]>([]);

  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [blockDrafts, setBlockDrafts] = useState<Record<number, { title: string; duration_minutes: string; description: string }>>({});
  const [game, setGame] = useState<Game | null>(null);
  const [reportForm, setReportForm] = useState(emptyReportForm);
  /** Qui a écrit/modifié ce rapport en dernier — affiché à l'entraîneur-chef seulement. */
  const [reportUpdatedBy, setReportUpdatedBy] = useState<string | null>(null);
  const [savingReport, setSavingReport] = useState(false);
  const [injuredIds, setInjuredIds] = useState<Set<string>>(new Set());
  const [knownAbsences, setKnownAbsences] = useState<Absence[]>([]);

  async function load() {
    const [{ data: pls }, { data: evts }, { data: lineups }, { data: mts }, { data: pblocks }, { data: gm }, { data: report }, { data: abs }] =
      await Promise.all([
        supabase.from("players").select("*").eq("active", true).order("jersey_number"),
        supabase.from("schedule_events").select("*").eq("event_date", date).order("start_time"),
        supabase.from("lineups").select("*").eq("lineup_date", date).limit(1),
        supabase.from("meetings").select("*").eq("meeting_date", date).eq("meeting_type", "individual"),
        supabase.from("practice_blocks").select("*").eq("practice_date", date).order("position"),
        supabase.from("games").select("*").eq("game_date", date).maybeSingle(),
        supabase.from("daily_reports").select("*").eq("report_date", date).maybeSingle(),
        supabase.from("absences").select("*").eq("absence_date", date),
      ]);
    setAllPlayers(pls ?? []);
    setEvents(evts ?? []);
    setMeetings(mts ?? []);
    setBlocks(pblocks ?? []);
    const dayAbsences = (abs ?? []) as Absence[];
    setInjuredIds(new Set(dayAbsences.filter((a) => a.reason === "blesse").map((a) => a.player_id)));
    // Absences connues d'avance (école, suspension, remplacement M18...) — à
    // distinguer des blessures (case à cocher ci-dessous) et du sans-contact
    // (le joueur est présent, juste sans mise en échec).
    setKnownAbsences(dayAbsences.filter((a) => a.reason && a.reason !== "blesse" && a.reason !== "sans_contact"));
    setGame(gm ?? null);
    setReportForm(
      report
        ? {
            meeting_theme: report.meeting_theme ?? "",
            practice_theme: report.practice_theme ?? "",
            coach_notes: report.coach_notes ?? "",
          }
        : emptyReportForm
    );
    setReportUpdatedBy(report?.updated_by ?? null);

    const l = lineups?.[0] ?? null;
    setLineup(l);
    if (l) {
      const { data: u } = await supabase.from("lineup_units").select("*").eq("lineup_id", l.id).order("unit_order");
      setUnits(u ?? []);
      if (gm && !gm.lineup_id) {
        await supabase.from("games").update({ lineup_id: l.id }).eq("id", gm.id);
      }
    } else {
      setUnits([]);
    }

    const drafts: Record<number, { title: string; duration_minutes: string; description: string }> = {};
    for (let pos = 1; pos <= 7; pos++) {
      const existing = (pblocks ?? []).find((b) => b.position === pos);
      drafts[pos] = {
        title: existing?.title ?? "",
        duration_minutes: existing?.duration_minutes?.toString() ?? "",
        description: existing?.description ?? "",
      };
    }
    setBlockDrafts(drafts);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    const title = eventForm.title.trim() || EVENT_TYPE_LABEL[eventForm.event_type];
    await supabase.from("schedule_events").insert({
      event_date: date,
      start_time: eventForm.start_time || null,
      event_type: eventForm.event_type,
      title,
      location: eventForm.location || null,
    });
    setEventForm(emptyEventForm);
    load();
  }

  async function removeEvent(id: string) {
    await supabase.from("schedule_events").delete().eq("id", id);
    load();
  }

  async function toggleMeeting(playerId: string) {
    const existing = meetings.find((m) => m.player_id === playerId);
    if (existing) {
      await supabase.from("meetings").delete().eq("id", existing.id);
    } else {
      await supabase.from("meetings").insert({
        meeting_date: date,
        meeting_type: "individual",
        player_id: playerId,
        updated_by: myId,
      });
    }
    load();
  }

  async function saveReport(e: React.FormEvent) {
    e.preventDefault();
    setSavingReport(true);
    await supabase
      .from("daily_reports")
      .upsert({ report_date: date, ...reportForm, updated_by: myId }, { onConflict: "report_date" });
    setSavingReport(false);
    load();
  }

  // Marque/démarque un joueur blessé pour la journée — enregistré comme une
  // absence de raison "blesse" (comptée dans son historique de blessures).
  async function toggleInjured(playerId: string) {
    if (injuredIds.has(playerId)) {
      await supabase.from("absences").delete().eq("player_id", playerId).eq("absence_date", date).eq("reason", "blesse");
    } else {
      await supabase
        .from("absences")
        .upsert({ player_id: playerId, absence_date: date, reason: "blesse" }, { onConflict: "player_id,absence_date" });
    }
    load();
  }

  async function saveBlock(position: number) {
    const draft = blockDrafts[position];
    await supabase.from("practice_blocks").upsert(
      {
        practice_date: date,
        position,
        title: draft.title || null,
        duration_minutes: draft.duration_minutes ? Number(draft.duration_minutes) : null,
        description: draft.description || null,
      },
      { onConflict: "practice_date,position" }
    );
    load();
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  // Les grilles de rencontres et de blessés ne concernent que l'effectif
  // régulier — Delarosbil excepté, il s'entraîne avec le groupe.
  const players = allPlayers.filter((p) => !p.is_call_up || p.id === DAILY_CALL_UP_EXCEPTION_ID);
  const meetingPlayerIds = new Set(meetings.map((m) => m.player_id));
  // Vendredi : jamais de pratique/alignement (sauf s'il y a un match ce jour-là).
  const noPractice = isNoPracticeDay(date) && !game;
  const dayOff = isDayOff(events);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold capitalize">{format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}</h1>
          {game && (
            <p className="text-sm text-slate-300">
              {matchupLabel(game, findTeamByOpponent(game.opponent)?.name)}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Accès direct à l'alignement : c'est ce qu'on vient chercher en
              ouvrant une journée, y compris plusieurs jours à l'avance.
              Le lien existait déjà, mais enfoui dans la colonne de droite. */}
          {!dayOff && (
            <Link href={`/jour/${date}/alignement`} className="btn">
              🏒 {game ? "Alignement du match" : "Alignement"}
            </Link>
          )}
          {game && (
            <Link href={`/resultats/${game.id}`} className="btn-dark">
              📄 Détails du match
            </Link>
          )}
          {/* Export direct de la feuille d'alignement, sans passer par l'onglet
              d'alignement du match — ouvre un nouvel onglet qui imprime dès
              que l'alignement est chargé (voir ?print=1 sur cette page). */}
          {game && (
            <Link href={`/jour/${date}/alignement?print=1`} target="_blank" className="btn-dark">
              🖨️ Exporter
            </Link>
          )}
          {!dayOff && (
            <Link href={`/jour/${date}/tv`} target="_blank" className="btn-dark">
              📺 Vue TV
            </Link>
          )}
          {onClose && (
            <button onClick={onClose} className="btn-secondary" aria-label="Fermer">
              ✕ Fermer
            </button>
          )}
        </div>
      </div>

      {/* Absences connues d'avance (école, suspension, remplacement M18...) —
          visibles dès l'ouverture de la journée, pas seulement une fois la
          pratique/le match commencé. */}
      {knownAbsences.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-2 text-sm text-amber-900 flex flex-wrap gap-x-4 gap-y-1">
          {knownAbsences.map((a) => {
            const p = playerById.get(a.player_id);
            if (!p) return null;
            return (
              <span key={a.id}>
                {a.reason && REASON_EMOJI[a.reason]} <strong>{p.full_name}</strong> —{" "}
                {a.reason && ABSENCE_REASON_LABEL[a.reason]}
                {a.detail ? ` (${a.detail})` : ""}
              </span>
            );
          })}
        </div>
      )}

      {/* Congé ou pédago : aucune activité, donc rien à saisir. Afficher les
          formulaires laisserait croire qu'il y a quelque chose à remplir. */}
      {dayOff ? (
        <section className="card text-center space-y-1 py-10">
          <div className="text-4xl">🌴</div>
          <h2 className="text-xl font-bold">Journée de congé</h2>
          <p className="text-sm text-slate-500">
            Aucune activité à l&apos;horaire : ni alignement, ni pratique, ni rapport quotidien.
          </p>
        </section>
      ) : (
      <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-6">
        {game ? (
          /* Match du jour — remplace l'horaire les jours de match */
          <section className="card space-y-3">
            <div className="flex items-center gap-3">
              {(() => {
                const opponentTeam = findTeamByOpponent(game.opponent);
                return opponentTeam ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={opponentTeam.logo} alt={opponentTeam.name} className="h-14 w-14 object-contain mix-blend-multiply" />
                ) : null;
              })()}
              <h2 className="font-semibold">
                Match du jour — {matchupLabel(game, findTeamByOpponent(game.opponent)?.name)}
              </h2>
            </div>
            {game.bus_departure_time && !game.result && (
              <p className="text-sm font-bold">🚌 Départ Aréna Duberger : {game.bus_departure_time.slice(0, 5)}</p>
            )}
            {game.result && (
              <span className="badge bg-gold-100 text-ink-800">
                {RESULT_LABEL[game.result]} {game.goals_for ?? "-"}–{game.goals_against ?? "-"}
              </span>
            )}
            {/* Plus de saisie manuelle du résultat : la feuille de match
                officielle de la ligue est lue automatiquement et remplit le
                pointage ainsi que les buts et passes de chaque joueur. */}
            {/* Notes du match — saisies sur la fiche du match, reprises ici pour
                les retrouver sans quitter la journée. */}
            {game.notes && (
              <div className="pt-2 border-t">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Notes du match</div>
                <p className="text-sm whitespace-pre-wrap">{game.notes}</p>
              </div>
            )}

            <div className="pt-2 border-t space-y-2">
              <p className="text-xs text-slate-500">
                Après le match, téléverse la feuille de match : le pointage et les points des joueurs se
                remplissent automatiquement.
              </p>
              <Link href={`/resultats/${game.id}`} className="btn inline-flex">
                📄 Détails du match →
              </Link>
            </div>
          </section>
        ) : (
          <section className="card space-y-3">
            <h2 className="font-semibold">Horaire du jour</h2>
            <DayScheduleEditor date={date} onChanged={load} />
          </section>
        )}

        {/* Meeting individuel — masqué les jours de match */}
        {!game && (
          <section className="card space-y-3 self-start">
            <h2 className="font-semibold">Meeting individuel</h2>
            <p className="text-xs text-slate-500">Tape sur un numéro pour logger/retirer une rencontre aujourd'hui.</p>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => {
                const met = meetingPlayerIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleMeeting(p.id)}
                    className={`h-12 w-12 rounded-full font-bold text-sm flex items-center justify-center border-2 transition-colors ${
                      met ? "bg-gold-500 border-gold-600 text-ink-900" : "bg-white border-slate-300 text-ink-800 hover:border-gold-400"
                    }`}
                    title={p.full_name}
                  >
                    {p.jersey_number ?? "?"}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Rapport quotidien — absent les jours de congé/pédago et les jours de
            match : le rapport porte sur la pratique du jour. */}
        {!dayOff && !game && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Rapport quotidien</h2>
            {isHeadCoach && authorLabel(reportUpdatedBy) && (
              <span className="text-xs text-slate-400">Écrit par {authorLabel(reportUpdatedBy)}</span>
            )}
          </div>
          <form onSubmit={saveReport} className="space-y-2">
            <div>
              <label className="label">Thème du meeting</label>
              <input
                className="input"
                value={reportForm.meeting_theme}
                onChange={(e) => setReportForm({ ...reportForm, meeting_theme: e.target.value })}
              />
            </div>
            {!noPractice && (
            <div>
              <label className="label">Thème de la pratique</label>
              <input
                className="input"
                value={reportForm.practice_theme}
                onChange={(e) => setReportForm({ ...reportForm, practice_theme: e.target.value })}
              />
            </div>
            )}
            <div>
              <label className="label">Notes (optionnel)</label>
              <textarea
                className="input"
                rows={2}
                value={reportForm.coach_notes}
                onChange={(e) => setReportForm({ ...reportForm, coach_notes: e.target.value })}
              />
            </div>
            <button type="submit" className="btn" disabled={savingReport}>
              {savingReport ? "Enregistrement..." : "Enregistrer le rapport"}
            </button>
          </form>

          <div className="pt-2 border-t space-y-1.5">
            <label className="label mb-0">Joueurs blessés (absents de la pratique)</label>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => {
                const injured = injuredIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleInjured(p.id)}
                    className={`h-11 w-11 rounded-full font-bold text-sm flex items-center justify-center border-2 transition-colors ${
                      injured ? "bg-red-500 border-red-600 text-white" : "bg-white border-slate-300 text-ink-800 hover:border-red-400"
                    }`}
                    title={p.full_name}
                  >
                    {p.jersey_number ?? "?"}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        )}
      </div>

      <div className="space-y-6">
        {/* Alignement — absent les vendredis (jamais d'alignement ce jour-là, sauf match) */}
        {!noPractice && (
        <section className="card space-y-3">
          <h2 className="font-semibold">{game ? "Alignement du match" : "Alignement"}</h2>
          {!lineup || units.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun alignement pour cette journée.</p>
          ) : (
            /* Disposé comme la feuille imprimée : les attaquants 3 de front —
               un trio par rangée — et les défenseurs 2 de front. La liste en
               texte ne laissait pas voir les combinaisons. */
            <div className="space-y-3">
              {ROSTER_PANELS.map((panel) => {
                const ids = units.find((u) => u.unit_label === panel.label)?.player_ids ?? [];
                const lastUsed = ids.reduce((last, id, i) => (id ? i : last), -1);
                const shown = ids.slice(0, lastUsed + 1);
                if (shown.length === 0) return null;
                return (
                  <div key={panel.label}>
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">
                      {panel.short}
                    </div>
                    <div className={`grid ${panel.cols} gap-1.5`}>
                      {shown.map((id, i) => {
                        const p = id ? playerById.get(id) : null;
                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 ${
                              p ? "border-slate-200 bg-slate-50" : "border-dashed border-slate-200"
                            }`}
                          >
                            <span className="w-6 shrink-0 text-[10px] font-black text-slate-400 text-center">
                              {panel.positions[i % panel.positions.length]}
                            </span>
                            {p ? (
                              <>
                                {p.photo_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.photo_url} alt={p.full_name} className="h-6 w-6 rounded-full object-cover shrink-0" />
                                ) : (
                                  <span className="h-6 w-6 shrink-0 rounded-full bg-ink-900 text-gold-400 text-[9px] font-black flex items-center justify-center">
                                    {p.jersey_number ?? "–"}
                                  </span>
                                )}
                                <span className="text-xs font-medium truncate">
                                  {p.jersey_number ? `${p.jersey_number} ` : ""}
                                  {lastName(p.full_name)}
                                </span>
                                {/* Joueur affilié : même repère que sur les chandails. */}
                                {p.is_call_up && (
                                  <span
                                    title="Joueur affilié (remplaçant)"
                                    className="ml-auto shrink-0 h-4 w-4 rounded-full border border-gold-500 bg-ink-900 text-gold-400 text-[9px] font-black flex items-center justify-center"
                                  >
                                    A
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs italic text-slate-300">libre</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Link href={`/jour/${date}/alignement`} className={game?.result ? "text-sm text-gold-700 hover:underline" : "btn inline-flex"}>
            {game?.result
              ? "Voir l'alignement complet →"
              : `${lineup ? "Modifier l'alignement" : "Créer l'alignement"} rapidement →`}
          </Link>
        </section>
        )}

        {game ? (
          /* Plan de match — remplace la pratique du jour les jours de match */
          <section className="card space-y-3">
            <h2 className="font-semibold">Plan de match — 4 points clés</h2>
            <p className="text-xs text-slate-500">Conservé dans les archives du match.</p>
            <GamePlanEditor game={game} onSaved={load} />
          </section>
        ) : noPractice ? null : (
          /* Pratique du jour — absente les vendredis */
          <section className="card space-y-3">
            <h2 className="font-semibold">Pratique du jour</h2>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6, 7].map((pos) => (
                <div key={pos} className="flex gap-2 items-start border-b last:border-0 pb-2">
                  <span className="mt-2 h-6 w-6 shrink-0 rounded-full bg-ink-900 text-gold-400 text-xs font-bold flex items-center justify-center">
                    {pos}
                  </span>
                  <div className="flex-1 grid grid-cols-3 gap-1.5">
                    <input
                      className="input col-span-2"
                      placeholder="Exercice"
                      value={blockDrafts[pos]?.title ?? ""}
                      onChange={(e) =>
                        setBlockDrafts({ ...blockDrafts, [pos]: { ...blockDrafts[pos], title: e.target.value } })
                      }
                      onBlur={() => saveBlock(pos)}
                    />
                    <input
                      className="input"
                      placeholder="Min."
                      type="number"
                      value={blockDrafts[pos]?.duration_minutes ?? ""}
                      onChange={(e) =>
                        setBlockDrafts({
                          ...blockDrafts,
                          [pos]: { ...blockDrafts[pos], duration_minutes: e.target.value },
                        })
                      }
                      onBlur={() => saveBlock(pos)}
                    />
                    <textarea
                      className="input col-span-3"
                      rows={1}
                      placeholder="Détails"
                      value={blockDrafts[pos]?.description ?? ""}
                      onChange={(e) =>
                        setBlockDrafts({
                          ...blockDrafts,
                          [pos]: { ...blockDrafts[pos], description: e.target.value },
                        })
                      }
                      onBlur={() => saveBlock(pos)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      </div>
      )}
    </div>
  );
}
