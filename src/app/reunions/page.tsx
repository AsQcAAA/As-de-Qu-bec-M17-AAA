"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { computeMeetingStatuses, OVERDUE_DAYS } from "@/lib/meetings";
import { useCoachDirectory } from "@/lib/useCoach";
import type { Meeting, MeetingType, Player, TeamBuildingLog } from "@/lib/types";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

/** "2026-09-30" → "mer. 2026-09-30". */
function withWeekday(dateStr: string): string {
  return `${format(parseISO(dateStr), "EEE", { locale: fr })}. ${dateStr}`;
}

type LogType = MeetingType | "team_building";

const emptyForm = {
  meeting_date: todayStr(),
  meeting_type: "individual" as LogType,
  player_id: "",
  topic: "",
  notes: "",
};

export default function ReunionsPage() {
  const supabase = createClient();
  const { myId, isHeadCoach, authorLabel } = useCoachDirectory();
  const [players, setPlayers] = useState<Player[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [teamBuildingLogs, setTeamBuildingLogs] = useState<TeamBuildingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [individualFilter, setIndividualFilter] = useState("all");
  const [showTbForm, setShowTbForm] = useState(false);
  const [tbDraft, setTbDraft] = useState({ log_date: todayStr(), theme: "", notes: "" });

  async function load() {
    const [{ data: pls }, { data: mts }, { data: tbl }] = await Promise.all([
      supabase.from("players").select("*").eq("is_call_up", false).order("jersey_number"),
      supabase.from("meetings").select("*").order("meeting_date", { ascending: false }),
      supabase.from("team_building_log").select("*").order("log_date", { ascending: false }),
    ]);
    setPlayers(pls ?? []);
    setMeetings(mts ?? []);
    setTeamBuildingLogs(tbl ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function removeMeeting(id: string) {
    await supabase.from("meetings").delete().eq("id", id);
    load();
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ meeting_date: "", topic: "", notes: "" });

  function startEdit(m: Meeting) {
    setEditingId(m.id);
    setEditDraft({ meeting_date: m.meeting_date, topic: m.topic ?? "", notes: m.notes ?? "" });
  }

  async function saveEdit(id: string) {
    await supabase
      .from("meetings")
      .update({
        meeting_date: editDraft.meeting_date,
        topic: editDraft.topic || null,
        notes: editDraft.notes || null,
        updated_by: myId,
      })
      .eq("id", id);
    setEditingId(null);
    load();
  }

  async function addTeamBuildingLog(e: React.FormEvent) {
    e.preventDefault();
    await supabase
      .from("team_building_log")
      .upsert({ log_date: tbDraft.log_date, theme: tbDraft.theme || null, notes: tbDraft.notes || null }, { onConflict: "log_date" });
    setTbDraft({ log_date: todayStr(), theme: "", notes: "" });
    setShowTbForm(false);
    load();
  }

  async function removeTeamBuildingLog(logDate: string) {
    await supabase.from("team_building_log").delete().eq("log_date", logDate);
    load();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.meeting_type === "team_building") {
      await supabase
        .from("team_building_log")
        .upsert({ log_date: form.meeting_date, theme: form.topic || null, notes: form.notes || null }, { onConflict: "log_date" });
    } else {
      await supabase.from("meetings").insert({
        meeting_date: form.meeting_date,
        meeting_type: form.meeting_type,
        player_id: form.meeting_type === "individual" ? form.player_id || null : null,
        topic: form.topic || null,
        notes: form.notes || null,
        updated_by: myId,
      });
    }
    setForm({ ...emptyForm, meeting_date: form.meeting_date });
    load();
  }

  const nameById = new Map(players.map((p) => [p.id, p.full_name]));
  const statuses = useMemo(() => computeMeetingStatuses(players, meetings), [players, meetings]);
  const statusesByJersey = useMemo(
    () => [...statuses].sort((a, b) => (a.player.jersey_number ?? 999) - (b.player.jersey_number ?? 999)),
    [statuses]
  );
  const individualMeetings = meetings
    .filter((m) => m.meeting_type === "individual")
    .filter((m) => individualFilter === "all" || m.player_id === individualFilter);
  const collectiveMeetings = meetings.filter((m) => m.meeting_type === "collective");

  function renderMeetingItem(m: Meeting) {
    if (editingId === m.id) {
      return (
        <div key={m.id} className="card space-y-2 py-3">
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={editDraft.meeting_date}
                onChange={(e) => setEditDraft({ ...editDraft, meeting_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Sujet</label>
              <input
                className="input"
                value={editDraft.topic}
                onChange={(e) => setEditDraft({ ...editDraft, topic: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={editDraft.notes}
              onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => saveEdit(m.id)} className="btn text-sm">
              Enregistrer
            </button>
            <button onClick={() => setEditingId(null)} className="btn-secondary text-sm">
              Annuler
            </button>
          </div>
        </div>
      );
    }
    return (
      <div key={m.id} className="card flex items-center justify-between gap-3 py-3">
        <div>
          <span className="font-medium">{m.meeting_type === "individual" ? nameById.get(m.player_id ?? "") ?? "?" : "Équipe"}</span>
          {m.topic ? <span className="text-slate-500"> — {m.topic}</span> : null}
          {isHeadCoach && authorLabel(m.updated_by) && (
            <span className="text-xs text-slate-400"> · par {authorLabel(m.updated_by)}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-slate-500">{withWeekday(m.meeting_date)}</span>
          <button onClick={() => startEdit(m)} className="text-xs text-ink-800 hover:underline">
            Modifier
          </button>
          <button onClick={() => removeMeeting(m.id)} className="text-xs text-red-600 hover:underline">
            Retirer
          </button>
        </div>
      </div>
    );
  }

  const individualCount = meetings.filter((m) => m.meeting_type === "individual").length;
  const collectiveCount = meetings.filter((m) => m.meeting_type === "collective").length;

  const countsByPlayer = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meetings) {
      if (m.meeting_type === "individual" && m.player_id) {
        map.set(m.player_id, (map.get(m.player_id) ?? 0) + 1);
      }
    }
    return map;
  }, [meetings]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meeting</h1>
        <p className="text-slate-500 text-sm">
          Cumulatif de saison : {individualCount} rencontres individuelles, {collectiveCount} rencontres collectives.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card grid sm:grid-cols-2 gap-3">
        <h2 className="font-semibold sm:col-span-2">Loguer une rencontre</h2>
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            required
            className="input"
            value={form.meeting_date}
            onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Type</label>
          <select
            className="input"
            value={form.meeting_type}
            onChange={(e) => setForm({ ...form, meeting_type: e.target.value as LogType })}
          >
            <option value="individual">Individuelle</option>
            <option value="collective">Collective</option>
            <option value="team_building">Team Building</option>
          </select>
        </div>
        {form.meeting_type === "individual" && (
          <div className="sm:col-span-2">
            <label className="label">Joueur</label>
            <select
              required
              className="input"
              value={form.player_id}
              onChange={(e) => setForm({ ...form, player_id: e.target.value })}
            >
              <option value="">— Choisir —</option>
              {players
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.jersey_number ? `#${p.jersey_number} ` : ""}
                    {p.full_name}
                  </option>
                ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">{form.meeting_type === "team_building" ? "Thème" : "Sujet"}</label>
          <input className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea
            className="input"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn">
            {form.meeting_type === "team_building" ? "Enregistrer le Team Building" : "Enregistrer la rencontre"}
          </button>
        </div>
      </form>

      <div>
        <h2 className="font-semibold mb-3">Suivi par joueur — rappel après {OVERDUE_DAYS} jours</h2>
        {loading ? (
          <p className="text-slate-500">Chargement...</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Joueur</th>
                  <th className="py-2 pr-4">Rencontres (total)</th>
                  <th className="py-2 pr-4">Dernière rencontre</th>
                  <th className="py-2 pr-4">Statut</th>
                </tr>
              </thead>
              <tbody>
                {statusesByJersey.map((s) => (
                  <tr
                    key={s.player.id}
                    onClick={() => (window.location.href = `/joueurs/${s.player.id}`)}
                    className="border-b last:border-0 cursor-pointer hover:bg-slate-50"
                  >
                    <td className="py-2 pr-4">
                      <Link href={`/joueurs/${s.player.id}`} className="hover:underline hover:text-gold-700">
                        {s.player.jersey_number ? `#${s.player.jersey_number} ` : ""}
                        {s.player.full_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{countsByPlayer.get(s.player.id) ?? 0}</td>
                    <td className="py-2 pr-4">{s.lastMeetingDate ?? "Jamais"}</td>
                    <td className="py-2 pr-4">
                      {s.overdue ? (
                        <span className="badge bg-red-100 text-red-800">
                          En retard{s.daysSince !== null ? ` (${s.daysSince}j)` : ""}
                        </span>
                      ) : (
                        <span className="badge bg-green-100 text-green-800">À jour ({s.daysSince}j)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="font-semibold mb-3">Historique</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-400">Individuelles</h3>
              <select
                className="input w-auto text-sm"
                value={individualFilter}
                onChange={(e) => setIndividualFilter(e.target.value)}
              >
                <option value="all">Tous les joueurs</option>
                {players
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.jersey_number ? `#${p.jersey_number} ` : ""}
                      {p.full_name}
                    </option>
                  ))}
              </select>
            </div>
            {individualMeetings.length === 0 ? (
              <p className="text-xs text-slate-400">Aucune rencontre individuelle enregistrée.</p>
            ) : (
              individualMeetings.map(renderMeetingItem)
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-400">Collectives</h3>
            {collectiveMeetings.length === 0 ? (
              <p className="text-xs text-slate-400">Aucune rencontre collective enregistrée.</p>
            ) : (
              collectiveMeetings.map(renderMeetingItem)
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="font-semibold">Team Building — thèmes et notes</h2>
          <button className="btn-secondary text-sm" onClick={() => setShowTbForm((s) => !s)}>
            {showTbForm ? "Annuler" : "+ Ajouter un Team Building"}
          </button>
        </div>
        {showTbForm && (
          <form onSubmit={addTeamBuildingLog} className="card grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                required
                className="input"
                value={tbDraft.log_date}
                onChange={(e) => setTbDraft({ ...tbDraft, log_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Thème</label>
              <input
                className="input"
                value={tbDraft.theme}
                onChange={(e) => setTbDraft({ ...tbDraft, theme: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea
                className="input"
                rows={2}
                value={tbDraft.notes}
                onChange={(e) => setTbDraft({ ...tbDraft, notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn">
                Enregistrer
              </button>
            </div>
          </form>
        )}
        {teamBuildingLogs.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune activité Team Building enregistrée.</p>
        ) : (
          <div className="space-y-2">
            {teamBuildingLogs.map((t) => (
              <div key={t.log_date} className="card flex items-center justify-between gap-3 py-3">
                <div>
                  <span className="font-medium">{t.theme || "(sans thème)"}</span>
                  {t.notes ? <span className="text-slate-500"> — {t.notes}</span> : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">{withWeekday(t.log_date)}</span>
                  <button onClick={() => removeTeamBuildingLog(t.log_date)} className="text-xs text-red-600 hover:underline">
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
