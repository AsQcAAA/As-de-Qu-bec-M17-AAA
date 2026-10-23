"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";

interface Contact {
  id: string;
  full_name: string;
  email: string;
}

interface CoachMeeting {
  id: string;
  coach_id: string;
  meeting_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  topic: string | null;
  notes: string | null;
  invite_sent_at: string | null;
  cancelled_at: string | null;
}
interface CoachNote {
  id: string;
  coach_id: string;
  note: string;
  created_at: string;
}

const hm = (t: string | null) => (t ? t.slice(0, 5).replace(":", "h") : "");
const plusMinutes = (t: string, mins: number) => {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const emptyForm = (date: string) => ({ coach_id: "", date, start: "13:00", end: "13:30", location: "", topic: "", send: true });

export default function SuiviCoachPage() {
  const supabase = createClient();
  const [coaches, setCoaches] = useState<Contact[]>([]);
  const [newCoach, setNewCoach] = useState({ name: "", email: "" });
  const [meetings, setMeetings] = useState<CoachMeeting[]>([]);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date());
  const [form, setForm] = useState(emptyForm(format(new Date(), "yyyy-MM-dd")));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [noteCoach, setNoteCoach] = useState("");
  const [noteText, setNoteText] = useState("");

  async function load() {
    const [{ data: cs }, { data: ms, error: e1 }, { data: ns }] = await Promise.all([
      supabase.from("coach_contacts").select("*").order("full_name"),
      supabase.from("coach_meetings").select("*").order("meeting_date").order("start_time"),
      supabase.from("coach_notes").select("*").order("created_at", { ascending: false }),
    ]);
    if (e1) setMessage({ kind: "error", text: "Le suivi de coach n'est pas prêt (migration 054 à exécuter)." });
    setCoaches((cs ?? []) as Contact[]);
    setMeetings((ms ?? []) as CoachMeeting[]);
    setNotes((ns ?? []) as CoachNote[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameOf = (id: string) => coaches.find((c) => c.id === id)?.full_name ?? "Entraîneur";
  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = meetings.filter((m) => m.meeting_date >= today && !m.cancelled_at);
  const past = meetings.filter((m) => m.meeting_date < today || m.cancelled_at).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }),
    [month]
  );
  const byDate = useMemo(() => {
    const m = new Map<string, CoachMeeting[]>();
    for (const x of meetings.filter((y) => !y.cancelled_at)) m.set(x.meeting_date, [...(m.get(x.meeting_date) ?? []), x]);
    return m;
  }, [meetings]);

  async function sendInvite(id: string, action: "invite" | "cancel") {
    const res = await fetch("/api/coach-meetings/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: id, action }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Envoi impossible.");
    return json.to as string;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.coach_id) {
      setMessage({ kind: "error", text: "Choisis un entraîneur." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const row = {
        coach_id: form.coach_id,
        meeting_date: form.date,
        start_time: form.start,
        end_time: form.end || null,
        location: form.location.trim() || null,
        topic: form.topic.trim() || null,
      };
      let id = editingId;
      if (editingId) {
        const { error } = await supabase.from("coach_meetings").update(row).eq("id", editingId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from("coach_meetings").insert(row).select("id").single();
        if (error) throw new Error(error.message);
        id = data.id as string;
      }
      let text = editingId ? "Rencontre mise à jour." : "Rencontre ajoutée au calendrier.";
      if (form.send && id) {
        const to = await sendInvite(id, "invite");
        text += ` Invitation ${editingId ? "mise à jour " : ""}envoyée à ${to}.`;
      }
      setMessage({ kind: "ok", text });
      setEditingId(null);
      setForm(emptyForm(form.date));
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Erreur." });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(m: CoachMeeting) {
    setEditingId(m.id);
    setForm({ coach_id: m.coach_id, date: m.meeting_date, start: m.start_time.slice(0, 5), end: m.end_time?.slice(0, 5) ?? "", location: m.location ?? "", topic: m.topic ?? "", send: !!m.invite_sent_at });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function cancelMeeting(m: CoachMeeting) {
    if (!window.confirm(`Annuler la rencontre avec ${nameOf(m.coach_id)} le ${m.meeting_date} ?${m.invite_sent_at ? " Un courriel d'annulation lui sera envoyé." : ""}`)) return;
    try {
      if (m.invite_sent_at) await sendInvite(m.id, "cancel");
      else await supabase.from("coach_meetings").update({ cancelled_at: new Date().toISOString() }).eq("id", m.id);
      setMessage({ kind: "ok", text: "Rencontre annulée." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Erreur." });
    }
    await load();
  }

  async function resend(m: CoachMeeting) {
    try {
      const to = await sendInvite(m.id, "invite");
      setMessage({ kind: "ok", text: `Invitation envoyée à ${to}.` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Erreur." });
    }
    await load();
  }

  async function saveMeetingNotes(id: string, value: string) {
    await supabase.from("coach_meetings").update({ notes: value.trim() || null }).eq("id", id);
  }

  async function addCoach(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("coach_contacts").insert({ full_name: newCoach.name.trim(), email: newCoach.email.trim().toLowerCase() });
    if (error) {
      setMessage({ kind: "error", text: error.message });
      return;
    }
    setNewCoach({ name: "", email: "" });
    setMessage({ kind: "ok", text: "Entraîneur ajouté." });
    await load();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteCoach || !noteText.trim()) return;
    await supabase.from("coach_notes").insert({ coach_id: noteCoach, note: noteText.trim() });
    setNoteText("");
    await load();
  }

  const MeetingRow = ({ m, isPast }: { m: CoachMeeting; isPast: boolean }) => (
    <div className={`card space-y-2 ${m.cancelled_at ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold">
            {nameOf(m.coach_id)} — <span className="capitalize">{format(parseISO(m.meeting_date), "EEEE d MMMM", { locale: fr })}</span>, {hm(m.start_time)}
            {m.end_time ? ` à ${hm(m.end_time)}` : ""}
            {m.cancelled_at && <span className="ml-2 text-xs font-bold text-red-600">Annulée</span>}
          </div>
          <div className="text-sm text-slate-500">
            {[m.location, m.topic].filter(Boolean).join(" · ") || "Aucun lieu ni sujet"}
          </div>
          <div className="text-xs text-slate-400">
            {m.invite_sent_at ? `Invitation envoyée le ${format(parseISO(m.invite_sent_at), "d MMM à HH:mm", { locale: fr })}` : "Invitation non envoyée"}
          </div>
        </div>
        {!m.cancelled_at && (
          <div className="flex gap-3 text-xs shrink-0">
            <button className="text-ink-800 hover:underline" onClick={() => startEdit(m)}>
              Modifier
            </button>
            <button className="text-ink-800 hover:underline" onClick={() => resend(m)}>
              {m.invite_sent_at ? "Renvoyer l'invitation" : "Envoyer l'invitation"}
            </button>
            <button className="text-red-600 hover:underline" onClick={() => cancelMeeting(m)}>
              Annuler
            </button>
          </div>
        )}
      </div>
      {isPast && !m.cancelled_at && (
        <textarea
          className="input text-sm"
          rows={2}
          placeholder="Compte rendu de la rencontre…"
          defaultValue={m.notes ?? ""}
          onBlur={(e) => saveMeetingNotes(m.id, e.target.value)}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Suivi de coach</h1>
          <p className="text-slate-400 text-sm">
            Rencontres individuelles avec les entraîneurs, calendrier et notes. Visible seulement par toi. Les invitations partent par courriel avec un fichier
            d&apos;agenda que l&apos;entraîneur accepte d&apos;un clic.
          </p>
        </div>
        <Link href="/direction-generale" className="btn-dark">
          ← Direction générale
        </Link>
      </div>

      {message && (
        <p className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "ok" ? "border-green-400/50 bg-green-500/15 text-green-100" : "border-amber-400/50 bg-amber-500/15 text-amber-100"}`}>
          {message.text}
        </p>
      )}

      <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-6 items-end">
        <div className="sm:col-span-6 font-semibold">{editingId ? "Modifier la rencontre" : "Booker une rencontre"}</div>
        <div className="sm:col-span-2">
          <label className="label">Entraîneur</label>
          <select className="input" value={form.coach_id} onChange={(e) => setForm({ ...form, coach_id: e.target.value })} required>
            <option value="">—</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Date</label>
          <input type="date" required className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div>
          <label className="label">Début</label>
          <input type="time" required className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, end: plusMinutes(e.target.value, 30) })} />
        </div>
        <div>
          <label className="label">Fin</label>
          <input type="time" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <div className="sm:col-span-3">
          <label className="label">Lieu</label>
          <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Bureau, Salle 117, Teams…" />
        </div>
        <div className="sm:col-span-3">
          <label className="label">Sujet</label>
          <input className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Ex. suivi de saison, développement des gardiens…" />
        </div>
        <label className="sm:col-span-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.send} onChange={(e) => setForm({ ...form, send: e.target.checked })} />
          Envoyer l&apos;invitation par courriel à l&apos;entraîneur
        </label>
        <div className="sm:col-span-2 flex gap-2 justify-end">
          {editingId && (
            <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setForm(emptyForm(form.date)); }}>
              Annuler
            </button>
          )}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Enregistrement…" : editingId ? "Enregistrer" : "Booker"}
          </button>
        </div>
      </form>

      {/* Calendrier des rencontres : un clic sur un jour prépare la date du formulaire. */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-white capitalize">Calendrier — {format(month, "MMMM yyyy", { locale: fr })}</h2>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setMonth(subMonths(month, 1))}>←</button>
            <button className="btn-secondary" onClick={() => setMonth(new Date())}>Aujourd&apos;hui</button>
            <button className="btn-secondary" onClick={() => setMonth(addMonths(month, 1))}>→</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-300">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const list = byDate.get(key) ?? [];
            return (
              <button
                key={key}
                onClick={() => { setForm({ ...form, date: key }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={`flex min-h-[78px] flex-col rounded-lg border p-1.5 text-left text-xs transition-colors hover:border-gold-500 ${isSameMonth(d, month) ? "bg-white text-slate-900" : "bg-slate-700 text-slate-400"} ${key === today ? "ring-2 ring-gold-400" : ""}`}
              >
                <span className="font-black">{format(d, "d")}</span>
                {list.map((m) => (
                  <span key={m.id} className="mt-0.5 truncate rounded bg-gold-100 px-1 text-[10px] font-bold text-gold-900">
                    {hm(m.start_time)} {nameOf(m.coach_id).split(" ")[0]}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white">À venir ({upcoming.length})</h2>
        {loading ? <p className="text-slate-300">Chargement...</p> : upcoming.length === 0 ? <p className="text-sm text-slate-400">Aucune rencontre prévue.</p> : upcoming.map((m) => <MeetingRow key={m.id} m={m} isPast={false} />)}
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Passées</h2>
          {past.map((m) => (
            <MeetingRow key={m.id} m={m} isPast />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Entraîneurs ({coaches.length})</h2>
        <div className="card space-y-2">
          {coaches.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1 last:border-0 text-sm">
              <span className="font-semibold">{c.full_name}</span>
              <span className="text-slate-500">{c.email}</span>
            </div>
          ))}
          <form onSubmit={addCoach} className="grid gap-2 pt-2 sm:grid-cols-3">
            <input className="input" required placeholder="Nom" value={newCoach.name} onChange={(e) => setNewCoach({ ...newCoach, name: e.target.value })} />
            <input className="input" required type="email" placeholder="Courriel" value={newCoach.email} onChange={(e) => setNewCoach({ ...newCoach, email: e.target.value })} />
            <button type="submit" className="btn-secondary">
              + Ajouter un entraîneur
            </button>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Notes par entraîneur</h2>
        <form onSubmit={addNote} className="card grid gap-3 sm:grid-cols-4 items-end">
          <div>
            <label className="label">Entraîneur</label>
            <select className="input" value={noteCoach} onChange={(e) => setNoteCoach(e.target.value)} required>
              <option value="">—</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Note</label>
            <input className="input" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Observation, point à suivre…" />
          </div>
          <button type="submit" className="btn">
            Ajouter la note
          </button>
        </form>
        {coaches.map((c) => {
          const list = notes.filter((n) => n.coach_id === c.id);
          if (list.length === 0) return null;
          return (
            <div key={c.id} className="card space-y-1.5">
              <div className="font-semibold">{c.full_name}</div>
              {list.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-1 last:border-0 text-sm">
                  <div>
                    <span className="text-xs text-slate-400">{format(parseISO(n.created_at), "d MMM yyyy", { locale: fr })} · </span>
                    {n.note}
                  </div>
                  <button className="shrink-0 text-xs text-red-600 hover:underline" onClick={async () => { await supabase.from("coach_notes").delete().eq("id", n.id); await load(); }}>
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
