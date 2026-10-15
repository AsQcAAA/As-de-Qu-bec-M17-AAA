"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import TeamBuildingTeams, { emptyTeams } from "@/components/TeamBuildingTeams";
import type { Player, ScheduleEvent, TeamBuildingLog, TeamBuildingTeam } from "@/lib/types";

const todayKey = () => format(new Date(), "yyyy-MM-dd");

interface Session {
  date: string;
  /** Événement au calendrier (heure, titre), s'il y en a un. */
  event: ScheduleEvent | null;
  log: TeamBuildingLog | null;
}

/**
 * Onglet Team Building : toutes les activités, à venir et passées, au même
 * endroit — celles prévues au calendrier et celles notées après coup (thème et
 * notes). Les notes sont les mêmes que celles saisies depuis l'accueil.
 */
export default function TeamBuildingPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [logs, setLogs] = useState<TeamBuildingLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamsOpen, setTeamsOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ theme: "", notes: "" });
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState(todayKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [{ data: evts }, { data: lgs }, { data: pls }] = await Promise.all([
      supabase.from("schedule_events").select("*").eq("event_type", "team_building"),
      supabase.from("team_building_log").select("*"),
      supabase.from("players").select("*").eq("active", true).eq("is_call_up", false).order("jersey_number"),
    ]);
    setPlayers((pls ?? []) as Player[]);
    setEvents((evts ?? []) as ScheduleEvent[]);
    setLogs((lgs ?? []) as TeamBuildingLog[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessions = useMemo<Session[]>(() => {
    const dates = new Set<string>([...events.map((e) => e.event_date), ...logs.map((l) => l.log_date)]);
    return [...dates]
      .map((date) => ({
        date,
        event: events.find((e) => e.event_date === date) ?? null,
        log: logs.find((l) => l.log_date === date) ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, logs]);

  const today = todayKey();
  const upcoming = sessions.filter((s) => s.date >= today);
  const past = sessions.filter((s) => s.date < today).reverse();

  function startEdit(s: Session) {
    setEditing(s.date);
    setDraft({ theme: s.log?.theme ?? "", notes: s.log?.notes ?? "" });
    setError(null);
  }

  async function save(date: string) {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("team_building_log")
      .upsert({ log_date: date, theme: draft.theme.trim() || null, notes: draft.notes.trim() || null }, { onConflict: "log_date" });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(null);
    setAdding(false);
    load();
  }

  /** Enregistre les équipes d'une séance à chaque geste (glisser, pointage…). */
  async function saveTeams(date: string, teams: TeamBuildingTeam[]) {
    setLogs((prev) => {
      const exists = prev.some((l) => l.log_date === date);
      return exists
        ? prev.map((l) => (l.log_date === date ? { ...l, teams } : l))
        : [...prev, { log_date: date, theme: null, notes: null, teams, created_at: new Date().toISOString() }];
    });
    const { error: err } = await supabase.from("team_building_log").upsert({ log_date: date, teams }, { onConflict: "log_date" });
    setError(err ? `Équipes non enregistrées (${err.message}) — la migration 039 est-elle exécutée ?` : null);
  }

  async function remove(date: string) {
    if (!window.confirm("Retirer le thème et les notes de cette séance ?")) return;
    await supabase.from("team_building_log").delete().eq("log_date", date);
    load();
  }

  function renderCard(s: Session) {
    const isEditing = editing === s.date;
    return (
      <div key={s.date} className="card space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-bold capitalize">{format(parseISO(s.date), "EEEE d MMMM yyyy", { locale: fr })}</div>
            {s.event && (
              <div className="text-xs text-slate-500">
                {s.event.start_time ? `${s.event.start_time.slice(0, 5)} — ` : ""}
                {s.event.title}
                {s.event.location ? ` (${s.event.location})` : ""}
              </div>
            )}
          </div>
          {!isEditing && (
            <div className="flex gap-3 text-sm">
              <button className="text-ink-800 hover:text-gold-700 hover:underline font-medium" onClick={() => startEdit(s)}>
                {s.log ? "Modifier" : "+ Thème et notes"}
              </button>
              {s.log && (
                <button className="text-red-600 hover:underline" onClick={() => remove(s.date)}>
                  Retirer
                </button>
              )}
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <input className="input" placeholder="Thème de l'activité" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })} autoFocus />
            <textarea className="input" rows={3} placeholder="Notes (déroulement, ce qui a fonctionné…)" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button className="btn" disabled={saving} onClick={() => save(s.date)}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                Annuler
              </button>
            </div>
          </div>
        ) : s.log && (s.log.theme || s.log.notes) ? (
          <div className="text-sm space-y-1">
            {s.log.theme && <div className="font-semibold">{s.log.theme}</div>}
            {s.log.notes && <div className="text-slate-600 whitespace-pre-line">{s.log.notes}</div>}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{s.date >= today ? "Thème à définir." : "Aucun thème ni note enregistrés."}</p>
        )}

        {/* Équipes et pointage */}
        {(() => {
          const teams = s.log?.teams && s.log.teams.length === 3 ? s.log.teams : emptyTeams();
          const hasTeams = teams.some((t) => t.captain_id || t.member_ids.length > 0 || t.score > 0);
          const open = teamsOpen.has(s.date) || hasTeams;
          return open ? (
            <div className="pt-2 border-t space-y-2">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">🏆 Équipes et pointage</div>
              <TeamBuildingTeams players={players} teams={teams} onChange={(next) => saveTeams(s.date, next)} />
            </div>
          ) : (
            <button
              className="btn-secondary text-sm w-fit"
              onClick={() => setTeamsOpen((prev) => new Set(prev).add(s.date))}
            >
              🏆 Former les 3 équipes
            </button>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team Building</h1>
          <p className="text-slate-400 text-sm">Les activités prévues au calendrier et celles déjà faites, avec leur thème et leurs notes.</p>
        </div>
        <button className="btn" onClick={() => setAdding((v) => !v)}>
          {adding ? "Annuler" : "+ Ajouter une séance"}
        </button>
      </div>

      {error && !adding && editing === null && <p className="rounded-lg bg-red-500/15 border border-red-400/40 px-3 py-2 text-sm text-red-200">{error}</p>}

      {adding && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Nouvelle séance</h2>
          <div className="grid sm:grid-cols-4 gap-2">
            <input type="date" className="input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <input className="input sm:col-span-3" placeholder="Thème de l'activité" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })} />
          </div>
          <textarea className="input" rows={3} placeholder="Notes (optionnel)" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn" disabled={saving || !newDate} onClick={() => save(newDate)}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune séance de Team Building pour l&apos;instant. Ajoute-en une, ou planifie-en une au calendrier.</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-gold-400">À venir ({upcoming.length})</h2>
            {upcoming.length === 0 ? <p className="text-sm text-slate-400">Aucune séance à venir.</p> : upcoming.map(renderCard)}
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-gold-400">Passées ({past.length})</h2>
            {past.length === 0 ? <p className="text-sm text-slate-400">Aucune séance passée.</p> : past.map(renderCard)}
          </section>
        </>
      )}
    </div>
  );
}
